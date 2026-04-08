# RecitAI Community — Backend Server

Node.js + Express + MongoDB backend for the RecitAI Community feature.

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB running locally (or a MongoDB Atlas URI)

### Steps

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your values
npm run dev   # development with nodemon
# OR
npm start     # production
```

### Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/quran_community` |
| `JWT_SECRET` | Secret for access tokens (min 32 chars) | `your_secret_here` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (min 32 chars) | `your_refresh_secret_here` |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `NODE_ENV` | Environment | `development` or `production` |

---

## Render.com Deployment Checklist

1. Push the `server/` folder to a GitHub repo (or subpath).
2. In Render, create a new **Web Service**.
3. Set **Root Directory** to `server` (if your repo includes the Flutter project too).
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node server.js`
6. Add all environment variables from the table above in the Render dashboard.
7. For `MONGODB_URI`, use a **MongoDB Atlas** connection string (free tier).
8. Set `NODE_ENV=production`.

> **Important**: Never commit your `.env` file. Use `.env.example` as a template.

---

## API Overview

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register (teacher or student) |
| POST | `/api/auth/login` | Login → JWT |
| POST | `/api/auth/refresh` | Exchange refresh token for new access token |
| GET | `/api/auth/me` | Get current user |

### Teacher (requires `Authorization: Bearer <token>` with role=teacher)
| Method | Path | Description |
|---|---|---|
| POST | `/api/community/create` | Create community |
| GET | `/api/community/mine` | List my communities |
| GET | `/api/community/:id/students` | Students + progress summary |
| GET | `/api/community/:id/student/:studentId` | Detailed student progress |
| POST | `/api/assignment/create` | Create assignment |
| GET | `/api/assignment/community/:id` | List assignments for a community |
| DELETE | `/api/assignment/:id` | Delete assignment |

### Student (requires `Authorization: Bearer <token>` with role=student)
| Method | Path | Description |
|---|---|---|
| POST | `/api/community/join` | Join via 6-char code |
| GET | `/api/community/joined` | List joined communities |
| GET | `/api/assignment/mine/:communityId` | My assignments in a community |
| POST | `/api/submission/complete` | Mark assignment completed (with scores) |
| POST | `/api/submission/submit` | Submit to teacher |
| GET | `/api/submission/mine/:communityId` | My submissions |

---

## Health Check
```
GET /health  →  { success: true, status: "ok" }
```
