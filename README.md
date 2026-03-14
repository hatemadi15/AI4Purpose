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

## External API Integration Flow

If another project will consume this backend over HTTP, use this request flow:

1. `GET /api/health`
2. `GET /api/meta/endpoints`
3. `GET /api/meta/summary`
4. `GET /api/detect/findings?region=Lebanon&limit=25&page=1`
5. `GET /api/detect/recommendations?region=Lebanon`
6. `POST /api/detect/create-alert` or `POST /api/alerts/manual`
7. `POST /api/alerts/:id/verify`
8. `POST /api/alerts/:id/approve`

### Recommended GET requests

- `GET /api/meta/endpoints` for a machine-readable map of available requests
- `GET /api/meta/summary` for top-level counts and latest records
- `GET /api/detect/findings` with filters:
  - `region`
  - `type`
  - `source_type`
  - `severity`
  - `alert_created`
  - `limit`
  - `page`
- `GET /api/detect/recommendations` with filters:
  - `region`
  - `min_sources`
- `GET /api/alerts` with filters:
  - `status`
  - `severity`
  - `region`
  - `event_type`
  - `verification_status`
  - `is_manual`
  - `created_after`
  - `created_before`
  - `limit`
  - `page`
- `GET /api/alerts/summary`
- `GET /api/alerts/:id`
- `GET /api/alerts/:id/context`
- `GET /api/users` with filters:
  - `country`
  - `preferred_language`
  - `has_push_subscription`
  - `limit`
  - `page`
- `GET /api/users/summary`
- `GET /api/users/:id`
- `GET /api/users/vapid-public-key`

### Recommended write requests

- `POST /api/detect` to run a fresh intel sweep
- `POST /api/detect/create-alert` to convert a finding into a reviewable alert
- `POST /api/alerts/impact-preview` to estimate audience size before sending
- `POST /api/alerts/manual` to create a manual alert
- `POST /api/alerts/:id/verify` to perform deep verification
- `POST /api/alerts/:id/approve` to approve and send notifications
- `POST /api/alerts/:id/reject` to reject an alert
- `POST /api/users/:id/subscribe` to attach a browser push subscription
- `DELETE /api/users/:id/unsubscribe` to remove a push subscription

## License

MIT

# AI4Purpose

Hackathon Submission
