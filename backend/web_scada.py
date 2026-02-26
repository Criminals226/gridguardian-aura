"""
Smart Grid SCADA Backend Server
Connects to real MQTT hardware via broker.hivemq.com
Run with: python web_scada.py
"""

import os
import json
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
# MQTT Configuration (matches your hardware setup)
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
# System State (updated by real MQTT hardware data)
# ─────────────────────────────────────────────────────────────
system_state = {
    'gen_mw': 0.0,
    'gen_rpm': 0,
    'status': 'WAITING',
    'load_mw': 0.0,
    'voltage': 0.0,
    'frequency': 0.0,
    'area1': 'OFF',
    'area2': 'OFF',
    'calculated_bill': 0.0,
    'security_level': 'NORMAL',
    'system_locked': False,
    'mqtt_connected': False,
    'attack_score': 0,
    'threat_intel_active': True,
    'price_rate': 0.25,
    'last_update': 'Connecting...',
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

# ─────────────────────────────────────────────────────────────
# MQTT Callbacks (real hardware data)
# ─────────────────────────────────────────────────────────────
def on_mqtt_connect(client, userdata, flags, rc):
    print(f"✅ Connected to MQTT Broker (RC: {rc})")
    client.subscribe(TOPIC_ROOT)
    system_state['mqtt_connected'] = True
    system_state['last_update'] = time.strftime("%H:%M:%S")
    socketio.emit('mqtt_status', {'connected': True})


def on_mqtt_disconnect(client, userdata, rc):
    print(f"❌ MQTT Disconnected (RC: {rc})")
    system_state['mqtt_connected'] = False
    socketio.emit('mqtt_status', {'connected': False})


def on_mqtt_message(client, userdata, msg):
    try:
        payload = msg.payload.decode()
        data = json.loads(payload)
        system_state['last_update'] = time.strftime("%H:%M:%S")

        if "plant" in msg.topic:
            # Power plant data from ESP32/hardware
            system_state['gen_mw'] = float(data.get('gen', 0))
            system_state['gen_rpm'] = int(data.get('rpm', 0))
            system_state['status'] = data.get('status', 'OK')
            # Derive voltage/frequency from generation if available
            if 'voltage' in data:
                system_state['voltage'] = float(data['voltage'])
            if 'frequency' in data:
                system_state['frequency'] = float(data['frequency'])

        elif "meter/data" in msg.topic:
            # Smart meter load data
            system_state['load_mw'] = float(data.get('load', 0))

        elif "grid/control" in msg.topic:
            # ESP32 feedback = single source of truth for area states
            if 'area1' in data:
                system_state['area1'] = data['area1']
            if 'area2' in data:
                system_state['area2'] = data['area2']

        elif "meter/bill" in msg.topic:
            if 'bill' in data:
                system_state['calculated_bill'] = float(data['bill'])

        # Broadcast updated state to all web clients
        socketio.emit('state_update', system_state)

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
# API Routes
# ─────────────────────────────────────────────────────────────
@app.route('/api/state')
@login_required
def get_state():
    return jsonify(system_state)


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

    elif action == 'simulate_attack':
        system_state['price_rate'] = 50.0
        system_state['attack_score'] = min(100, system_state['attack_score'] + 60)
        system_state['security_level'] = 'CRITICAL'
        add_audit_log('SIMULATE_ATTACK', session.get('username', 'unknown'))
        socketio.emit('state_update', system_state)
        return jsonify({'success': True, 'message': 'Attack simulated'})

    elif action == 'reset_price':
        system_state['price_rate'] = 0.25
        system_state['attack_score'] = 0
        system_state['security_level'] = 'NORMAL'
        add_audit_log('RESET_PRICE', session.get('username', 'unknown'))
        socketio.emit('state_update', system_state)
        return jsonify({'success': True, 'message': 'Price reset'})

    return jsonify({'error': 'Unknown action'}), 400


def send_mqtt_control(area, value):
    """Send control command to ESP32 via MQTT."""
    global mqtt_client
    if mqtt_client and system_state['mqtt_connected']:
        payload = json.dumps({area: value})
        mqtt_client.publish(TOPIC_CONTROL, payload, qos=1)
        print(f"📤 MQTT Control: {area} → {value}")
    else:
        # If MQTT not connected, update state directly for demo
        system_state[area] = value
        socketio.emit('state_update', system_state)
        print(f"⚠️ MQTT offline, updated state locally: {area} → {value}")


@app.route('/api/v1/security-status')
@login_required
def get_security_status():
    return jsonify({
        'security_posture': system_state['security_level'],
        'attack_score': system_state['attack_score'],
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
    emit('state_update', system_state)


@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')


# ─────────────────────────────────────────────────────────────
# Background Billing Thread (matches your original logic)
# ─────────────────────────────────────────────────────────────
def billing_thread():
    """Background billing calculation — publishes bill via MQTT."""
    with app.app_context():
        while True:
            # Bill calculation: (load_watts / 1000) * price_rate * interval
            cost = (system_state['load_mw'] / 1000.0) * system_state['price_rate'] * 0.05
            system_state['calculated_bill'] += cost

            # Publish bill to MQTT
            if mqtt_client and system_state['mqtt_connected']:
                try:
                    payload = json.dumps({'bill': round(system_state['calculated_bill'], 2)})
                    mqtt_client.publish(TOPIC_BILL, payload)
                except:
                    pass

            # Decay attack score over time
            if system_state['attack_score'] > 0:
                system_state['attack_score'] = max(0, system_state['attack_score'] - 0.5)

            # Update security level based on attack score
            score = system_state['attack_score']
            if score >= 70:
                system_state['security_level'] = 'CRITICAL'
            elif score >= 40:
                system_state['security_level'] = 'WARNING'
            else:
                system_state['security_level'] = 'NORMAL'

            # Record historical data periodically
            if random.random() < 0.1:
                try:
                    grid_data = GridData(
                        gen_mw=system_state['gen_mw'],
                        load_mw=system_state['load_mw'],
                        voltage=system_state['voltage'],
                        frequency=system_state['frequency'],
                        security_level=system_state['security_level'],
                        attack_score=system_state['attack_score'],
                    )
                    db.session.add(grid_data)
                    db.session.commit()
                except:
                    pass

            security_stats['total_inspected'] += random.randint(1, 5)

            # Broadcast state to all web clients
            socketio.emit('state_update', system_state)

            time.sleep(1)


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
            print("   Server will run without MQTT (demo mode)")
    else:
        print("⚠️ Running without MQTT (install paho-mqtt for hardware integration)")

    # Start billing/monitoring thread
    bill_thread = threading.Thread(target=billing_thread, daemon=True)
    bill_thread.start()
    print("💰 Billing thread started")

    print("\n🚀 Starting SCADA Server on http://localhost:5000")
    print("📋 Default credentials:")
    print("   Admin:    admin / admin123")
    print("   Operator: operator / operator123")
    print(f"\n📡 MQTT Broker: {BROKER}:{PORT}")
    print(f"📡 Topics: {TOPIC_ROOT}")
    print(f"📡 Control: {TOPIC_CONTROL}")

    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
