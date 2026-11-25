import type { MediaFormat, UrlValidationCode } from '../types/vexora';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 100 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) {
    return '—';
  }
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function isAudioFormat(format: MediaFormat): boolean {
  return format === 'mp3' || format === 'm4a';
}

export function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isApkUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.pathname.toLowerCase().endsWith('.apk');
  } catch {
    return raw.toLowerCase().includes('.apk');
  }
}

export type ClientSyntaxCheck =
  | { ok: true; normalizedUrl: string }
  | { ok: false; code: UrlValidationCode; title: string; message: string };

const PRIVATE_HOST_REGEX =
  /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|::1|::)$/i;

export function precheckUrlSyntax(raw: string): ClientSyntaxCheck {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: 'INVALID_SYNTAX',
      title: 'Missing URL',
      message: 'Please enter a video or audio URL before continuing.',
    };
  }
  if (trimmed.length > 2048) {
    return {
      ok: false,
      code: 'INVALID_SYNTAX',
      title: 'URL Too Long',
      message: 'URL must be 2048 characters or fewer.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      code: 'INVALID_SYNTAX',
      title: 'Invalid URL Format',
      message:
        'Include http:// or https:// and a valid domain name (for example, https://example.com/video.mp4).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROTOCOL',
      title: 'Unsupported Protocol',
      message: `Protocol "${parsed.protocol.replace(':', '')}" is not supported. Use http:// or https://.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: 'INVALID_SYNTAX',
      title: 'Invalid URL Format',
      message: 'URLs with embedded usernames or passwords are not permitted.',
    };
  }

  const pathnameLower = parsed.pathname.toLowerCase();
  if (
    pathnameLower.endsWith('.apk') ||
    pathnameLower.endsWith('.exe') ||
    pathnameLower.endsWith('.msi') ||
    pathnameLower.endsWith('.dmg') ||
    pathnameLower.endsWith('.ipa')
  ) {
    return {
      ok: false,
      code: 'BLOCKED_EXECUTABLE',
      title: 'Blocked File Type',
      message:
        'Executable and Android APK package downloads are disabled. VEXORA only supports web video and audio media.',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    !host.includes('.') && !PRIVATE_HOST_REGEX.test(host) ||
    PRIVATE_HOST_REGEX.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    if (
      PRIVATE_HOST_REGEX.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost')
    ) {
      return {
        ok: false,
        code: 'BLOCKED_NETWORK',
        title: 'Blocked Network Address',
        message: 'Private, local, or internal network URLs are not permitted.',
      };
    }
    return {
      ok: false,
      code: 'INVALID_SYNTAX',
      title: 'Invalid Hostname',
      message: 'Enter a complete public domain name (for example, https://example.com/video.mp4).',
    };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,')
  ) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function captureVideoThumbnail(objectUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finish(null), 3500);

    const captureFrame = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) {
          finish(null);
          return;
        }
        const targetWidth = 320;
        const targetHeight = Math.max(
          120,
          Math.min(240, Math.round((video.videoHeight / video.videoWidth) * targetWidth))
        );
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        finish(dataUrl.startsWith('data:image/jpeg') ? dataUrl : null);
      } catch {
        finish(null);
      }
    };

    video.addEventListener('error', () => finish(null), { once: true });
    video.addEventListener(
      'loadeddata',
      () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const seekTarget = dur > 0.6 ? Math.min(1.2, dur * 0.25) : 0;
        if (seekTarget > 0.05) {
          video.addEventListener('seeked', captureFrame, { once: true });
          try {
            video.currentTime = seekTarget;
          } catch {
            captureFrame();
          }
        } else {
          captureFrame();
        }
      },
      { once: true }
    );

    video.src = objectUrl;
  });
}

