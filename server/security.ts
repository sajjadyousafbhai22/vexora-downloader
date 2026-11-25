import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type { UrlValidationCode } from '../src/types/vexora.ts';
import { serverConfig } from './config.ts';

export class SecurityValidationError extends Error {
  statusCode: number;
  code: UrlValidationCode;
  constructor(message: string, statusCode = 400, code: UrlValidationCode = 'INVALID_SYNTAX') {
    super(message);
    this.name = 'SecurityValidationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
  '::',
  '::1',
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')], // Current network
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')], // Private
    [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')], // CGNAT
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')], // Loopback
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')], // Link-local / Cloud metadata
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')], // Private
    [ipv4ToInt('192.0.0.0'), ipv4ToInt('192.0.0.255')], // IETF protocol
    [ipv4ToInt('192.0.2.0'), ipv4ToInt('192.0.2.255')], // TEST-NET-1
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')], // Private
    [ipv4ToInt('198.18.0.0'), ipv4ToInt('198.19.255.255')], // Benchmark
    [ipv4ToInt('198.51.100.0'), ipv4ToInt('198.51.100.255')], // TEST-NET-2
    [ipv4ToInt('203.0.113.0'), ipv4ToInt('203.0.113.255')], // TEST-NET-3
    [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')], // Multicast & reserved
  ];
  return ranges.some(([start, end]) => num >= start && num <= end);
}

function isBlockedIpv6(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().split('%')[0];
  if (ip === '::' || ip === '::1') return true;

  // Check IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice(7);
    if (net.isIPv4(tail)) {
      return isBlockedIpv4(tail);
    }
    const hexParts = tail.split(':');
    if (hexParts.length === 2) {
      const high = Number.parseInt(hexParts[0], 16);
      const low = Number.parseInt(hexParts[1], 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isBlockedIpv4(ipv4);
      }
    }
  }

  // Unique local addresses (fc00::/7 -> fc00..fdff)
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  // Link-local (fe80::/10)
  if (/^fe[89ab]/.test(ip)) return true;
  // Multicast (ff00::/8)
  if (ip.startsWith('ff')) return true;

  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

export interface ValidatedUrlResult {
  url: URL;
  hostname: string;
}

export async function validatePublicHttpUrl(rawInput: string): Promise<ValidatedUrlResult> {
  if (typeof rawInput !== 'string') {
    throw new SecurityValidationError('Please enter a valid video URL.', 400, 'INVALID_SYNTAX');
  }
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new SecurityValidationError(
      'URL must be between 1 and 2048 characters.',
      400,
      'INVALID_SYNTAX'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SecurityValidationError(
      'Invalid URL format. Include http:// or https:// (for example, https://example.com/video.mp4).',
      400,
      'INVALID_SYNTAX'
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityValidationError(
      `Unsupported protocol "${parsed.protocol.replace(':', '')}". Only http:// and https:// URLs are supported.`,
      400,
      'UNSUPPORTED_PROTOCOL'
    );
  }

  if (parsed.username || parsed.password) {
    throw new SecurityValidationError(
      'URLs containing embedded credentials are not allowed.',
      400,
      'INVALID_SYNTAX'
    );
  }

  const pathnameLower = parsed.pathname.toLowerCase();
  if (
    pathnameLower.endsWith('.apk') ||
    pathnameLower.endsWith('.exe') ||
    pathnameLower.endsWith('.msi') ||
    pathnameLower.endsWith('.dmg') ||
    pathnameLower.endsWith('.ipa')
  ) {
    throw new SecurityValidationError(
      'Executable and Android APK package downloads are strictly disabled on VEXORA.',
      415,
      'BLOCKED_EXECUTABLE'
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new SecurityValidationError(
      'Blocked URL: Private, local, or internal network addresses are not permitted.',
      403,
      'BLOCKED_NETWORK'
    );
  }

  if (serverConfig.allowedHostAllowlist.length > 0) {
    const allowed = serverConfig.allowedHostAllowlist.some(
      (entry) => hostname === entry || hostname.endsWith(`.${entry}`)
    );
    if (!allowed) {
      throw new SecurityValidationError(
        `Domain "${hostname}" is not in the server's configured allowed source hosts.`,
        403,
        'RESTRICTED_PLATFORM'
      );
    }
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new SecurityValidationError(
        'Blocked URL: Private or loopback IP addresses are not permitted.',
        403,
        'BLOCKED_NETWORK'
      );
    }
    return { url: parsed, hostname };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SecurityValidationError(
      `Could not resolve host "${hostname}". Check the URL and verify it is publicly reachable.`,
      422,
      'UNREACHABLE'
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new SecurityValidationError(
      `Host "${hostname}" did not resolve to any address.`,
      422,
      'UNREACHABLE'
    );
  }

  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      throw new SecurityValidationError(
        'Blocked URL: Target host resolves to a restricted private or internal network address.',
        403,
        'BLOCKED_NETWORK'
      );
    }
  }

  return { url: parsed, hostname };
}

export interface SafeFetchResult {
  response: globalThis.Response;
  finalUrl: string;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await validatePublicHttpUrl(currentUrl);

    const headers = new Headers(init.headers);
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', 'VEXORA-Media-Fetcher/1.0 (+https://vexora.app)');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const parentSignal = init.signal;

    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('Request aborted');
      }
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }

    let response: globalThis.Response;
    try {
      response = await fetch(currentUrl, {
        ...init,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      if (parentSignal) {
        parentSignal.removeEventListener('abort', onParentAbort);
      }
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { response, finalUrl: currentUrl };
      }
      if (hop === maxRedirects) {
        throw new SecurityValidationError('Too many redirects from source URL.', 422);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new SecurityValidationError('Redirect limit exceeded.', 422);
}

export function sanitizeFilename(rawName: string, extension: string): string {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  const base = rawName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);

  const safeBase = base.length > 0 ? base : 'vexora_media';
  return `${safeBase}.${cleanExt}`;
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function resolveConfinedJobFile(jobsDir: string, jobId: string, ext: string): string {
  if (!isValidUuid(jobId)) {
    throw new SecurityValidationError('Invalid download job identifier.', 400);
  }
  const cleanExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!cleanExt) {
    throw new SecurityValidationError('Invalid file extension.', 400);
  }
  const baseDir = path.resolve(jobsDir);
  const resolved = path.resolve(baseDir, `${jobId}.${cleanExt}`);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new SecurityValidationError('Invalid file path.', 400);
  }
  return resolved;
}

export function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const history = buckets.get(ip) || [];
    const recent = history.filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait a few seconds before making another request.',
      });
      return;
    }

    recent.push(now);
    buckets.set(ip, recent);

    if (buckets.size > 2000) {
      for (const [key, timestamps] of buckets.entries()) {
        if (timestamps.every((ts) => now - ts >= windowMs)) {
          buckets.delete(key);
        }
      }
    }

    next();
  };
}

export function resolveTrustedOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (!origin || origin === 'null' || origin.includes('*')) {
    return null;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return null;
  }

  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
    return null;
  }

  const originHost = originUrl.host.toLowerCase();
  const forwardedHost = (typeof req.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host'].split(',')[0].trim()
    : ''
  ).toLowerCase();
  const hostHeader = (req.headers.host || '').toLowerCase();

  if ((forwardedHost && originHost === forwardedHost) || (hostHeader && originHost === hostHeader)) {
    return originUrl.origin;
  }

  if (serverConfig.allowedOrigins.includes(originUrl.origin)) {
    return originUrl.origin;
  }

  return null;
}

export function verifyOriginMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  if (!resolveTrustedOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin request blocked by server policy.' });
    return;
  }

  next();
}

