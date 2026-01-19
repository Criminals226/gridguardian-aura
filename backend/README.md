# Smart Grid SCADA Backend

Flask-based backend server for the SCADA monitoring system.

## Quick Start

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Run the Server
```bash
python web_scada.py
```

The server starts at `http://localhost:5000`

## Default Credentials

| Role     | Username | Password   |
|----------|----------|------------|
| Admin    | admin    | admin123   |
| Operator | operator | operator123|

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/login` | POST | Authenticate user |
| `/logout` | GET | End session |
| `/api/state` | GET | Current system state |
| `/api/v1/security-status` | GET | Security posture |
| `/api/v1/historical-data` | GET | Historical grid data |
| `/api/get_logs` | GET | Threat/Audit logs |
| `/api/get_stats` | GET | Statistics |

## Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `state_update` | Server→Client | Real-time state |
| `threat_detected` | Server→Client | New threat alert |
| `mqtt_status` | Server→Client | MQTT connection status |

## Production Deployment

### Single-URL Deployment

1. Build the React frontend:
```bash
cd ..  # back to project root
npm run build
```

2. Copy the build output to backend:
```bash
cp -r dist backend/
```

3. Run the Flask server:
```bash
cd backend
python web_scada.py
```

Flask will serve both API and frontend from `http://localhost:5000`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `scada-secret-key...` | Session encryption key |
| `PORT` | `5000` | Server port |

## Database

SQLite database (`scada.db`) is created automatically with:
- Users table (default admin/operator)
- GridData table (historical readings)
- ThreatLog table (security events)
- AuditLog table (user actions)

## Simulation

The server includes a background simulation that:
- Updates grid metrics every second
- Generates occasional threat events (1% per second)
- Records historical data every ~10 seconds
- Broadcasts updates via Socket.IO
