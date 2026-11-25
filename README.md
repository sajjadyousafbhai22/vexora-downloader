# VEXORA — Web Video Downloader & Media Player

VEXORA is a responsive web application for verifying, inspecting, downloading, and playing legally permitted direct media streams (MP4, WebM, MKV, HLS `.m3u8`, MP3, M4A) with a dark navy and electric blue interface, light/dark themes, real-time transfer progress, and an integrated browser media player.

> **Important:** VEXORA is a browser-based web application only. It enforces server-side policy and security checks, blocks executable/APK downloads, and does not bypass DRM, paywalls, authentication gates, or third-party platform restrictions.

---

## Features

- **URL Validation & Source Detection:** Verifies URL syntax, resolves public hosts safely, detects restricted/DRM-protected sources, and extracts direct or embedded HTML5 `<video>` / `<audio>` / HLS streams.
- **Format & Quality Inspection:** Uses `ffprobe` (when installed) and upstream HTTP headers to display real available qualities (`360p`–`2160p` / `Source`) and file sizes without inventing missing metadata.
- **Real Download Manager:** Displays live progress percentage, transfer speed, downloaded/total bytes, ETA, byte-range Pause/Resume where supported by the origin server, Cancel, Retry, Completed, and Failed tabs.
- **In-App Media Player:** Plays completed downloads from browser IndexedDB cache or streams safe URLs through the HTTP range proxy (`/api/preview`).
- **Persistent Preferences & History:** Stores theme (Dark/Light), default format, and default quality locally in the browser, alongside session-scoped server history (`GET/DELETE /api/history`).

---

## Project Architecture

```text
├── server.ts                 # Express API server + Vite dev / production static serving
├── server/
│   ├── config.ts             # Environment configuration loader & binary readiness checks
│   ├── security.ts           # Public URL validation, host allowlist & origin verification
│   ├── sources.ts            # Source classification & DRM / platform policy enforcement
│   ├── media.ts              # Media inspection, FFmpeg transcoding, job lifecycle
│   └── historyStore.ts       # Atomic JSON session-scoped download history store
├── src/
│   ├── App.tsx               # Application state & API integration
│   ├── components/           # Navbar, Hero, Download Manager, Player, Formats, Settings
│   ├── types/vexora.ts       # Shared TypeScript interfaces
│   └── utils/                # Client formatting helpers & IndexedDB/localStorage stores
├── .env.example              # Safe environment variable template (no real secrets)
└── package.json
```

---

## Prerequisites

- **Node.js `>= 22.6.0`** (uses native TypeScript type-stripping for `node server.ts` in production)
- **FFmpeg & FFprobe** (`ffmpeg` and `ffprobe` on `PATH` or configured via `FFMPEG_PATH` / `FFPROBE_PATH`) for HLS muxing, format/quality transcoding, and duration/resolution probing. Direct HTTP/HTTPS progressive streams still work without FFmpeg.

---

## API Endpoints

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server readiness, FFmpeg/FFprobe availability, and storage status |
| `GET` | `/api/sources` | Supported source categories and compliance policy flags |
| `POST` | `/api/sources/detect` | Detect stream type, domain, formats, and qualities for a URL |
| `GET` | `/api/formats` | Supported container/audio formats and transcoder availability |
| `POST` | `/api/validate` | Validate URL syntax, network safety, policy compliance, and stream availability |
| `POST` | `/api/inspect` | Return technical stream metadata (`contentLength`, resolution, codecs, qualities) |
| `POST` | `/api/downloads` | Create and authorize a download or transcode job |
| `GET` | `/api/downloads/:id/status` | Poll real job progress, byte count, and status |
| `GET` | `/api/downloads/:id/events` | Stream Server-Sent Events (SSE) for FFmpeg transcode progress |
| `GET` | `/api/downloads/:id/stream` | Range-capable upstream pass-through stream for direct downloads |
| `GET` | `/api/downloads/:id/file` | Range-capable download endpoint for completed transcode files |
| `DELETE` / `POST` | `/api/downloads/:id` (`.../cancel`) | Cancel an active download/transcode job |
| `GET` | `/api/history` | Retrieve session-scoped download history |
| `DELETE` | `/api/history/:id` | Delete a single server history entry |
| `DELETE` | `/api/history` | Clear session history (`?status=completed` or `?status=failed` optional) |
| `GET` | `/api/preview` | Range-enabled safe media preview stream for the in-app player |

---

## Environment Variables

VEXORA starts in local development and AI Studio preview **without** manually setting deployment-only variables. Copy `.env.example` to `.env` only when customizing configuration locally:

```bash
cp .env.example .env
```

See **[ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)** for the full variable reference (defaults, preview vs production requirements, FFmpeg `PATH` resolution, and origin security).

- `PORT` / `NODE_ENV` — Port (`3000` default) and runtime mode (`development` or `production`).
- `APP_URL` / `ALLOWED_ORIGINS` — Public deployment URL and explicit trusted browser origins (wildcards `*` are rejected).
- `FFMPEG_PATH` / `FFPROBE_PATH` — Executable commands (`ffmpeg` / `ffprobe` on `PATH` by default, or explicit paths).
- `VEXORA_JOBS_DIR` / `VEXORA_DATA_DIR` — Optional directories for temporary jobs and `history.json` (default safely to `os.tmpdir()`).
- `VEXORA_MAX_MEDIA_MB`, `VEXORA_ALLOWED_HOSTS`, `VEXORA_RATE_LIMIT_MAX` — Media limit (`500` MB), optional host allowlist, and rate limit (`300`/min).
- `VEXORA_SESSION_SECRET` *(production secret)* — Configure in your production host's secret manager; preview uses an automatic ephemeral key.

---

## Local Development & Production Deployment

```bash
# 1. Install dependencies
npm install

# 2. Run development server (Express + Vite middleware on port 3000)
npm run dev

# 3. Typecheck and build frontend bundle
npm run typecheck
npm run build

# 4. Run production server
NODE_ENV=production npm start
```

### Deploying on Render (Manual Steps)

See **[RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)** for full details.

1. Push this project manually to your GitHub repository (`.env` stays excluded via `.gitignore`).
2. Create a Blueprint (`render.yaml`) or Web Service on Render with Build Command `npm install && npm run build`, Start Command `npm start`, and Health Check Path `/api/health` (or use the included `Dockerfile` if you want FFmpeg/FFprobe pre-installed for HLS and transcoding).
3. Ensure `NODE_ENV=production` and `VEXORA_SESSION_SECRET` (auto-generated by `render.yaml`) are set in Render's Environment settings.
