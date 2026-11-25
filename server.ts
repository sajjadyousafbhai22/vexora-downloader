import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { MediaFormat, MediaQuality } from './src/types/vexora.ts';
import { getBinaryStatus, serverConfig } from './server/config.ts';
import {
  clearSessionHistory,
  deleteSessionHistoryItem,
  getOrCreateSessionId,
  listSessionHistory,
  readExistingSessionId,
  recordServerHistory,
} from './server/historyStore.ts';
import {
  ALLOWED_FORMATS,
  ALLOWED_QUALITIES,
  cancelJob,
  cleanupJob,
  createDownloadJob,
  getJob,
  inspectMediaUrl,
  persistJobOutcome,
  UnsupportedMediaError,
} from './server/media.ts';
import {
  createRateLimiter,
  isValidUuid,
  resolveTrustedOrigin,
  safeFetch,
  SecurityValidationError,
  validatePublicHttpUrl,
  verifyOriginMiddleware,
} from './server/security.ts';
import { SUPPORTED_SOURCE_SUMMARY } from './server/sources.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = serverConfig.port;
const isProd = serverConfig.nodeEnv === 'production';

const VALIDATION_TITLES: Record<string, string> = {
  INVALID_SYNTAX: 'Invalid URL Format',
  UNSUPPORTED_PROTOCOL: 'Unsupported Protocol',
  BLOCKED_EXECUTABLE: 'Blocked File Type',
  BLOCKED_NETWORK: 'Blocked Network Address',
  UNSUPPORTED_MEDIA: 'Unsupported Media Source',
  RESTRICTED_PLATFORM: 'Restricted or Protected Platform',
  DRM_PROTECTED: 'DRM-Protected Media',
  AUTH_REQUIRED: 'Authorization Required',
  SERVICE_UNAVAILABLE: 'Backend Service Unavailable',
  UNREACHABLE: 'URL Unreachable',
  SUPPORTED: 'Supported Media Verified',
};

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '32kb' }));

  // Baseline security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const apiLimiter = createRateLimiter(serverConfig.rateLimitMax, 60_000);
  app.use('/api', apiLimiter);
  app.use('/api', (req, res, next) => {
    const reqOrigin = req.headers.origin;
    if (reqOrigin) {
      const trustedOrigin = resolveTrustedOrigin(req);
      if (trustedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', trustedOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (req.method === 'OPTIONS') {
        res.status(trustedOrigin ? 204 : 403).end();
        return;
      }
    }
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      verifyOriginMiddleware(req, res, next);
      return;
    }
    next();
  });

  // Structured logging for server-side 5xx errors (without logging cookies/headers/secrets)
  app.use('/api', (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 500) {
        console.error(`[VEXORA API ${res.statusCode}] ${req.method} ${req.path}`);
      }
    });
    next();
  });

  // 1. Backend Health & Service Readiness (used by Render healthCheckPath)
  const handleHealthCheck = (_req: express.Request, res: express.Response) => {
    const binaries = getBinaryStatus();
    const ready = binaries.jobsDirWritable && binaries.dataDirWritable;
    const setupIssues = [
      binaries.ffmpegError,
      binaries.ffprobeError,
      binaries.jobsDirError,
      binaries.dataDirError,
    ].filter((item): item is string => Boolean(item));

    res.status(ready ? 200 : 503).json({
      ok: ready,
      service: 'vexora-media-server',
      ready,
      mode: serverConfig.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      capabilities: {
        directStreaming: true,
        transcoding: binaries.ffmpegAvailable,
        mediaProbing: binaries.ffprobeAvailable,
        persistentHistory: binaries.dataDirWritable,
        maxMediaMb: serverConfig.maxMediaMb,
      },
      diagnostics: {
        ffmpegError: binaries.ffmpegError,
        ffprobeError: binaries.ffprobeError,
        jobsDirError: binaries.jobsDirError,
        dataDirError: binaries.dataDirError,
        setupIssues,
        configWarnings: serverConfig.configWarnings,
        usesEphemeralSessionSecret: serverConfig.usesEphemeralSessionSecret,
        allowedOriginsConfigured: serverConfig.allowedOrigins.length > 0,
      },
    });
  };

  app.get('/api/health', handleHealthCheck);
  app.get('/healthz', handleHealthCheck);

  // 2. Supported Sources & Policy Capabilities
  app.get('/api/sources', (_req, res) => {
    res.json({
      sources: SUPPORTED_SOURCE_SUMMARY,
      policy: {
        drmBypassSupported: false,
        executableDownloadsBlocked: true,
        authRequiredSourcesSupported: false,
      },
    });
  });

  app.post('/api/sources/detect', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    try {
      const metadata = await inspectMediaUrl(rawUrl);
      res.json({
        supported: true,
        sourceType: metadata.sourceType ?? 'direct_video',
        domain: metadata.domain,
        title: metadata.title,
        isHls: metadata.isHls,
        extractedFromPage: metadata.extractedFromPage,
        hasVideo: metadata.hasVideo,
        hasAudio: metadata.hasAudio,
        availableFormats: metadata.availableFormats,
        availableQualities: metadata.availableQualities,
      });
    } catch (err) {
      if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
        res.status(err.statusCode).json({
          supported: false,
          code: err.code,
          title: VALIDATION_TITLES[err.code] || 'Unsupported Source',
          message: err.message,
        });
        return;
      }
      res.status(503).json({
        supported: false,
        code: 'SERVICE_UNAVAILABLE',
        title: 'Source Detection Unavailable',
        message: 'Unable to detect media source capabilities right now. Please try again shortly.',
      });
    }
  });

  // 3. Supported Formats Endpoint
  app.get('/api/formats', (_req, res) => {
    const binaries = getBinaryStatus();
    res.json({
      transcodingAvailable: binaries.ffmpegAvailable,
      ffmpegError: binaries.ffmpegError,
      formats: [
        { id: 'mp4', label: 'MP4', detail: 'H.264 / AAC', kind: 'video', requiresFfmpegForTranscode: true },
        { id: 'webm', label: 'WebM', detail: 'VP9 / Opus', kind: 'video', requiresFfmpegForTranscode: true },
        { id: 'mkv', label: 'MKV', detail: 'Matroska', kind: 'video', requiresFfmpegForTranscode: true },
        { id: 'mp3', label: 'MP3', detail: 'Audio Track', kind: 'audio', requiresFfmpegForTranscode: true },
        { id: 'm4a', label: 'M4A', detail: 'AAC Audio', kind: 'audio', requiresFfmpegForTranscode: true },
      ],
    });
  });

  // 4. URL Validation Endpoint (never returns fake success)
  app.post('/api/validate', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    try {
      const metadata = await inspectMediaUrl(rawUrl);
      res.json({
        valid: true,
        status: 'supported',
        code: 'SUPPORTED',
        title: VALIDATION_TITLES.SUPPORTED,
        message: metadata.extractedFromPage
          ? `Found playable ${metadata.hasVideo ? 'video' : 'audio'} stream on ${metadata.domain}.`
          : `Verified direct ${metadata.hasVideo ? 'video' : 'audio'} stream on ${metadata.domain}.`,
        inspection: metadata,
      });
    } catch (err) {
      if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
        res.status(err.statusCode).json({
          valid: false,
          status: 'invalid',
          code: err.code,
          title: VALIDATION_TITLES[err.code] || 'Unsupported URL',
          message: err.message,
          inspection: null,
        });
        return;
      }
      res.status(503).json({
        valid: false,
        status: 'invalid',
        code: 'SERVICE_UNAVAILABLE',
        title: 'Verification Unavailable',
        message: 'Unable to verify the provided URL right now. Check the link and try again.',
        inspection: null,
      });
    }
  });

  // 5. Inspect Formats & Qualities Endpoint
  app.post('/api/inspect', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    try {
      const metadata = await inspectMediaUrl(rawUrl);
      res.json(metadata);
    } catch (err) {
      if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(503).json({
        error: 'Unable to inspect the provided URL right now. Please verify the link and try again.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  });

  // 6. Start an Authorized Download Job
  app.post('/api/downloads', async (req, res) => {
    const sessionId = getOrCreateSessionId(req, res);
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const format = (typeof req.body?.format === 'string' ? req.body.format.toLowerCase() : 'mp4') as MediaFormat;
    const quality = (typeof req.body?.quality === 'string' ? req.body.quality.toLowerCase() : 'source') as MediaQuality;

    if (!ALLOWED_FORMATS.has(format)) {
      res.status(400).json({ error: `Unsupported format "${format}".` });
      return;
    }
    if (!ALLOWED_QUALITIES.has(quality)) {
      res.status(400).json({ error: `Unsupported quality "${quality}".` });
      return;
    }

    try {
      const job = await createDownloadJob(rawUrl, format, quality, sessionId);
      res.status(201).json({
        jobId: job.id,
        mode: job.mode,
        format: job.format,
        quality: job.quality,
        filename: job.filename,
        title: job.title,
        domain: job.domain,
        contentType: job.contentType,
        contentLength: job.contentLength,
        supportsRange: job.supportsRange,
        durationSeconds: job.durationSeconds,
        width: job.width,
        height: job.height,
        posterUrl: job.posterUrl,
        streamUrl: `/api/downloads/${job.id}/stream`,
        statusUrl: `/api/downloads/${job.id}/status`,
        eventsUrl: job.mode === 'transcode' ? `/api/downloads/${job.id}/events` : null,
        fileUrl: job.mode === 'transcode' ? `/api/downloads/${job.id}/file` : null,
      });
    } catch (err) {
      if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(503).json({
        error: 'Could not initialize the download job. Verify the URL is supported and try again.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  });

  // 7. Check Download Progress & Status (JSON)
  app.get('/api/downloads/:id/status', (req, res) => {
    const jobId = req.params.id;
    if (!isValidUuid(jobId)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }

    const job = getJob(jobId);
    const sessionId = readExistingSessionId(req);
    if (!job || (sessionId && job.sessionId !== sessionId)) {
      res.status(404).json({ error: 'Download job not found or expired.' });
      return;
    }

    res.json({
      jobId: job.id,
      mode: job.mode,
      status: job.status,
      percent: job.percent,
      processedBytes: job.processedBytes,
      contentLength: job.contentLength,
      outputSizeBytes: job.outputSizeBytes,
      speedLabel: job.speedLabel,
      outTimeSeconds: job.outTimeSeconds,
      errorMessage: job.errorMessage,
      supportsRange: job.supportsRange,
      format: job.format,
      quality: job.quality,
    });
  });

  // 8. Server-Sent Events for Real Processing Progress
  app.get('/api/downloads/:id/events', (req, res) => {
    const jobId = req.params.id;
    if (!isValidUuid(jobId)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }

    const job = getJob(jobId);
    const sessionId = readExistingSessionId(req);
    if (!job || (sessionId && job.sessionId !== sessionId)) {
      res.status(404).json({ error: 'Download job not found or expired.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent({
      status: job.status,
      percent: job.percent,
      processedBytes: job.processedBytes,
      speedLabel: job.speedLabel,
      outTimeSeconds: job.outTimeSeconds,
      outputSizeBytes: job.outputSizeBytes,
      errorMessage: job.errorMessage,
    });

    if (job.status === 'ready' || job.status === 'error' || job.status === 'cancelled') {
      res.end();
      return;
    }

    const listener = (payload: unknown) => {
      sendEvent(payload);
      const st = (payload as { status: string }).status;
      if (st === 'ready' || st === 'error' || st === 'cancelled') {
        job.listeners.delete(listener);
        res.end();
      }
    };

    job.listeners.add(listener);
    res.on('close', () => {
      job.listeners.delete(listener);
    });
  });

  // 9. Direct Upstream Byte Stream Pass-Through with HTTP Range Support
  app.get('/api/downloads/:id/stream', async (req, res) => {
    const jobId = req.params.id;
    if (!isValidUuid(jobId)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }

    const job = getJob(jobId);
    const sessionId = readExistingSessionId(req);
    if (!job || job.mode !== 'direct' || (sessionId && job.sessionId !== sessionId)) {
      res.status(404).json({ error: 'Direct download stream not found or expired.' });
      return;
    }

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
    const forwardHeaders: Record<string, string> = {};
    if (rangeHeader) {
      if (!/^bytes=\d+-\d*$/.test(rangeHeader)) {
        res.status(416).json({ error: 'Invalid byte range header.' });
        return;
      }
      forwardHeaders.Range = rangeHeader;
    }

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    });

    try {
      const { response } = await safeFetch(job.resolvedMediaUrl, {
        method: 'GET',
        headers: forwardHeaders,
        signal: abortController.signal,
      });

      if ((!response.ok && response.status !== 206) || !response.body) {
        job.status = 'error';
        job.errorMessage = `Upstream server returned HTTP ${response.status}.`;
        persistJobOutcome(job, 'failed', null);
        res.status(502).json({ error: job.errorMessage });
        return;
      }

      res.status(response.status);
      const len = response.headers.get('content-length');
      const contentRange = response.headers.get('content-range');
      const acceptRanges = response.headers.get('accept-ranges');

      res.setHeader('Content-Type', job.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (len && /^\d+$/.test(len)) {
        res.setHeader('Content-Length', len);
      }

      let bytesInThisTransfer = 0;
      const nodeStream = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream);
      nodeStream.on('data', (chunk: Buffer) => {
        bytesInThisTransfer += chunk.length;
        job.processedBytes = Math.max(job.processedBytes, bytesInThisTransfer);
      });
      nodeStream.on('error', () => {
        job.status = 'error';
        job.errorMessage = 'Stream interrupted by upstream host.';
        persistJobOutcome(job, 'failed', null);
        if (!res.headersSent) {
          res.status(502).json({ error: job.errorMessage });
        } else {
          res.end();
        }
      });
      nodeStream.on('end', () => {
        if (!abortController.signal.aborted) {
          const finalSize = job.contentLength ?? bytesInThisTransfer;
          job.outputSizeBytes = finalSize;
          job.percent = 100;
          persistJobOutcome(job, 'completed', finalSize);
          setTimeout(() => cleanupJob(jobId), 30000);
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (abortController.signal.aborted) return;
      if (err instanceof SecurityValidationError) {
        job.status = 'error';
        job.errorMessage = err.message;
        persistJobOutcome(job, 'failed', null);
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (!res.headersSent) {
        job.status = 'error';
        job.errorMessage = 'Failed to stream media from source URL.';
        persistJobOutcome(job, 'failed', null);
        res.status(502).json({ error: job.errorMessage });
      }
    }
  });

  // 10. Serve Completed Processed File with HTTP Range Support
  app.get('/api/downloads/:id/file', (req, res) => {
    const jobId = req.params.id;
    if (!isValidUuid(jobId)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }

    const job = getJob(jobId);
    const sessionId = readExistingSessionId(req);
    if (
      !job ||
      (sessionId && job.sessionId !== sessionId) ||
      job.status !== 'ready' ||
      !job.outputPath ||
      !fs.existsSync(job.outputPath)
    ) {
      res.status(404).json({ error: 'Processed media file is not ready or has expired.' });
      return;
    }

    const stat = fs.statSync(job.outputPath);
    const totalSize = stat.size;
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';

    res.setHeader('Content-Type', job.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) {
        res.status(416).json({ error: 'Invalid byte range header.' });
        return;
      }
      const start = Number.parseInt(match[1], 10);
      const end = match[2] ? Math.min(totalSize - 1, Number.parseInt(match[2], 10)) : totalSize - 1;
      if (start >= totalSize || start > end) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        res.status(416).end();
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));

      const stream = fs.createReadStream(job.outputPath, { start, end });
      stream.on('end', () => {
        if (end >= totalSize - 1) {
          setTimeout(() => cleanupJob(jobId), 30000);
        }
      });
      res.on('close', () => {
        if (!res.writableFinished) {
          stream.destroy();
        }
      });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(totalSize));
    const stream = fs.createReadStream(job.outputPath);
    stream.on('end', () => {
      setTimeout(() => cleanupJob(jobId), 30000);
    });
    res.on('close', () => {
      if (!res.writableFinished) {
        stream.destroy();
      }
    });
    stream.pipe(res);
  });

  // 11. Cancel Active Download Job
  const handleCancelRoute = (req: express.Request, res: express.Response) => {
    const jobId = req.params.id;
    if (!isValidUuid(jobId)) {
      res.status(400).json({ error: 'Invalid job ID.' });
      return;
    }

    const job = getJob(jobId);
    const sessionId = readExistingSessionId(req);
    if (!job || (sessionId && job.sessionId !== sessionId)) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    const cancelled = cancelJob(jobId);
    if (!cancelled) {
      res.status(409).json({ error: 'Download cannot be cancelled in its current state.' });
      return;
    }
    res.json({ ok: true, jobId, status: 'cancelled' });
  };

  app.delete('/api/downloads/:id', handleCancelRoute);
  app.post('/api/downloads/:id/cancel', handleCancelRoute);

  // 12. Retrieve & Manage Persisted Download History
  app.get('/api/history', (req, res) => {
    const sessionId = getOrCreateSessionId(req, res);
    const items = listSessionHistory(sessionId);
    res.json({ items });
  });

  app.post('/api/history/record-failure', (req, res) => {
    const sessionId = getOrCreateSessionId(req, res);
    const rawUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim().slice(0, 2048) : '';
    const format = (typeof req.body?.format === 'string' ? req.body.format.toLowerCase() : 'mp4') as MediaFormat;
    const quality = (typeof req.body?.quality === 'string' ? req.body.quality.toLowerCase() : 'source') as MediaQuality;
    const errorMessage =
      typeof req.body?.errorMessage === 'string'
        ? req.body.errorMessage.slice(0, 400)
        : 'URL validation failed.';

    if (!rawUrl || !ALLOWED_FORMATS.has(format) || !ALLOWED_QUALITIES.has(quality)) {
      res.status(400).json({ error: 'Invalid history record parameters.' });
      return;
    }

    let domain = 'unknown';
    try {
      domain = new URL(rawUrl).hostname || 'unknown';
    } catch {
      domain = 'invalid-url';
    }

    const id = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    recordServerHistory({
      id,
      sessionId,
      title: rawUrl,
      filename: `failed.${format}`,
      sourceUrl: rawUrl,
      domain,
      format,
      quality,
      fileSizeBytes: null,
      durationSeconds: null,
      resolution: null,
      status: 'failed',
      errorMessage,
      thumbnailUrl: null,
      createdAt: Date.now(),
    });
    res.status(201).json({ ok: true, id });
  });

  app.delete('/api/history/:id', (req, res) => {
    const sessionId = readExistingSessionId(req);
    if (!sessionId) {
      res.json({ ok: true, removed: false });
      return;
    }
    const id = req.params.id;
    if (!id || id.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid history entry ID.' });
      return;
    }
    const removed = deleteSessionHistoryItem(sessionId, id);
    res.json({ ok: true, removed });
  });

  app.delete('/api/history', (req, res) => {
    const sessionId = readExistingSessionId(req);
    if (!sessionId) {
      res.json({ ok: true, removedCount: 0 });
      return;
    }
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const filter =
      statusParam === 'completed' || statusParam === 'failed' ? statusParam : undefined;
    const removedCount = clearSessionHistory(sessionId, filter);
    res.json({ ok: true, removedCount });
  });

  // 13. Safe HTTP Range-Enabled Preview Proxy for In-App Player
  app.get('/api/preview', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Missing url query parameter.' });
      return;
    }

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    });

    try {
      await validatePublicHttpUrl(rawUrl);
      const inspection = await inspectMediaUrl(rawUrl);
      if (inspection.isHls) {
        res.status(415).json({
          error: 'HLS playlists must be downloaded into MP4 before in-app playback.',
        });
        return;
      }

      const forwardHeaders: Record<string, string> = {};
      if (typeof req.headers.range === 'string') {
        forwardHeaders.Range = req.headers.range;
      }

      const { response } = await safeFetch(inspection.resolvedMediaUrl, {
        method: 'GET',
        headers: forwardHeaders,
        signal: abortController.signal,
      });

      if ((!response.ok && response.status !== 206) || !response.body) {
        res.status(502).json({ error: 'Source server did not return playable media.' });
        return;
      }

      res.status(response.status);
      const ct = response.headers.get('content-type') || inspection.contentType;
      res.setHeader('Content-Type', ct);
      res.setHeader('Accept-Ranges', response.headers.get('accept-ranges') || 'bytes');
      const cl = response.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = response.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);

      const nodeStream = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (abortController.signal.aborted) return;
      if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      if (!res.headersSent) {
        res.status(503).json({ error: 'Unable to preview media stream right now.' });
      }
    }
  });

  // Ensure unmatched /api/* routes return JSON 404 instead of SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.error(
        '[VEXORA] Production build missing dist/index.html. Run "npm run build" before starting in production.'
      );
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res, next) => {
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(503).send('VEXORA frontend build is missing. Run "npm run build" and restart the server.');
        return;
      }
      res.sendFile(indexHtmlPath, (err) => {
        if (err) next(err);
      });
    });
  }

  // Global Express error handler (logs full server details, returns safe error message)
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[VEXORA error] ${req.method} ${req.path}:`, err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`VEXORA server listening on port ${PORT} (${serverConfig.nodeEnv})`);
    for (const warning of serverConfig.configWarnings) {
      console.warn(`[VEXORA config] ${warning}`);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`[VEXORA] Received ${signal}, closing HTTP server gracefully...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[VEXORA unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[VEXORA uncaughtException]', err);
  process.exit(1);
});

startServer().catch((err) => {
  console.error('Failed to start VEXORA server:', err);
  process.exit(1);
});
