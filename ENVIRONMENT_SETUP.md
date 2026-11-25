# VEXORA Environment Variables & Setup Guide

This document describes every environment variable read by VEXORA (`server/config.ts` and `vite.config.ts`), its type, safe default, preview behavior, and production deployment requirements.

> **Important:**
> - **AI Studio Preview requires zero manual environment variables.** All non-secret variables use safe defaults, `APP_URL` / `PORT` are handled automatically, and session signing falls back to an in-memory cryptographic key.
> - **Never commit a real `.env` file to GitHub** (`.env*` is ignored in `.gitignore`, while `!.env.example` keeps the safe template tracked).
> - **Never prefix private secrets with `VITE_`**, because Vite exposes `VITE_*` values to frontend browser code.

---

## Complete Environment Variable Reference

| Variable | Type | Default | Preview Required? | Production Required? | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PORT` | Integer (`1–65535`) | `3000` | No (auto/3000) | Host-assigned (`3000` or platform `PORT`) | HTTP port Express listens on. |
| `NODE_ENV` | `'development' \| 'production'` | `'development'` | No | **Yes (`production`)** | Switches between Vite dev middleware and serving the built `dist/` bundle. |
| `APP_URL` | `http(s)://` URL | `""` (or `RENDER_EXTERNAL_URL`) | No (auto-injected in AI Studio) | **Recommended** | Public URL of the deployed app; automatically added as a trusted origin. |
| `ALLOWED_ORIGINS` | Comma-separated `http(s)://` origins | `""` | No | Optional (Required only if frontend is on a different origin) | Explicit origins permitted for credentialed CORS & write requests. Wildcards (`*`) are rejected. |
| `VITE_API_BASE_URL` | `http(s)://` public backend URL | `""` (same-origin `/api`) | No | Optional (Only if split frontend/backend) | Public backend URL baked into the frontend at build time when UI and API are separate services. |
| `FFMPEG_PATH` | Command name or executable path | `ffmpeg` (resolved via `PATH`) | No (uses `PATH`) | Set if `ffmpeg` is outside `PATH` | Used for HLS muxing, format transcoding, quality scaling, and audio extraction. |
| `FFPROBE_PATH` | Command name or executable path | `ffprobe` (resolved via `PATH`) | No (uses `PATH`) | Set if `ffprobe` is outside `PATH` | Used to probe video resolution, duration, bitrate, and stream codecs. |
| `VEXORA_JOBS_DIR` | Directory path | `<os.tmpdir()>/vexora-jobs` | No | Optional (set to writable/mounted volume if desired) | Temporary staging storage for transcoding jobs (cleaned automatically). |
| `VEXORA_DATA_DIR` | Directory path | `<os.tmpdir()>/vexora-data` | No | **Recommended** (persistent volume path) | Directory storing session-scoped server history (`history.json`). |
| `VEXORA_MAX_MEDIA_MB` | Integer (`10–2048`) | `500` | No | Optional | Maximum media size (in MB) permitted for server processing. |
| `VEXORA_ALLOWED_HOSTS` | Comma-separated hostnames | `""` | No | Optional | Optional strict domain allowlist restricting media fetches to specific hostnames. |
| `VEXORA_RATE_LIMIT_MAX` | Integer (`20–5000`) | `300` | No | Optional | Maximum `/api/*` requests per minute per client IP. |
| `VEXORA_SESSION_SECRET` | Secret string (`>= 16` chars) | Ephemeral `crypto.randomBytes(32)` in memory | **No** | **Yes (via host secret manager)** | HMAC key signing `HttpOnly` `vexora_sid` session cookies so sessions stay valid across restarts/replicas. |
| `DISABLE_HMR` | `'true' \| 'false'` | `'false'` | Managed by AI Studio | Ignored in production | Controls Vite HMR file watching in `vite.config.ts`. |

---

## Variable Details & Production Notes

### 1. Preview Mode (Zero Manual Setup)
When running in AI Studio Preview or `npm run dev` locally:
- `PORT` defaults to `3000`.
- `VEXORA_JOBS_DIR` and `VEXORA_DATA_DIR` default safely to `<os.tmpdir()>/vexora-jobs` and `<os.tmpdir()>/vexora-data`.
- `FFMPEG_PATH` and `FFPROBE_PATH` default to `ffmpeg` and `ffprobe` resolved from your system `PATH`.
- Same-host browser requests matching `Host` or `X-Forwarded-Host` (and `APP_URL`) are trusted automatically without setting `ALLOWED_ORIGINS`.
- `VEXORA_SESSION_SECRET` uses an ephemeral in-memory random 256-bit key so preview never prompts for fake secrets.

### 2. FFmpeg & FFprobe Resolution
- By default, VEXORA resolves `ffmpeg` and `ffprobe` directly from `PATH` (or standard Unix directories `/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`).
- If `ffmpeg` is missing on a host:
  - `/api/health` reports `capabilities.transcoding: false` along with a clear setup error in `diagnostics.ffmpegError`.
  - `/api/inspect` only exposes direct progressive original-stream downloads (`Source`) that do not require transcoding, and HLS `.m3u8` / transcode requests return HTTP `503` explaining that FFmpeg must be installed or `FFMPEG_PATH` configured.
- Example container installation (Debian/Ubuntu):
  ```dockerfile
  RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
  ```

### 3. Allowed Origins & Credentialed Requests
- VEXORA uses `HttpOnly` session cookies (`vexora_sid`) to scope `/api/history` and `/api/downloads/:id` access.
- Because requests include credentials (`credentials: 'same-origin'`), **unrestricted wildcard origins (`*`) are never used and are explicitly rejected** if placed in `ALLOWED_ORIGINS`.
- If you host the UI on a separate domain from the backend API in production, list the exact origin(s), for example:
  ```env
  ALLOWED_ORIGINS=https://vexora.example.com,https://media.example.com
  ```

### 4. Production Secrets & Persistent Storage
Before deploying to production (Cloud Run, Render, Railway, Fly.io, or Docker):
1. Set `NODE_ENV=production`.
2. Set `VEXORA_SESSION_SECRET` inside your platform's **Secrets Manager** (never commit it in `.env.example` or Git).
3. Mount persistent storage and point `VEXORA_DATA_DIR` to it (for example `/var/lib/vexora/data`) if you want server-side history records to persist across container restarts.
4. Set `APP_URL` (and `ALLOWED_ORIGINS` if cross-origin) to your exact public HTTPS URL.
