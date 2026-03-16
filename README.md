# MedAlert AI

MedAlert AI is a full-stack crisis communication platform for detecting potential incidents, helping analysts verify them, and sending multilingual alerts to affected users.

## What It Does

- Aggregates crisis signals from external APIs, social sources, ministry/demo feeds, and scraped news.
- Surfaces findings to analysts in a live dashboard.
- Lets analysts turn a finding into an alert, run deeper verification, approve or reject it, or create manual alerts.
- Generates alert copy in Arabic, English, Turkish, Italian, and Hebrew.
- Sends browser push notifications and live Socket.IO updates to dashboards and subscribed users.

## Current Architecture

- `frontend/`: React + Vite single-page app for the control panel, analyst dashboard, and user view.
- `backend/`: Express + Socket.IO API server with Sequelize models and service integrations.
- Database: SQLite, stored locally by default at `backend/data/medalert.sqlite`.
- Geo targeting: currently done in application code with Haversine distance calculations, not PostGIS.

## Key Workflows

### Detection

The backend combines data from:

- USGS
- EMSC
- OpenWeatherMap
- Tomorrow.io
- NewsAPI.ai / Event Registry
- Twitter/X
- Intel/news scraping services

Detection results are aggregated into intel findings and shown to analysts for review.

### Alert Creation

Analysts can:

- create an alert from a specific intel finding
- run deep multi-source verification on an existing alert
- create a manual alert directly from the dashboard

### Verification

The platform uses:

- Perplexity for incident verification and independent web search
- Gemini for search keyword generation, synthesis, translation, and multilingual message drafting

When external services are unavailable, some flows fall back to demo data so the product remains testable.

## Prerequisites

- Node.js 18+
- npm
- API keys for the external services you want to use

## Configuration

Copy the example files and fill in the values you need:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

### Backend env (`backend/.env`)

Common variables used by the backend:

```env
PORT=5000
SQLITE_STORAGE=data/medalert.sqlite
# or DATABASE_URL=sqlite:data/medalert.sqlite

GEMINI_API_KEY=
PERPLEXITY_API_KEY=
OPENWEATHER_API_KEY=
TOMORROW_IO_API_KEY=
NEWSAPI_AI_KEY=
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_BEARER_TOKEN=

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@medalert.demo

DETECTION_WINDOW_HOURS=6
NEWS_SAME_EVENT_WINDOW_HOURS=6

# Optional comma-separated defaults for runtime source selection.
# Leave blank to use all currently available sources.
ENABLED_DETECTION_SOURCES=
ENABLED_VERIFICATION_SOURCES=
```

### Frontend env (`frontend/.env`)

Optional overrides:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

You can also use the committed examples directly:

- `backend/.env.example`
- `frontend/.env.example`

## Generate VAPID Keys

Required for web push notifications:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Put the public/private keys in `backend/.env`.

## Install Dependencies

Install frontend and backend dependencies:

```bash
npm --prefix backend install
npm --prefix frontend install
```

## Seed Demo Users

This creates 30 demo users in the Beirut area:

```bash
npm --prefix backend run seed
```

## Start the App

### Recommended: start both services together

From the repository root:

```bash
npm run dev
```

This starts:

- frontend dev server on `http://localhost:5173`
- backend API/socket server on `http://localhost:5000`

In development, two ports are expected because Vite and Express run as separate processes. The frontend proxies `/api` requests to the backend.

### Start services separately

Backend:

```bash
npm --prefix backend run dev
```

Frontend:

```bash
npm --prefix frontend run dev
```

## Typical Demo Flow

1. Open `http://localhost:5173`.
2. Trigger detection from the control panel.
3. Review incoming findings in the analyst dashboard.
4. Create an alert from a finding or create a manual alert.
5. Run deep verification if needed.
6. Approve the alert and choose a generated or custom message.
7. Open the user view, subscribe to notifications, and confirm push delivery.

## API Summary

### Health

- `GET /api/health`

### Detection

- `GET /api/source-config`
- `POST /api/detect`
- `GET /api/detect/findings`
- `POST /api/detect/create-alert`

### Alerts

- `GET /api/alerts`
- `GET /api/alerts/:id`
- `POST /api/alerts/:id/verify`
- `POST /api/alerts/:id/approve`
- `POST /api/alerts/:id/reject`
- `POST /api/alerts/manual`

`POST /api/detect` and `POST /api/alerts/:id/verify` both accept an optional `source_ids` array to override the backend defaults for a single run.

### Users

- `GET /api/users`
- `GET /api/users/:id`
- `GET /api/users/vapid-public-key`
- `POST /api/users/:id/subscribe`
- `DELETE /api/users/:id/unsubscribe`

## Project Structure

```text
AI4Purpose/
|-- package.json
|-- scripts/
|   `-- dev.mjs
|-- backend/
|   |-- config/
|   |-- models/
|   |-- routes/
|   |-- seeders/
|   |-- services/
|   `-- server.js
`-- frontend/
    |-- public/
    `-- src/
        |-- components/
        |-- hooks/
        |-- pages/
        `-- services/
```

## Notes

- The current implementation uses SQLite, not PostgreSQL/PostGIS.
- Socket.IO is used for dashboard updates, verification progress, approval progress, and user alert delivery.
- Browser push notifications require valid VAPID keys and a client subscription.

## License

MIT
