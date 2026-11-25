# VEXORA — Render Deployment Guide

This guide covers deploying VEXORA as a full-stack web service on **Render** using the included `render.yaml` Blueprint (native Node 22) or `Dockerfile` (Node 22 + FFmpeg).

---

## Included Render Deployment Files

- `render.yaml` — Render Blueprint defining the web service, build/start commands, health check path, and production environment configuration.
- `.node-version` — Pins **Node.js 22** so Render runs `node server.ts` natively without requiring a separate server compile step.
- `Dockerfile` & `.dockerignore` — Optional container setup bundling **Node 22**, **FFmpeg**, and **FFprobe** for full HLS muxing, quality scaling, and format transcoding on Render.

---

## Service Configuration

| Setting | Value |
| :--- | :--- |
| **Runtime** | `Node` (Node 22 via `.node-version`) or `Docker` (`./Dockerfile`) |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` (or `/healthz`) |

---

## Production Environment Variables on Render

Configure these in **Render Dashboard → Service → Environment**:

| Key | Setting | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Serves the Vite-built `dist/` frontend from Express. |
| `VEXORA_SESSION_SECRET` | **Auto-generated secret** (`generateValue: true` in `render.yaml`) | Signs `HttpOnly` session cookies securely across restarts. |
| `FFMPEG_PATH` | `ffmpeg` | Uses `ffmpeg` from `PATH` (full transcode/HLS requires the Docker runtime or FFmpeg on PATH). |
| `FFPROBE_PATH` | `ffprobe` | Uses `ffprobe` from `PATH`. |
| `VEXORA_MAX_MEDIA_MB` | `500` | Maximum media size in MB processed on the server. |
| `VEXORA_RATE_LIMIT_MAX` | `300` | Per-minute API rate limit per client IP. |
| `APP_URL` | Optional (`https://your-app.onrender.com`) | Render automatically injects `RENDER_EXTERNAL_URL`, which VEXORA reads automatically. |
| `ALLOWED_ORIGINS` | Optional CSV (`https://custom.domain.com`) | Add only if serving the frontend from a separate custom domain; wildcards (`*`) are rejected. |
| `VEXORA_ALLOWED_HOSTS` | Optional CSV | Restrict outbound downloads to specific media domains if desired. |
| `VEXORA_DATA_DIR` | Optional mounted disk path | Mount a Render Disk (e.g., `/var/data/vexora`) to retain server history JSON across deploys. |
| `VITE_API_BASE_URL` | Optional build-time public URL | Leave empty for standard single-service Render deployment (relative `/api/...`). Set only if hosting frontend and backend on separate Render services. |

---

## Manual Steps to Deploy on Render

1. **Push your code manually to your GitHub repository** (verify `.env` is NOT committed).
2. In the Render Dashboard, choose **New → Blueprint** (to load `render.yaml`) or **New → Web Service** connected to your repository.
   - Use **Node** runtime (`npm install && npm run build` / `npm start`) for direct progressive downloads (`MP4`/`WebM`/`MP3` original streams), **or** switch Runtime to **Docker** (`Dockerfile`) if you want built-in **FFmpeg & FFprobe** for HLS `.m3u8` downloads, resolution downscaling, and audio extraction.
3. Verify `NODE_ENV=production` and `VEXORA_SESSION_SECRET` (generated secret) are present in the Render **Environment** tab.
4. Deploy and confirm Render's health check passes at `https://<your-service>.onrender.com/api/health` (`ready: true`).
5. Test URL validation and a permitted direct public `.mp4` stream in the live web app before announcing readiness.
