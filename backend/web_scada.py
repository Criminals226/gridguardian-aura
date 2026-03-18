"""
Smart Grid SCADA Backend Server
Digital Twin Simulation + Real MQTT Hardware Override
Run with: python web_scada.py
"""

import os
import json
import math
import random
import threading
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, redirect, url_for, session, send_from_directory
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False
    print("⚠️  paho-mqtt not installed. Run: pip install paho-mqtt")

# ─────────────────────────────────────────────────────────────
# Flask App Configuration
# ─────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='dist', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'scada-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///scada.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ─────────────────────────────────────────────────────────────
# MQTT Configuration
# ─────────────────────────────────────────────────────────────
BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC_ROOT = "fyp_grid_99/#"
TOPIC_CONTROL = "fyp_grid_99/grid/control"
TOPIC_BILL = "fyp_grid_99/meter/bill"

mqtt_client = None

# ─────────────────────────────────────────────────────────────
# Database Models
# ─────────────────────────────────────────────────────────────
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='operator')
    full_name = db.Column(db.String(120), nullable=False)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class GridData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    gen_mw = db.Column(db.Float, default=0)
    load_mw = db.Column(db.Float, default=0)
    voltage = db.Column(db.Float, default=230)
    frequency = db.Column(db.Float, default=50)
    security_level = db.Column(db.String(20), default='normal')
    attack_score = db.Column(db.Float, default=0)


class ThreatLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    decision_id = db.Column(db.String(50))
    action = db.Column(db.String(20))
    layer = db.Column(db.String(50))
    category = db.Column(db.String(50))
    subcategory = db.Column(db.String(50))
    severity = db.Column(db.String(20))
    explanation = db.Column(db.Text)
    metadata_json = db.Column(db.Text, default='{}')


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    action = db.Column(db.String(100))
    username = db.Column(db.String(80))
    details_json = db.Column(db.Text, default='{}')


# ─────────────────────────────────────────────────────────────
# Hardware State (populated by real MQTT data)
# ─────────────────────────────────────────────────────────────
HARDWARE_TIMEOUT_SECONDS = 10

hardware_state = {
    'online': False,
    'gen_w': 0.0,
    'rpm': 0,
    'status': 'offline',
    'load_w': 0.0,
    'voltage': None,
    'frequency': None,
    'area1': None,
    'area2': None,
    'last_message_time': 0,
}

# ─────────────────────────────────────────────────────────────
# Simulated System State (digital twin)
# ─────────────────────────────────────────────────────────────
system_state = {
    'gen_mw': 0.0,       # generation in watts (named gen_mw for frontend compat)
    'gen_rpm': 3000,
    'status': 'ONLINE',
    'load_mw': 0.0,      # load in watts
    'voltage': 230.0,
    'frequency': 50.0,
    'area1': 'ON',
    'area2': 'ON',
    'calculated_bill': 0.0,
    'security_level': 'NORMAL',
    'system_locked': False,
    'mqtt_connected': False,
    'attack_score': 0,
    'threat_intel_active': True,
    'price_rate': 0.25,
    'last_update': 'Initializing...',
    'data_source': 'simulation',   # 'simulation' or 'hardware'
}

security_stats = {
    'total_inspected': 0,
    'total_blocked': 0,
    'threat_intel_blocks': 0,
}

threat_intel = {
    'enabled': True,
    'total_indicators': 1250,
    'last_refresh': datetime.utcnow().isoformat(),
}

# Grid event state
_active_event = None
_event_end_time = 0


# ─────────────────────────────────────────────────────────────
# Daily Load Curve Model
# ─────────────────────────────────────────────────────────────
def get_base_load_for_hour(hour):
    """Return base load (W) following a realistic daily demand curve."""
    # Piecewise linear interpolation between time-of-day anchor points
    curve = [
        (0, 2000), (6, 2000),      # night: low
        (7, 2800), (9, 3800),      # morning ramp
        (12, 4000),                # late morning
        (13, 5500), (17, 5500),    # afternoon plateau
        (18, 6500), (20, 8000),    # evening peak ramp
        (21, 8000),                # peak
        (22, 5500), (23, 3500),    # evening wind-down
        (24, 2000),                # back to night
    ]
    # Find surrounding anchor points
    for i in range(len(curve) - 1):
        t0, v0 = curve[i]
        t1, v1 = curve[i + 1]
        if t0 <= hour <= t1:
            if t1 == t0:
                return v0
            frac = (hour - t0) / (t1 - t0)
            return v0 + frac * (v1 - v0)
    return 2000  # fallback


def simulate_grid_values():
    """
    Compute realistic simulated grid values based on time-of-day
    load curve and grid physics relationships.
    """
    global _active_event, _event_end_time

    now = datetime.now()
    hour = now.hour + now.minute / 60.0

    # --- Base load from daily curve ---
    base_load = get_base_load_for_hour(hour)

    # --- Step-based fluctuation (mimics smart meter integer steps) ---
    step = random.choice([-500, 0, 500])
    load_w = int(base_load + step)

    # --- Grid Events (random disturbances) ---
    current_time = time.time()

    # Check if active event has expired
    if _active_event and current_time > _event_end_time:
        _active_event = None

    # Randomly trigger a new event (~once every 3-5 minutes at 2s intervals)
    if not _active_event and random.random() < 0.008:  # ~0.8% chance per tick
        event_type = random.choice(['load_spike', 'voltage_dip', 'frequency_drop'])
        if event_type == 'load_spike':
            _active_event = {'type': 'load_spike', 'extra_load': random.choice([500, 1000])}
            _event_end_time = current_time + random.uniform(4, 8)
        elif event_type == 'voltage_dip':
            _active_event = {'type': 'voltage_dip', 'voltage_override': random.uniform(212, 218)}
            _event_end_time = current_time + random.uniform(3, 6)
        elif event_type == 'frequency_drop':
            _active_event = {'type': 'frequency_drop', 'freq_override': random.uniform(49.5, 49.75)}
            _event_end_time = current_time + random.uniform(3, 7)

    # Apply active event
    if _active_event:
        if _active_event['type'] == 'load_spike':
            load_w += _active_event['extra_load']

    # Clamp load to smart meter range (0–20000 W), keep as integer
    load_w = int(max(0, min(20000, load_w)))

    # --- Grid Physics ---
    # Reference base load for physics calculations (midpoint of range)
    ref_base = 4500

    # Frequency: drops when load is high, rises when low
    frequency = 50.0 - ((load_w - ref_base) / 20000.0)
    frequency += random.gauss(0, 0.01)  # tiny noise
    frequency = max(49.8, min(50.2, frequency))

    # Voltage: drops when load is high
    voltage = 230.0 - ((load_w - ref_base) / 500.0)
    voltage += random.gauss(0, 0.3)  # small noise
    voltage = max(220, min(240, voltage))

    # Apply event overrides
    if _active_event:
        if _active_event['type'] == 'voltage_dip':
            voltage = _active_event['voltage_override'] + random.gauss(0, 0.5)
        elif _active_event['type'] == 'frequency_drop':
            frequency = _active_event['freq_override'] + random.gauss(0, 0.02)

    # --- Generation = Load + 3-8% transmission losses ---
    loss_pct = random.uniform(0.03, 0.08)
    generation_w = int(round(load_w * (1 + loss_pct)))

    # RPM: tied to frequency (synchronous speed for 50Hz = 3000 RPM)
    rpm = int((frequency / 50.0) * 3000 + random.gauss(0, 5))
    rpm = max(2980, min(3050, rpm))

    return {
        'load_w': load_w,
        'generation_w': generation_w,
        'voltage': round(voltage, 2),
        'frequency': round(frequency, 3),
        'rpm': rpm,
    }


# ─────────────────────────────────────────────────────────────
# Merged State (simulation + hardware override)
# ─────────────────────────────────────────────────────────────
def merged_state():
    """
    Return the authoritative system state.
    Hardware values override simulation when hardware is online.
    """
    # Check hardware timeout
    if hardware_state['last_message_time'] > 0:
        elapsed = time.time() - hardware_state['last_message_time']
        hardware_state['online'] = elapsed < HARDWARE_TIMEOUT_SECONDS
    else:
        hardware_state['online'] = False

    state = dict(system_state)

    if hardware_state['online']:
        state['data_source'] = 'hardware'
        state['gen_mw'] = hardware_state['gen_w']
        state['gen_rpm'] = hardware_state['rpm']
        state['status'] = hardware_state['status']
        state['load_mw'] = hardware_state['load_w']
        if hardware_state['voltage'] is not None:
            state['voltage'] = hardware_state['voltage']
        if hardware_state['frequency'] is not None:
            state['frequency'] = hardware_state['frequency']
        if hardware_state['area1'] is not None:
            state['area1'] = hardware_state['area1']
        if hardware_state['area2'] is not None:
            state['area2'] = hardware_state['area2']
    else:
        state['data_source'] = 'simulation'

    state['mqtt_connected'] = system_state['mqtt_connected']
    state['last_update'] = time.strftime("%H:%M:%S")
    return state


# ─────────────────────────────────────────────────────────────
# MQTT Callbacks (real hardware data)
# ─────────────────────────────────────────────────────────────
def on_mqtt_connect(client, userdata, flags, rc):
    print(f"✅ Connected to MQTT Broker (RC: {rc})")
    client.subscribe(TOPIC_ROOT)
    system_state['mqtt_connected'] = True
    socketio.emit('mqtt_status', {'connected': True})


def on_mqtt_disconnect(client, userdata, rc):
    print(f"❌ MQTT Disconnected (RC: {rc})")
    system_state['mqtt_connected'] = False
    socketio.emit('mqtt_status', {'connected': False})


def on_mqtt_message(client, userdata, msg):
    try:
        payload = msg.payload.decode()
        data = json.loads(payload)
        hardware_state['last_message_time'] = time.time()
        hardware_state['online'] = True

        if "plant" in msg.topic:
            hardware_state['gen_w'] = float(data.get('gen', 0))
            hardware_state['rpm'] = int(data.get('rpm', 0))
            hardware_state['status'] = data.get('status', 'online')
            if 'voltage' in data:
                hardware_state['voltage'] = float(data['voltage'])
            if 'frequency' in data:
                hardware_state['frequency'] = float(data['frequency'])

        elif "meter/data" in msg.topic:
            hardware_state['load_w'] = float(data.get('load', 0))

        elif "grid/control" in msg.topic:
            if 'area1' in data:
                hardware_state['area1'] = data['area1']
                system_state['area1'] = data['area1']
            if 'area2' in data:
                hardware_state['area2'] = data['area2']
                system_state['area2'] = data['area2']

        elif "meter/bill" in msg.topic:
            if 'bill' in data:
                system_state['calculated_bill'] = float(data['bill'])

        # Broadcast merged state immediately on hardware data
        socketio.emit('state_update', merged_state())

    except Exception as e:
        print(f"⚠️ MQTT parse error: {e}")


# ─────────────────────────────────────────────────────────────
# Authentication Helpers
# ─────────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function


def add_audit_log(action, username, details=None):
    log = AuditLog(
        action=action,
        username=username,
        details_json=json.dumps(details or {})
    )
    db.session.add(log)
    db.session.commit()


# ─────────────────────────────────────────────────────────────
# Authentication Routes
# ─────────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    username = request.form.get('username')
    password = request.form.get('password')

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        session['user_id'] = user.id
        session['username'] = user.username
        session['role'] = user.role
        add_audit_log('LOGIN', username, {'ip': request.remote_addr})
        return redirect('/')

    return jsonify({'error': 'Invalid credentials'}), 401


@app.route('/logout')
def logout():
    username = session.get('username', 'unknown')
    add_audit_log('LOGOUT', username)
    session.clear()
    return redirect('/login')


# ─────────────────────────────────────────────────────────────
# API Routes (all use merged_state)
# ─────────────────────────────────────────────────────────────
@app.route('/api/state')
@login_required
def get_state():
    return jsonify(merged_state())


@app.route('/api/control', methods=['POST'])
@login_required
def control():
    """Send control commands to hardware via MQTT."""
    data = request.get_json()
    action = data.get('action')

    if action == 'toggle_area1':
        new_val = 'OFF' if system_state['area1'] == 'ON' else 'ON'
        send_mqtt_control('area1', new_val)
        add_audit_log('TOGGLE_AREA1', session.get('username', 'unknown'), {'new_state': new_val})
        return jsonify({'success': True, 'area1': new_val})

    elif action == 'toggle_area2':
        new_val = 'OFF' if system_state['area2'] == 'ON' else 'ON'
        send_mqtt_control('area2', new_val)
        add_audit_log('TOGGLE_AREA2', session.get('username', 'unknown'), {'new_state': new_val})
        return jsonify({'success': True, 'area2': new_val})

    return jsonify({'error': 'Unknown action'}), 400


def send_mqtt_control(area, value):
    """Send control command to ESP32 via MQTT."""
    global mqtt_client
    if mqtt_client and system_state['mqtt_connected']:
        payload = json.dumps({area: value})
        mqtt_client.publish(TOPIC_CONTROL, payload, qos=1)
        print(f"📤 MQTT Control: {area} → {value}")
    else:
        system_state[area] = value
        socketio.emit('state_update', merged_state())
        print(f"⚠️ MQTT offline, updated state locally: {area} → {value}")


@app.route('/api/v1/security-status')
@login_required
def get_security_status():
    state = merged_state()
    return jsonify({
        'security_posture': state['security_level'],
        'attack_score': state['attack_score'],
        'stats': security_stats,
        'threat_intel': threat_intel,
        'timestamp': datetime.utcnow().isoformat(),
    })


@app.route('/api/v1/historical-data')
@login_required
def get_historical_data():
    start_str = request.args.get('start')
    end_str = request.args.get('end')

    try:
        start = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        end = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        start = datetime.utcnow() - timedelta(hours=1)
        end = datetime.utcnow()

    data = GridData.query.filter(
        GridData.timestamp >= start,
        GridData.timestamp <= end
    ).order_by(GridData.timestamp.asc()).all()

    return jsonify({
        'start': start.isoformat(),
        'end': end.isoformat(),
        'total_records': len(data),
        'data': [{
            'id': d.id,
            'timestamp': d.timestamp.isoformat(),
            'gen_mw': d.gen_mw,
            'load_mw': d.load_mw,
            'voltage': d.voltage,
            'frequency': d.frequency,
            'security_level': d.security_level,
            'attack_score': d.attack_score,
        } for d in data]
    })


@app.route('/api/get_logs')
@login_required
def get_logs():
    log_type = request.args.get('type', 'threats')
    limit = int(request.args.get('limit', 50))

    if log_type == 'threats':
        logs = ThreatLog.query.order_by(ThreatLog.timestamp.desc()).limit(limit).all()
        return jsonify([{
            'id': log.id,
            'timestamp': log.timestamp.isoformat(),
            'decision_id': log.decision_id,
            'action': log.action,
            'layer': log.layer,
            'threat_classification': {
                'category': log.category,
                'subcategory': log.subcategory,
                'severity': log.severity,
            },
            'explanation': log.explanation,
            'metadata': json.loads(log.metadata_json),
        } for log in logs])
    else:
        logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
        return jsonify([{
            'id': log.id,
            'timestamp': log.timestamp.isoformat(),
            'action': log.action,
            'username': log.username,
            'details': json.loads(log.details_json),
        } for log in logs])


@app.route('/api/get_stats')
@login_required
def get_stats():
    threat_counts = db.session.query(
        ThreatLog.category,
        db.func.count(ThreatLog.id)
    ).group_by(ThreatLog.category).all()

    critical_count = ThreatLog.query.filter_by(severity='critical').count()

    return jsonify({
        'total_threats': ThreatLog.query.count(),
        'critical_threats': critical_count,
        'threats_by_category': {cat: count for cat, count in threat_counts},
        'security_engine_stats': {
            **security_stats,
            'attack_score': system_state['attack_score'],
            'security_posture': system_state['security_level'],
        }
    })


# ─────────────────────────────────────────────────────────────
# Static File Serving (for production)
# ─────────────────────────────────────────────────────────────
@app.route('/')
@app.route('/<path:path>')
def serve_frontend(path=''):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


# ─────────────────────────────────────────────────────────────
# Socket.IO Events
# ─────────────────────────────────────────────────────────────
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    emit('mqtt_status', {'connected': system_state['mqtt_connected']})
    emit('state_update', merged_state())


@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')


# ─────────────────────────────────────────────────────────────
# Simulation Loop (Digital Twin Engine)
# ─────────────────────────────────────────────────────────────
def simulation_loop():
    """
    Background thread that continuously updates simulated grid values.
    Runs every 2 seconds. When hardware is online, simulation still runs
    but merged_state() will prefer hardware values.
    """
    with app.app_context():
        while True:
            # --- Update simulated grid values ---
            sim = simulate_grid_values()
            system_state['gen_mw'] = sim['generation_w']
            system_state['load_mw'] = sim['load_w']
            system_state['voltage'] = sim['voltage']
            system_state['frequency'] = sim['frequency']
            system_state['gen_rpm'] = sim['rpm']
            system_state['status'] = 'ONLINE'

            # --- Billing: gradual accumulation ---
            system_state['calculated_bill'] += sim['load_w'] * 0.000001

            # --- Decay attack score ---
            if system_state['attack_score'] > 0:
                system_state['attack_score'] = max(0, system_state['attack_score'] - 0.5)

            # --- Update security level ---
            score = system_state['attack_score']
            if score >= 70:
                system_state['security_level'] = 'CRITICAL'
            elif score >= 40:
                system_state['security_level'] = 'WARNING'
            else:
                system_state['security_level'] = 'NORMAL'

            # --- Record historical data (~every 20 seconds on average) ---
            if random.random() < 0.1:
                try:
                    state = merged_state()
                    grid_data = GridData(
                        gen_mw=state['gen_mw'],
                        load_mw=state['load_mw'],
                        voltage=state['voltage'],
                        frequency=state['frequency'],
                        security_level=state['security_level'],
                        attack_score=state['attack_score'],
                    )
                    db.session.add(grid_data)
                    db.session.commit()
                except Exception:
                    db.session.rollback()

            security_stats['total_inspected'] += random.randint(1, 5)

            # --- Broadcast merged state to all clients ---
            socketio.emit('state_update', merged_state())

            time.sleep(2)


# ─────────────────────────────────────────────────────────────
# Database Initialization
# ─────────────────────────────────────────────────────────────
def init_db():
    db.create_all()

    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            password_hash=generate_password_hash('admin123'),
            role='admin',
            full_name='System Administrator'
        )
        db.session.add(admin)

    if not User.query.filter_by(username='operator').first():
        operator = User(
            username='operator',
            password_hash=generate_password_hash('operator123'),
            role='operator',
            full_name='Grid Operator'
        )
        db.session.add(operator)

    db.session.commit()


# ─────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    with app.app_context():
        init_db()
        print("✅ Database initialized")

    # Start MQTT connection to real hardware broker
    if MQTT_AVAILABLE:
        mqtt_client = mqtt.Client()
        mqtt_client.on_connect = on_mqtt_connect
        mqtt_client.on_disconnect = on_mqtt_disconnect
        mqtt_client.on_message = on_mqtt_message

        try:
            mqtt_client.connect(BROKER, PORT, 60)
            mqtt_client.loop_start()
            print(f"🔌 Connecting to MQTT broker: {BROKER}:{PORT}")
            print(f"📡 Subscribing to: {TOPIC_ROOT}")
        except Exception as e:
            print(f"⚠️ MQTT connection failed: {e}")
            print("   Server will run without MQTT (simulation mode)")
    else:
        print("⚠️ Running without MQTT (simulation-only mode)")

    # Start simulation engine thread
    sim_thread = threading.Thread(target=simulation_loop, daemon=True)
    sim_thread.start()
    print("🔄 Digital Twin simulation engine started (2s interval)")

    print("\n🚀 Starting SCADA Server on http://localhost:5000")
    print("📋 Default credentials:")
    print("   Admin:    admin / admin123")
    print("   Operator: operator / operator123")
    print(f"\n📡 MQTT Broker: {BROKER}:{PORT}")
    print(f"📡 Topics: {TOPIC_ROOT}")
    print(f"📡 Control: {TOPIC_CONTROL}")
    print("📊 Simulation: Daily load curve + grid physics active")

    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
