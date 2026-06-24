# SurakshaSetu — Full Stack Setup Guide

## 🏗️ Architecture

```
suraksha-setu/
├── backend/
│   ├── server.js       ← Node.js + Express + WebSocket + SQLite
│   ├── package.json
│   └── suraksha.db     ← Auto-created on first run
├── frontend/
│   ├── index.html      ← Senior Citizen App (mobile-first PWA)
│   └── police.html     ← Police Dashboard
└── SETUP.md
```

**Tech Stack:**
- Backend: Node.js, Express, SQLite (via better-sqlite3), WebSockets (ws), JWT, bcrypt
- Frontend: Vanilla HTML/CSS/JS (no build step needed)
- Real-time: WebSocket for live SOS alerts and activity feed
- Auth: JWT tokens, bcrypt password hashing

---

## 🚀 Quick Start

### Step 1 — Install Node.js
Download from https://nodejs.org (v18 or higher)

### Step 2 — Install Dependencies
```bash
cd backend
npm install
```

### Step 3 — Start the Server
```bash
npm start
```

Server starts at: **http://localhost:3000**

### Step 4 — Open the Apps
- Senior App: http://localhost:3000
- Police Dashboard: http://localhost:3000/police

---

## 🔑 Demo Accounts (password: `password`)

| Role | Phone | Description |
|------|-------|-------------|
| 👴 Senior | 9000000002 | Rameshbhai Patel, 72, Maninagar |
| 👮 Police | 9000000001 | ACP Vikram Shah, Cyber Crime Branch |
| 👨‍👩‍👦 Family | 9000000003 | Rahul Patel (family member) |

---

## ✅ Features Implemented

### Senior Citizen App
- [x] Login / Register with JWT auth
- [x] One-tap SOS with 5-second countdown & cancel
- [x] SOS sends GPS location to backend → police notified via WebSocket
- [x] Medical alert button
- [x] Daily safety check-in (stored in DB)
- [x] Scam number/link checker (queries live DB)
- [x] Fraud report form → creates case in DB → police alerted
- [x] View own case history with real statuses
- [x] Live scam alerts feed
- [x] Profile page with health info
- [x] Multilingual switcher (EN / ગુ / हि)
- [x] Voice SOS (press Space bar)
- [x] PWA ready (add to home screen)
- [x] WebSocket real-time updates (SOS responded notification)

### Police Dashboard
- [x] Separate police-only login (role-gated)
- [x] Live WebSocket connection with real-time notifications
- [x] Stats dashboard (active SOS, seniors count, cases today)
- [x] SOS alerts list with Respond / Resolve actions
- [x] Fraud cases table with Assign to self
- [x] All registered citizens list with check-in status
- [x] Scam database viewer + add entry
- [x] Live activity feed
- [x] Real-time toast notifications for new SOS / reports

### Backend API
- [x] POST /api/auth/register
- [x] POST /api/auth/login
- [x] GET  /api/auth/me
- [x] POST /api/sos (trigger SOS, broadcast to police via WS)
- [x] GET  /api/sos/active (police only)
- [x] PATCH /api/sos/:id/respond
- [x] PATCH /api/sos/:id/resolve
- [x] POST /api/fraud-reports
- [x] GET  /api/fraud-reports
- [x] PATCH /api/fraud-reports/:id/assign
- [x] POST /api/scam/check
- [x] POST /api/checkin
- [x] GET  /api/checkin/history
- [x] GET  /api/dashboard/stats (police only)
- [x] GET  /api/dashboard/activity (police only)
- [x] GET  /api/seniors (police only)
- [x] GET  /api/alerts

---

## 🔧 Environment Variables (optional)

Create a `.env` file in `/backend`:
```
PORT=3000
JWT_SECRET=your-secret-key-here
```

---

## 🐳 Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/ .
COPY frontend/ ./frontend/
EXPOSE 3000
CMD ["node", "server.js"]
```

Build & run:
```bash
docker build -t suraksha-setu .
docker run -p 3000:3000 suraksha-setu
```

---

## 📈 Hackathon Points Checklist

| Criteria | Status |
|----------|--------|
| Police integration & real-time response | ✅ WebSocket live alerts |
| Location tracking | ✅ GPS on SOS |
| Digital evidence quality | ✅ Timestamped, case-numbered |
| Scalability | ✅ SQLite → swap to PostgreSQL |
| UI & accessibility | ✅ Large buttons, high contrast |
| Preventive safety | ✅ Scam DB, tips, AI checker |
| Data security | ✅ JWT, bcrypt, role-gated routes |
| Voice SOS (bonus) | ✅ Space bar trigger |
| Multilingual (bonus) | ✅ EN/GU/HI switcher |

---

## 🔄 Scaling to Production

1. Replace SQLite with **PostgreSQL**
   ```bash
   npm install pg
   ```
2. Add **Redis** for WebSocket scaling across multiple servers
3. Add **Google Maps API** for real GPS tracking
4. Deploy to **Railway.app** or **Render.com** (free tiers available)
5. Enable HTTPS for secure WebSocket (wss://)
