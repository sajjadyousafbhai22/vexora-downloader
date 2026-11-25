import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AvailableFormatOption,
  AvailableQualityOption,
  MediaFormat,
  MediaInspectionResult,
  MediaQuality,
  UrlValidationCode,
} from '../src/types/vexora.ts';
import {
  resolveConfinedJobFile,
  safeFetch,
  sanitizeFilename,
  SecurityValidationError,
  validatePublicHttpUrl,
} from './security.ts';
import { getBinaryStatus, serverConfig } from './config.ts';
import { recordServerHistory } from './historyStore.ts';
import {
  classifySourceKind,
  detectHlsDrm,
  detectHtmlDrmOrPaywall,
  findRestrictedPlatform,
} from './sources.ts';

export class UnsupportedMediaError extends Error {
  statusCode: number;
  code: UrlValidationCode;
  constructor(message: string, statusCode = 422, code: UrlValidationCode = 'UNSUPPORTED_MEDIA') {
    super(message);
    this.name = 'UnsupportedMediaError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const JOBS_DIR = serverConfig.jobsDir;

export const ALLOWED_FORMATS = new Set<MediaFormat>(['mp4', 'webm', 'mkv', 'mp3', 'm4a']);
export const ALLOWED_QUALITIES = new Set<MediaQuality>([
  'source',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '480p',
  '360p',
  '320k',
  '192k',
  '128k',
]);

const MEDIA_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mkv',
  '.mp3',
  '.m4a',
  '.ogg',
  '.wav',
  '.aac',
  '.m3u8',
];

export const FORMAT_CONTENT_TYPES: Record<MediaFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

function isApkOrBlockedMime(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.includes('android.package-archive') ||
    lower.includes('x-msdownload') ||
    lower.includes('x-executable') ||
    lower.includes('x-sh')
  );
}

function isDirectMediaContentType(contentType: string, pathname: string): boolean {
  const lower = contentType.toLowerCase().split(';')[0].trim();
  if (isApkOrBlockedMime(lower)) return false;
  if (lower.startsWith('video/') || lower.startsWith('audio/')) return true;
  if (
    lower === 'application/vnd.apple.mpegurl' ||
    lower === 'application/x-mpegurl' ||
    lower === 'audio/mpegurl'
  ) {
    return true;
  }
  if (lower === 'application/octet-stream' || lower === 'binary/octet-stream') {
    const pathLower = pathname.toLowerCase();
    return MEDIA_EXTENSIONS.some((ext) => pathLower.endsWith(ext));
  }
  return false;
}

function isHlsSource(contentType: string, urlStr: string): boolean {
  const lower = contentType.toLowerCase();
  const pathLower = new URL(urlStr).pathname.toLowerCase();
  return (
    lower.includes('mpegurl') ||
    pathLower.endsWith('.m3u8')
  );
}

function deriveTitleFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      return decodeURIComponent(last).replace(/\.[^/.]+$/, '') || u.hostname;
    }
    return u.hostname;
  } catch {
    return 'VEXORA Media';
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractMediaFromHtml(
  html: string,
  baseUrl: string
): { mediaUrls: string[]; title: string | null; posterUrl: string | null } {
  const candidates: string[] = [];

  const metaPatterns = [
    /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video:secure_url["']/gi,
    /<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video:url["']/gi,
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/gi,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /"contentUrl"\s*:\s*"([^"]+)"/gi,
  ];

  for (const regex of metaPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const raw = decodeHtmlEntities(match[1]);
      if (!raw || raw.startsWith('blob:') || raw.startsWith('data:') || raw.startsWith('javascript:')) {
        continue;
      }
      try {
        const resolved = new URL(raw, baseUrl).toString();
        if ((resolved.startsWith('http://') || resolved.startsWith('https://')) && !candidates.includes(resolved)) {
          candidates.push(resolved);
        }
      } catch {
        // Ignore malformed candidate
      }
    }
  }

  let pageTitle: string | null = null;
  const ogTitleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitleMatch?.[1]) {
    pageTitle = decodeHtmlEntities(ogTitleMatch[1]);
  } else {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      pageTitle = decodeHtmlEntities(titleMatch[1]);
    }
  }

  let posterUrl: string | null = null;
  const posterPatterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<video[^>]+poster=["']([^"']+)["']/i,
  ];

  for (const pattern of posterPatterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const rawPoster = decodeHtmlEntities(match[1]);
    if (
      !rawPoster ||
      rawPoster.startsWith('blob:') ||
      rawPoster.startsWith('data:') ||
      rawPoster.startsWith('javascript:')
    ) {
      continue;
    }
    try {
      const resolved = new URL(rawPoster, baseUrl).toString();
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        posterUrl = resolved;
        break;
      }
    } catch {
      // Ignore malformed poster URL
    }
  }

  return { mediaUrls: candidates, title: pageTitle, posterUrl };
}

interface ProbeSummary {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateBps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

async function runFfprobe(mediaUrl: string): Promise<ProbeSummary | null> {
  const binaries = getBinaryStatus();
  if (!binaries.ffprobeAvailable || !binaries.ffprobeResolvedPath) {
    return null;
  }
  return new Promise((resolve) => {
    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-protocol_whitelist',
      'http,https,tcp,tls',
      mediaUrl,
    ];

    const child = spawn(binaries.ffprobeResolvedPath!, args, { shell: false });
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(null);
    }, 10000);

    child.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes < 512 * 1024) {
        chunks.push(chunk);
      }
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          format?: { duration?: string; bit_rate?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
          }>;
        };
        const streams = parsed.streams || [];
        const videoStream = streams.find((s) => s.codec_type === 'video');
        const audioStream = streams.find((s) => s.codec_type === 'audio');
        const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : null;
        const bitrate = parsed.format?.bit_rate ? Number.parseInt(parsed.format.bit_rate, 10) : null;

        resolve({
          durationSeconds: duration && Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
          width: videoStream?.width ?? null,
          height: videoStream?.height ?? null,
          videoCodec: videoStream?.codec_name ?? null,
          audioCodec: audioStream?.codec_name ?? null,
          bitrateBps: bitrate && Number.isFinite(bitrate) ? bitrate : null,
          hasVideo: Boolean(videoStream),
          hasAudio: Boolean(audioStream),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

async function readLimitedText(response: globalThis.Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch {
    // Return what we captured
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

async function probeHeaders(url: string): Promise<{
  response: globalThis.Response;
  finalUrl: string;
  contentType: string;
  contentLength: number | null;
  supportsRange: boolean;
}> {
  let { response, finalUrl } = await safeFetch(url, { method: 'HEAD' });

  if (response.status === 405 || response.status === 501 || response.status === 403) {
    const ranged = await safeFetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-16383' },
    });
    response = ranged.response;
    finalUrl = ranged.finalUrl;
    if (response.body) {
      await response.body.cancel().catch(() => {});
    }
  }

  if (!response.ok && response.status !== 206) {
    if (response.status === 401 || response.status === 403) {
      throw new UnsupportedMediaError(
        `Source requires authorization or blocked automated access (HTTP ${response.status}). Only public, unauthenticated streams are supported.`,
        403,
        'AUTH_REQUIRED'
      );
    }
    throw new UnsupportedMediaError(
      `Source server returned HTTP ${response.status}. Verify the URL is publicly accessible without sign-in.`,
      422,
      'UNREACHABLE'
    );
  }

  const contentType = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
  const contentDisposition = (response.headers.get('content-disposition') || '').toLowerCase();
  if (
    contentDisposition.includes('.apk') ||
    contentDisposition.includes('.exe') ||
    contentDisposition.includes('.msi')
  ) {
    throw new UnsupportedMediaError(
      'Executable and Android APK package downloads are strictly disabled on VEXORA.',
      415,
      'BLOCKED_EXECUTABLE'
    );
  }

  const contentRange = response.headers.get('content-range');
  const acceptRanges = (response.headers.get('accept-ranges') || '').toLowerCase();
  const supportsRange = response.status === 206 || acceptRanges.includes('bytes');

  let contentLength: number | null = null;
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match?.[1]) {
      contentLength = Number.parseInt(match[1], 10);
    }
  }
  if (contentLength === null) {
    const lenHeader = response.headers.get('content-length');
    if (lenHeader && /^\d+$/.test(lenHeader)) {
      contentLength = Number.parseInt(lenHeader, 10);
    }
  }

  return { response, finalUrl, contentType, contentLength, supportsRange };
}

export async function inspectMediaUrl(rawUrl: string): Promise<MediaInspectionResult> {
  const { url } = await validatePublicHttpUrl(rawUrl);

  const preRestricted = findRestrictedPlatform(url.hostname);
  if (preRestricted) {
    throw new UnsupportedMediaError(
      `Unsupported or protected URL (${preRestricted.label}): ${preRestricted.reason} Paste a direct public video URL (.mp4, .webm, .mov, .m3u8) or an open HTML5 video page.`,
      422,
      'RESTRICTED_PLATFORM'
    );
  }

  let headerInfo: {
    response: globalThis.Response;
    finalUrl: string;
    contentType: string;
    contentLength: number | null;
    supportsRange: boolean;
  };
  try {
    headerInfo = await probeHeaders(url.toString());
  } catch (err) {
    if (err instanceof SecurityValidationError || err instanceof UnsupportedMediaError) {
      throw err;
    }
    throw new UnsupportedMediaError(
      'Unable to reach the target URL. Verify the link is online and publicly accessible.',
      422,
      'UNREACHABLE'
    );
  }

  const finalParsed = new URL(headerInfo.finalUrl);
  const domain = finalParsed.hostname;

  if (isApkOrBlockedMime(headerInfo.contentType)) {
    throw new UnsupportedMediaError(
      'Unsupported file type: Executable and APK packages are strictly blocked.',
      415,
      'BLOCKED_EXECUTABLE'
    );
  }

  let resolvedMediaUrl = headerInfo.finalUrl;
  let mediaContentType = headerInfo.contentType;
  let mediaContentLength = headerInfo.contentLength;
  let mediaSupportsRange = headerInfo.supportsRange;
  let pageTitle: string | null = null;
  let pagePoster: string | null = null;
  let extractedFromPage = false;

  if (!isDirectMediaContentType(headerInfo.contentType, finalParsed.pathname)) {
    const lowerType = headerInfo.contentType.toLowerCase();
    if (lowerType.includes('text/html') || lowerType.includes('application/xhtml+xml')) {
      const restricted = findRestrictedPlatform(domain);
      const { response: htmlResp, finalUrl: htmlFinalUrl } = await safeFetch(headerInfo.finalUrl, {
        method: 'GET',
      });
      const html = await readLimitedText(htmlResp, 512 * 1024);
      const drmReason = detectHtmlDrmOrPaywall(html);
      const extracted = extractMediaFromHtml(html, htmlFinalUrl);
      pageTitle = extracted.title;
      pagePoster = extracted.posterUrl;

      let chosenCandidate: {
        url: string;
        contentType: string;
        contentLength: number | null;
        supportsRange: boolean;
      } | null = null;

      for (const candidate of extracted.mediaUrls.slice(0, 5)) {
        try {
          await validatePublicHttpUrl(candidate);
          const candidateHeaders = await probeHeaders(candidate);
          const candidatePath = new URL(candidateHeaders.finalUrl).pathname;
          if (isDirectMediaContentType(candidateHeaders.contentType, candidatePath)) {
            chosenCandidate = {
              url: candidateHeaders.finalUrl,
              contentType: candidateHeaders.contentType,
              contentLength: candidateHeaders.contentLength,
              supportsRange: candidateHeaders.supportsRange,
            };
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      if (!chosenCandidate) {
        if (drmReason) {
          throw new UnsupportedMediaError(drmReason, 422, 'DRM_PROTECTED');
        }
        if (restricted) {
          throw new UnsupportedMediaError(
            `Unsupported or protected URL (${restricted.label}): ${restricted.reason} Paste a direct public video URL (.mp4, .webm, .mov, .m3u8) or an open HTML5 video page.`,
            422,
            'RESTRICTED_PLATFORM'
          );
        }
        throw new UnsupportedMediaError(
          'Unsupported URL: No downloadable video or audio stream was found on this webpage. Paste a direct media link (.mp4, .webm, .mov, .m3u8, .mp3) or a public HTML5 video page.',
          422,
          'UNSUPPORTED_MEDIA'
        );
      }

      resolvedMediaUrl = chosenCandidate.url;
      mediaContentType = chosenCandidate.contentType;
      mediaContentLength = chosenCandidate.contentLength;
      mediaSupportsRange = chosenCandidate.supportsRange;
      extractedFromPage = true;
    } else {
      throw new UnsupportedMediaError(
        `Unsupported media type (${headerInfo.contentType}): This URL does not point to a downloadable video or audio stream.`,
        415,
        'UNSUPPORTED_MEDIA'
      );
    }
  }

  const binaries = getBinaryStatus();
  const isHls = isHlsSource(mediaContentType, resolvedMediaUrl);
  if (isHls && !binaries.ffmpegAvailable) {
    throw new UnsupportedMediaError(
      binaries.ffmpegError ||
        'FFmpeg is not installed or configured on this server. HLS (.m3u8) downloads require FFmpeg.',
      503,
      'SERVICE_UNAVAILABLE'
    );
  }

  const probe = await runFfprobe(resolvedMediaUrl);
  let detectedWidth = probe?.width ?? null;
  let detectedHeight = probe?.height ?? null;

  if (isHls) {
    try {
      const { response: hlsResp } = await safeFetch(resolvedMediaUrl, { method: 'GET' });
      if (hlsResp.ok) {
        const playlistText = await readLimitedText(hlsResp, 256 * 1024);
        const hlsDrmError = detectHlsDrm(playlistText);
        if (hlsDrmError) {
          throw new UnsupportedMediaError(hlsDrmError, 422, 'DRM_PROTECTED');
        }
        const resMatches = playlistText.matchAll(/RESOLUTION=(\d+)x(\d+)/gi);
        for (const match of resMatches) {
          const w = Number.parseInt(match[1], 10);
          const h = Number.parseInt(match[2], 10);
          if (Number.isFinite(w) && Number.isFinite(h)) {
            if (!detectedHeight || h > detectedHeight) {
              detectedHeight = h;
              detectedWidth = w;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof UnsupportedMediaError) {
        throw err;
      }
      // Keep ffprobe dimensions if playlist fetch fails
    }
  }

  const hasVideo = probe ? probe.hasVideo : !mediaContentType.startsWith('audio/');
  const hasAudio = probe ? probe.hasAudio : true;

  const title = pageTitle || deriveTitleFromUrl(resolvedMediaUrl);
  const pathLower = new URL(resolvedMediaUrl).pathname.toLowerCase();
  const ctLower = mediaContentType.toLowerCase();
  const extFromMime: MediaFormat =
    ctLower.includes('webm') || pathLower.endsWith('.webm')
      ? 'webm'
      : ctLower.includes('matroska') || pathLower.endsWith('.mkv')
        ? 'mkv'
        : (ctLower.includes('mpeg') && ctLower.startsWith('audio/')) || pathLower.endsWith('.mp3')
          ? 'mp3'
          : (ctLower.includes('mp4') && ctLower.startsWith('audio/')) ||
              ctLower.includes('x-m4a') ||
              pathLower.endsWith('.m4a')
            ? 'm4a'
            : hasVideo
              ? 'mp4'
              : 'mp3';

  const allSupportedFormats: AvailableFormatOption[] = [
    { id: 'mp4', label: 'MP4', detail: 'H.264 / AAC', kind: 'video' },
    { id: 'webm', label: 'WebM', detail: 'VP9 / Opus', kind: 'video' },
    { id: 'mkv', label: 'MKV', detail: 'Matroska', kind: 'video' },
    { id: 'mp3', label: 'MP3', detail: 'Audio Track', kind: 'audio' },
    { id: 'm4a', label: 'M4A', detail: 'AAC Audio', kind: 'audio' },
  ];

  const availableFormats: AvailableFormatOption[] = [];
  if (binaries.ffmpegAvailable) {
    if (hasVideo) {
      availableFormats.push(...allSupportedFormats.slice(0, 3));
    }
    if (hasAudio) {
      availableFormats.push(...allSupportedFormats.slice(3));
    }
  } else {
    const directMatch = allSupportedFormats.find((item) => item.id === extFromMime);
    if (directMatch) {
      availableFormats.push(directMatch);
    }
  }

  const availableQualities: AvailableQualityOption[] = [];
  if (hasVideo) {
    availableQualities.push({
      id: 'source',
      label: detectedHeight ? `Source (${detectedHeight}p)` : 'Source',
      resolutionLabel:
        detectedWidth && detectedHeight ? `${detectedWidth}x${detectedHeight}` : null,
      fileSizeBytes: isHls ? null : mediaContentLength,
      isOriginal: true,
    });

    if (binaries.ffmpegAvailable && detectedHeight !== null) {
      const tiers: Array<{ id: MediaQuality; height: number; label: string }> = [
        { id: '2160p', height: 2160, label: '2160p 4K' },
        { id: '1440p', height: 1440, label: '1440p QHD' },
        { id: '1080p', height: 1080, label: '1080p HD' },
        { id: '720p', height: 720, label: '720p HD' },
        { id: '480p', height: 480, label: '480p SD' },
        { id: '360p', height: 360, label: '360p' },
      ];
      for (const tier of tiers) {
        if (detectedHeight >= tier.height) {
          availableQualities.push({
            id: tier.id,
            label: tier.label,
            resolutionLabel: `${tier.height}p`,
            fileSizeBytes: null,
            isOriginal: false,
          });
        }
      }
    }
  }

  return {
    sourceUrl: rawUrl,
    resolvedMediaUrl,
    title,
    domain,
    contentType: mediaContentType,
    contentLength: mediaContentLength,
    supportsRange: mediaSupportsRange && !isHls,
    durationSeconds: probe?.durationSeconds ?? null,
    width: detectedWidth,
    height: detectedHeight,
    videoCodec: probe?.videoCodec ?? null,
    audioCodec: probe?.audioCodec ?? null,
    bitrateBps: probe?.bitrateBps ?? null,
    hasVideo,
    hasAudio,
    isHls,
    recommendedFilename: sanitizeFilename(title, extFromMime),
    extractedFromPage,
    posterUrl: pagePoster,
    sourceType: classifySourceKind(mediaContentType, isHls, hasVideo, extractedFromPage),
    availableFormats,
    availableQualities,
  };
}

export interface DownloadJob {
  id: string;
  sessionId: string;
  mode: 'direct' | 'transcode';
  sourceUrl: string;
  resolvedMediaUrl: string;
  format: MediaFormat;
  quality: MediaQuality;
  title: string;
  filename: string;
  domain: string;
  contentType: string;
  contentLength: number | null;
  supportsRange: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error' | 'cancelled';
  percent: number | null;
  processedBytes: number;
  speedLabel: string | null;
  outTimeSeconds: number | null;
  errorMessage: string | null;
  outputPath: string | null;
  outputSizeBytes: number | null;
  createdAt: number;
  childProcess: ReturnType<typeof spawn> | null;
  listeners: Set<(event: JobProgressEvent) => void>;
}

export function persistJobOutcome(
  job: DownloadJob,
  status: 'completed' | 'failed' | 'cancelled',
  fileSizeBytes: number | null = job.outputSizeBytes ?? job.contentLength
): void {
  recordServerHistory({
    id: job.id,
    sessionId: job.sessionId,
    title: job.title,
    filename: job.filename,
    sourceUrl: job.sourceUrl,
    domain: job.domain,
    format: job.format,
    quality: job.quality,
    fileSizeBytes,
    durationSeconds: job.durationSeconds,
    resolution: job.width && job.height ? `${job.width}x${job.height}` : null,
    status,
    errorMessage: job.errorMessage,
    thumbnailUrl: job.posterUrl,
    createdAt: job.createdAt,
  });
}

export interface JobProgressEvent {
  status: DownloadJob['status'];
  percent: number | null;
  processedBytes: number;
  speedLabel: string | null;
  outTimeSeconds: number | null;
  outputSizeBytes: number | null;
  errorMessage: string | null;
}

const jobs = new Map<string, DownloadJob>();

// Periodic cleanup of expired jobs (15 minutes)
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) {
      cleanupJob(id);
    }
  }
}, 60 * 1000).unref();

export function getJob(jobId: string): DownloadJob | undefined {
  return jobs.get(jobId);
}

export function cleanupJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  if (job.childProcess && !job.childProcess.killed) {
    job.childProcess.kill('SIGTERM');
  }
  if (job.outputPath && fs.existsSync(job.outputPath)) {
    fs.unlink(job.outputPath, () => {});
  }
  const inputTempPath = resolveConfinedJobFile(JOBS_DIR, jobId, 'input');
  if (fs.existsSync(inputTempPath)) {
    fs.unlink(inputTempPath, () => {});
  }
  job.listeners.clear();
  jobs.delete(jobId);
}

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'cancelled' || job.status === 'error') return false;
  job.status = 'cancelled';
  job.errorMessage = 'Download cancelled by user.';
  if (job.childProcess && !job.childProcess.killed) {
    job.childProcess.kill('SIGTERM');
  }
  persistJobOutcome(job, 'cancelled', null);
  emitJobEvent(job);
  setTimeout(() => cleanupJob(jobId), 3000);
  return true;
}

function emitJobEvent(job: DownloadJob): void {
  const payload: JobProgressEvent = {
    status: job.status,
    percent: job.percent,
    processedBytes: job.processedBytes,
    speedLabel: job.speedLabel,
    outTimeSeconds: job.outTimeSeconds,
    outputSizeBytes: job.outputSizeBytes,
    errorMessage: job.errorMessage,
  };
  for (const listener of job.listeners) {
    listener(payload);
  }
}

function sourceMatchesDirectFormat(inspection: MediaInspectionResult, format: MediaFormat, quality: MediaQuality): boolean {
  if (quality !== 'source') return false;
  if (inspection.isHls) return false;
  const ct = inspection.contentType.toLowerCase();
  const pathLower = new URL(inspection.resolvedMediaUrl).pathname.toLowerCase();

  if (format === 'mp4') return ct === 'video/mp4' || pathLower.endsWith('.mp4') || pathLower.endsWith('.m4v');
  if (format === 'webm') return ct === 'video/webm' || pathLower.endsWith('.webm');
  if (format === 'mkv') return ct.includes('matroska') || pathLower.endsWith('.mkv');
  if (format === 'mp3') return ct === 'audio/mpeg' || pathLower.endsWith('.mp3');
  if (format === 'm4a') return ct === 'audio/mp4' || ct === 'audio/x-m4a' || pathLower.endsWith('.m4a');
  return false;
}

function buildFfmpegArgs(
  inputSource: string,
  outputPath: string,
  format: MediaFormat,
  quality: MediaQuality,
  hasVideo: boolean,
  isLocalInput: boolean
): string[] {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...(isLocalInput ? [] : ['-protocol_whitelist', 'http,https,tcp,tls']),
    '-i',
    inputSource,
    '-fs',
    String(serverConfig.maxMediaBytes),
    '-progress',
    'pipe:1',
    '-nostats',
  ];

  const isAudioTarget = format === 'mp3' || format === 'm4a';

  if (isAudioTarget) {
    const bitrate =
      quality === '320k' || quality === '192k' || quality === '128k' ? quality : '192k';
    args.push('-vn');
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    } else {
      args.push('-c:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart');
    }
    args.push(outputPath);
    return args;
  }

  if (!hasVideo && !isAudioTarget) {
    throw new UnsupportedMediaError(
      'This source is audio-only. Select MP3 or M4A format to download it.',
      422
    );
  }

  const heightMap: Record<string, number> = {
    '2160p': 2160,
    '1440p': 1440,
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360,
  };
  const targetHeight = heightMap[quality];

  if (quality === 'source' && (format === 'mp4' || format === 'mkv')) {
    args.push('-c', 'copy');
    if (format === 'mp4') {
      args.push('-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart');
    }
    args.push(outputPath);
    return args;
  }

  if (targetHeight) {
    args.push('-vf', `scale=-2:'min(${targetHeight},ih)'`);
  }

  if (format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'realtime', '-c:a', 'libopus');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k');
    if (format === 'mp4') {
      args.push('-movflags', '+faststart');
    }
  }

  args.push(outputPath);
  return args;
}

async function stageInputViaSafeFetch(
  url: string,
  destPath: string,
  job: DownloadJob
): Promise<void> {
  const { response } = await safeFetch(url, { method: 'GET' });
  if (!response.ok || !response.body) {
    throw new UnsupportedMediaError(`Upstream server returned HTTP ${response.status}.`, 422);
  }

  const maxBytes = serverConfig.maxMediaBytes;
  const totalHeader = response.headers.get('content-length');
  const expectedBytes = totalHeader && /^\d+$/.test(totalHeader) ? Number.parseInt(totalHeader, 10) : null;
  if (expectedBytes && expectedBytes > maxBytes) {
    throw new UnsupportedMediaError(
      `Source media exceeds the ${serverConfig.maxMediaMb} MB server processing limit.`,
      413
    );
  }

  const reader = response.body.getReader();
  const writer = fs.createWriteStream(destPath);
  let received = 0;

  try {
    while (true) {
      if (job.status === 'cancelled') {
        await reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new UnsupportedMediaError(
          `Source media exceeds the ${serverConfig.maxMediaMb} MB server processing limit.`,
          413
        );
      }
      writer.write(Buffer.from(value));
      job.processedBytes = received;
      if (expectedBytes) {
        job.percent = Math.min(45, Math.round((received / expectedBytes) * 45));
      }
      emitJobEvent(job);
    }
  } finally {
    await new Promise<void>((resolve) => writer.end(() => resolve()));
  }
}

export async function createDownloadJob(
  rawUrl: string,
  format: MediaFormat,
  quality: MediaQuality,
  sessionId: string
): Promise<DownloadJob> {
  if (!ALLOWED_FORMATS.has(format)) {
    throw new UnsupportedMediaError(`Unsupported output format "${format}".`, 400);
  }
  if (!ALLOWED_QUALITIES.has(quality)) {
    throw new UnsupportedMediaError(`Unsupported quality preset "${quality}".`, 400);
  }

  const inspection = await inspectMediaUrl(rawUrl);

  if (!inspection.hasVideo && format !== 'mp3' && format !== 'm4a') {
    throw new UnsupportedMediaError(
      'This URL points to an audio-only stream. Choose MP3 or M4A format to download.',
      422
    );
  }

  if (!inspection.hasAudio && (format === 'mp3' || format === 'm4a')) {
    throw new UnsupportedMediaError(
      'This video stream has no audio track to extract. Choose MP4, WebM, or MKV.',
      422
    );
  }

  const heightCheckMap: Record<string, number> = {
    '2160p': 2160,
    '1440p': 1440,
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360,
  };
  const requestedHeight = heightCheckMap[quality];
  if (requestedHeight && inspection.height !== null && inspection.height < requestedHeight) {
    throw new UnsupportedMediaError(
      `Requested quality ${quality} is not available because the source video is ${inspection.height}p. Choose Source or ${inspection.height}p or lower.`,
      422
    );
  }

  const jobId = crypto.randomUUID();
  const filename = sanitizeFilename(inspection.title, format);
  const direct = sourceMatchesDirectFormat(inspection, format, quality);

  if (direct) {
    const job: DownloadJob = {
      id: jobId,
      sessionId,
      mode: 'direct',
      sourceUrl: rawUrl,
      resolvedMediaUrl: inspection.resolvedMediaUrl,
      format,
      quality,
      title: inspection.title,
      filename,
      domain: inspection.domain,
      contentType: FORMAT_CONTENT_TYPES[format],
      contentLength: inspection.contentLength,
      supportsRange: inspection.supportsRange,
      durationSeconds: inspection.durationSeconds,
      width: inspection.width,
      height: inspection.height,
      posterUrl: inspection.posterUrl,
      status: 'ready',
      percent: 0,
      processedBytes: 0,
      speedLabel: null,
      outTimeSeconds: null,
      errorMessage: null,
      outputPath: null,
      outputSizeBytes: inspection.contentLength,
      createdAt: Date.now(),
      childProcess: null,
      listeners: new Set(),
    };
    jobs.set(jobId, job);
    return job;
  }

  const binaries = getBinaryStatus();
  if (!binaries.ffmpegAvailable || !binaries.ffmpegResolvedPath) {
    throw new UnsupportedMediaError(
      binaries.ffmpegError ||
        'Server transcoding service (FFmpeg) is not installed or configured on this host. Direct original-quality downloads remain available.',
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
  if (!binaries.jobsDirWritable) {
    throw new UnsupportedMediaError(
      binaries.jobsDirError || 'Server temporary storage directory is unavailable for media processing.',
      503,
      'SERVICE_UNAVAILABLE'
    );
  }

  const outputPath = resolveConfinedJobFile(JOBS_DIR, jobId, format);
  const inputTempPath = resolveConfinedJobFile(JOBS_DIR, jobId, 'input');

  const job: DownloadJob = {
    id: jobId,
    sessionId,
    mode: 'transcode',
    sourceUrl: rawUrl,
    resolvedMediaUrl: inspection.resolvedMediaUrl,
    format,
    quality,
    title: inspection.title,
    filename,
    domain: inspection.domain,
    contentType: FORMAT_CONTENT_TYPES[format],
    contentLength: inspection.contentLength,
    supportsRange: true,
    durationSeconds: inspection.durationSeconds,
    width: inspection.width,
    height: inspection.height,
    posterUrl: inspection.posterUrl,
    status: 'processing',
    percent: 0,
    processedBytes: 0,
    speedLabel: null,
    outTimeSeconds: 0,
    errorMessage: null,
    outputPath,
    outputSizeBytes: null,
    createdAt: Date.now(),
    childProcess: null,
    listeners: new Set(),
  };

  jobs.set(jobId, job);

  // Run staging & ffmpeg asynchronously so SSE client can attach immediately
  void (async () => {
    try {
      const isLocalInput = !inspection.isHls;
      if (isLocalInput) {
        await stageInputViaSafeFetch(inspection.resolvedMediaUrl, inputTempPath, job);
        if (job.status === 'cancelled') return;
      }

      const ffmpegArgs = buildFfmpegArgs(
        isLocalInput ? inputTempPath : inspection.resolvedMediaUrl,
        outputPath,
        format,
        quality,
        inspection.hasVideo,
        isLocalInput
      );

      const child = spawn(binaries.ffmpegResolvedPath!, ffmpegArgs, { shell: false });
      job.childProcess = child;

      let stderrTail = '';
      let stdoutBuffer = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        let updated = false;
        for (const line of lines) {
          const [key, val] = line.split('=');
          if (!key || val === undefined) continue;
          const trimmedVal = val.trim();
          if (key === 'total_size' && /^\d+$/.test(trimmedVal)) {
            job.processedBytes = Number.parseInt(trimmedVal, 10);
            updated = true;
          } else if (key === 'out_time_us' && /^\d+$/.test(trimmedVal)) {
            const secs = Number.parseInt(trimmedVal, 10) / 1_000_000;
            job.outTimeSeconds = Math.round(secs * 10) / 10;
            if (job.durationSeconds && job.durationSeconds > 0) {
              const basePct = isLocalInput ? 45 : 0;
              const scalePct = isLocalInput ? 54 : 99;
              job.percent = Math.min(
                99,
                Math.max(basePct, Math.round(basePct + (secs / job.durationSeconds) * scalePct))
              );
            }
            updated = true;
          } else if (key === 'speed' && trimmedVal !== 'N/A') {
            job.speedLabel = trimmedVal;
            updated = true;
          }
        }

        if (updated && job.status === 'processing') {
          emitJobEvent(job);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1000);
      });

      child.on('error', () => {
        if (job.status === 'cancelled') return;
        job.status = 'error';
        job.errorMessage = 'Media processor failed to start on the server.';
        persistJobOutcome(job, 'failed', null);
        emitJobEvent(job);
      });

      child.on('close', (code) => {
        job.childProcess = null;
        if (fs.existsSync(inputTempPath)) {
          fs.unlink(inputTempPath, () => {});
        }
        if (job.status === 'cancelled') return;

        if (code === 0 && job.outputPath && fs.existsSync(job.outputPath)) {
          const stat = fs.statSync(job.outputPath);
          if (stat.size > 0) {
            job.status = 'ready';
            job.percent = 100;
            job.outputSizeBytes = stat.size;
            job.processedBytes = stat.size;
            persistJobOutcome(job, 'completed', stat.size);
            emitJobEvent(job);
            return;
          }
        }

        job.status = 'error';
        job.errorMessage =
          stderrTail.trim().split('\n').pop() ||
          'Unable to process this media stream into the requested format.';
        if (job.outputPath && fs.existsSync(job.outputPath)) {
          fs.unlink(job.outputPath, () => {});
        }
        persistJobOutcome(job, 'failed', null);
        emitJobEvent(job);
      });
    } catch (err) {
      if (fs.existsSync(inputTempPath)) {
        fs.unlink(inputTempPath, () => {});
      }
      if (job.status === 'cancelled') return;
      job.status = 'error';
      job.errorMessage =
        err instanceof Error ? err.message : 'Unable to stage source media for processing.';
      persistJobOutcome(job, 'failed', null);
      emitJobEvent(job);
    }
  })();

  return job;
}
