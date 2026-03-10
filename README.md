# MedAlert AI - Crisis Communication Platform

A full-stack crisis communication platform with AI verification and human approval for Mediterranean emergency management.

## Features

- **Crisis Detection**: 6 external APIs (USGS, EMSC, OpenWeatherMap, Tomorrow.io, NewsAPI.ai, Twitter)
- **Dual AI Analysis**: Perplexity for verification, Gemini for alert drafting
- **5 Languages**: Arabic, English, Turkish, Italian, Hebrew
- **Real-time Updates**: Socket.IO for live dashboard updates
- **Web Push Notifications**: Browser notifications with vibration
- **Geospatial Queries**: PostGIS for finding affected users by location

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL with PostGIS extension
- Required API keys (see `.env` files)

### 1. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE medalert_db;"

# Enable PostGIS
psql -U postgres -d medalert_db -c "CREATE EXTENSION postgis;"
```

### 2. Generate VAPID Keys

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Copy the keys to both `backend/.env` and `frontend/.env`.

### 3. Backend Setup

```bash
cd backend
npm install
npm run seed  # Create 30 demo users
npm run dev   # Start server on port 5000
```

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev   # Start on port 5173
```

### 5. Test the Flow

1. Open http://localhost:5173
2. Click "Trigger Crisis Detection" on Control Panel
3. Navigate to Analyst Dashboard - alert appears
4. Review, select message option, click Approve
5. Open User View, enable notifications
6. Approve another alert to receive push notification

## Project Structure

```
MedAlertAI/
├── backend/
│   ├── config/database.js
│   ├── models/ (User, Alert)
│   ├── services/ (detection, perplexity, gemini, geo, push)
│   ├── routes/ (detect, alerts, users)
│   ├── seeders/seedUsers.js
│   └── server.js
├── frontend/
│   ├── public/service-worker.js
│   ├── src/
│   │   ├── pages/ (MasterControlPanel, AnalystDashboard, UserMobileView)
│   │   ├── components/ (AlertMap)
│   │   ├── hooks/ (useSocket)
│   │   └── services/ (api)
│   └── index.html
└── README.md
```

## API Endpoints

- `POST /api/detect` - Trigger crisis detection
- `GET /api/alerts` - List alerts
- `POST /api/alerts/:id/approve` - Approve and send notifications
- `POST /api/alerts/:id/reject` - Reject alert
- `POST /api/users/:id/subscribe` - Save push subscription
- `GET /api/users/vapid-public-key` - Get VAPID public key

## License

MIT
