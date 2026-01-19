"""
Smart Grid SCADA Backend Server
This Flask server provides all API endpoints required by the React frontend.
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
# System State (in-memory, updated by simulation)
# ─────────────────────────────────────────────────────────────
system_state = {
    'gen_mw': 450.0,
    'gen_rpm': 3000,
    'status': 'online',
    'load_mw': 420.0,
    'voltage': 230.5,
    'frequency': 50.02,
    'area1': 'closed',
    'area2': 'closed',
    'calculated_bill': 12500.00,
    'security_level': 'normal',
    'system_locked': False,
    'mqtt_connected': True,
    'attack_score': 0,
    'threat_intel_active': True,
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

    # Query database
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
# Background Simulation Thread
# ─────────────────────────────────────────────────────────────
def simulation_thread():
    """Simulates real-time grid data and occasional threats."""
    with app.app_context():
        while True:
            # Update system state with slight variations
            system_state['gen_mw'] = max(0, min(1000, system_state['gen_mw'] + random.uniform(-5, 5)))
            system_state['load_mw'] = max(0, min(1000, system_state['load_mw'] + random.uniform(-3, 3)))
            system_state['voltage'] = max(200, min(250, system_state['voltage'] + random.uniform(-0.5, 0.5)))
            system_state['frequency'] = max(49.5, min(50.5, system_state['frequency'] + random.uniform(-0.02, 0.02)))
            system_state['gen_rpm'] = int(3000 + random.uniform(-50, 50))

            # Decay attack score
            if system_state['attack_score'] > 0:
                system_state['attack_score'] = max(0, system_state['attack_score'] - 1)

            # Update security level based on attack score
            score = system_state['attack_score']
            if score >= 70:
                system_state['security_level'] = 'critical'
            elif score >= 40:
                system_state['security_level'] = 'elevated'
            else:
                system_state['security_level'] = 'normal'

            # Record historical data every 10 seconds
            if random.random() < 0.1:
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

            # Simulate occasional threat (1% chance per second)
            if random.random() < 0.01:
                simulate_threat()

            security_stats['total_inspected'] += random.randint(10, 50)

            # Broadcast state update via Socket.IO
            socketio.emit('state_update', system_state)

            time.sleep(1)


def simulate_threat():
    """Generate a simulated threat event."""
    categories = ['network', 'protocol', 'authentication', 'injection']
    subcategories = {
        'network': ['port_scan', 'dos_attempt', 'suspicious_traffic'],
        'protocol': ['modbus_violation', 'dnp3_anomaly', 'iec104_malformed'],
        'authentication': ['brute_force', 'invalid_token', 'session_hijack'],
        'injection': ['sql_injection', 'command_injection', 'buffer_overflow'],
    }
    severities = ['low', 'medium', 'high', 'critical']
    severity_weights = [0.4, 0.3, 0.2, 0.1]

    category = random.choice(categories)
    subcategory = random.choice(subcategories[category])
    severity = random.choices(severities, severity_weights)[0]

    # Increase attack score based on severity
    score_increase = {'low': 5, 'medium': 15, 'high': 30, 'critical': 50}
    system_state['attack_score'] = min(100, system_state['attack_score'] + score_increase[severity])

    security_stats['total_blocked'] += 1
    if random.random() < 0.3:
        security_stats['threat_intel_blocks'] += 1

    # Log the threat
    threat = ThreatLog(
        decision_id=f'DEC-{random.randint(10000, 99999)}',
        action='BLOCK',
        layer='Security Engine',
        category=category,
        subcategory=subcategory,
        severity=severity,
        explanation=f'Detected {subcategory.replace("_", " ")} attempt from suspicious source.',
        metadata_json=json.dumps({'source_ip': f'192.168.{random.randint(1,255)}.{random.randint(1,255)}'}),
    )
    db.session.add(threat)
    db.session.commit()

    # Emit threat event to all connected clients
    socketio.emit('threat_detected', {
        'id': threat.id,
        'layer': threat.layer,
        'threat': {
            'category': category,
            'subcategory': subcategory,
            'severity': severity,
        },
        'explanation': threat.explanation,
        'timestamp': threat.timestamp.isoformat(),
    })


# ─────────────────────────────────────────────────────────────
# Database Initialization
# ─────────────────────────────────────────────────────────────
def init_db():
    """Initialize database with default users and sample data."""
    db.create_all()

    # Create default users if they don't exist
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

    # Seed some historical data if empty
    if GridData.query.count() == 0:
        now = datetime.utcnow()
        for i in range(60):
            ts = now - timedelta(minutes=60-i)
            data = GridData(
                timestamp=ts,
                gen_mw=400 + random.uniform(-50, 50),
                load_mw=380 + random.uniform(-30, 30),
                voltage=230 + random.uniform(-5, 5),
                frequency=50 + random.uniform(-0.1, 0.1),
                security_level='normal',
                attack_score=random.uniform(0, 20),
            )
            db.session.add(data)
        db.session.commit()


# ─────────────────────────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    with app.app_context():
        init_db()
        print("✅ Database initialized")

    # Start simulation thread
    sim_thread = threading.Thread(target=simulation_thread, daemon=True)
    sim_thread.start()
    print("🔄 Simulation thread started")

    print("🚀 Starting SCADA Server on http://localhost:5000")
    print("📋 Default credentials:")
    print("   Admin: admin / admin123")
    print("   Operator: operator / operator123")

    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
