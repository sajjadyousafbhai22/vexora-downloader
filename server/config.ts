import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import 'dotenv/config';
import { findRestrictedPlatform } from './sources.ts';

export interface BinaryStatus {
  ffmpegAvailable: boolean;
  ffmpegResolvedPath: string | null;
  ffmpegError: string | null;
  ffprobeAvailable: boolean;
  ffprobeResolvedPath: string | null;
  ffprobeError: string | null;
  jobsDirWritable: boolean;
  jobsDirError: string | null;
  dataDirWritable: boolean;
  dataDirError: string | null;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  appUrl: string;
  allowedOrigins: string[];
  jobsDir: string;
  dataDir: string;
  maxMediaBytes: number;
  maxMediaMb: number;
  ffmpegPath: string;
  ffprobePath: string;
  rateLimitMax: number;
  allowedHostAllowlist: string[];
  sessionSecret: Buffer;
  usesEphemeralSessionSecret: boolean;
  configWarnings: string[];
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveSafeDirectory(rawPath: string | undefined, fallbackDir: string): string {
  if (!rawPath || !rawPath.trim()) {
    return path.resolve(fallbackDir);
  }
  return path.resolve(rawPath.trim());
}

function normalizeConfiguredBinary(rawPath: string | undefined, defaultCommand: string): {
  command: string;
  unsafe: boolean;
} {
  const candidate = rawPath && rawPath.trim() ? rawPath.trim() : defaultCommand;
  if (candidate.includes('\0') || /[;&|`$<>]/.test(candidate)) {
    return { command: defaultCommand, unsafe: true };
  }
  return { command: candidate, unsafe: false };
}

function isExecutableBinaryFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCommandOnSystemPath(command: string): string | null {
  const hasSeparator = command.includes('/') || command.includes('\\') || path.isAbsolute(command);
  if (hasSeparator) {
    const resolved = path.resolve(command);
    return isExecutableBinaryFile(resolved) ? resolved : null;
  }

  const pathEntries = (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Include standard Unix binary directories as passive lookup fallbacks if PATH is minimal
  const searchDirs =
    process.platform === 'win32'
      ? pathEntries
      : Array.from(new Set([...pathEntries, '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']));

  const suffixes =
    process.platform === 'win32'
      ? ['', '.exe', '.cmd', '.bat']
      : [''];

  for (const dir of searchDirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${command}${suffix}`);
      if (isExecutableBinaryFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function ensureWritableDir(dirPath: string): { writable: boolean; error: string | null } {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { writable: false, error: 'Configured storage path exists but is not a directory.' };
    }
    fs.accessSync(dirPath, fs.constants.W_OK | fs.constants.R_OK);
    return { writable: true, error: null };
  } catch (err) {
    return {
      writable: false,
      error: err instanceof Error ? `Storage directory is not writable (${err.message}).` : 'Storage directory is not writable.',
    };
  }
}

const nodeEnv = (process.env.NODE_ENV || 'development').trim() || 'development';
const isProduction = nodeEnv === 'production';
const maxMediaMb = parsePositiveInt(process.env.VEXORA_MAX_MEDIA_MB, 500, 10, 2048);
const configWarnings: string[] = [];

// Reject wildcard origins ("*") and non-HTTP(S) origins so credentialed cookies are never exposed to arbitrary origins
const allowedOrigins = new Set<string>();
for (const rawOrigin of parseCsv(process.env.ALLOWED_ORIGINS)) {
  if (rawOrigin === '*' || rawOrigin.includes('*')) {
    configWarnings.push(
      'Wildcard entries in ALLOWED_ORIGINS are ignored because credentialed requests require explicit origins.'
    );
    continue;
  }
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      allowedOrigins.add(parsed.origin);
    } else {
      configWarnings.push(`Ignored invalid ALLOWED_ORIGINS entry "${rawOrigin}" (must be http:// or https://).`);
    }
  } catch {
    configWarnings.push(`Ignored malformed ALLOWED_ORIGINS entry "${rawOrigin}".`);
  }
}

const rawAppUrl = (process.env.APP_URL || '').trim();
const rawRenderUrl = (process.env.RENDER_EXTERNAL_URL || '').trim();
for (const candidateUrl of [rawAppUrl, rawRenderUrl]) {
  if (!candidateUrl) continue;
  try {
    const parsedCandidate = new URL(candidateUrl);
    if (parsedCandidate.protocol === 'http:' || parsedCandidate.protocol === 'https:') {
      allowedOrigins.add(parsedCandidate.origin);
    }
  } catch {
    configWarnings.push(`Configured URL "${candidateUrl}" is not a valid http:// or https:// URL.`);
  }
}

// Keep signing secret strictly in server memory; generate ephemeral fallback if unset for seamless preview startup
const rawSessionSecret = (process.env.VEXORA_SESSION_SECRET || '').trim();
const hasStrongSessionSecret = rawSessionSecret.length >= 16;
const sessionSecret = hasStrongSessionSecret
  ? crypto.createHash('sha256').update(rawSessionSecret).digest()
  : crypto.randomBytes(32);

if (isProduction && !hasStrongSessionSecret) {
  configWarnings.push(
    'VEXORA_SESSION_SECRET is unset or shorter than 16 characters in production; using an ephemeral per-process key.'
  );
}

const ffmpegCfg = normalizeConfiguredBinary(process.env.FFMPEG_PATH, 'ffmpeg');
const ffprobeCfg = normalizeConfiguredBinary(process.env.FFPROBE_PATH, 'ffprobe');
if (ffmpegCfg.unsafe) {
  configWarnings.push('Unsafe characters in FFMPEG_PATH were rejected; falling back to system PATH "ffmpeg".');
}
if (ffprobeCfg.unsafe) {
  configWarnings.push('Unsafe characters in FFPROBE_PATH were rejected; falling back to system PATH "ffprobe".');
}

const rawAllowedHosts = parseCsv(process.env.VEXORA_ALLOWED_HOSTS).map((h) => h.toLowerCase());
const filteredAllowedHosts: string[] = [];
const ignoredRestrictedHosts: string[] = [];
for (const hostEntry of rawAllowedHosts) {
  if (findRestrictedPlatform(hostEntry)) {
    ignoredRestrictedHosts.push(hostEntry);
  } else {
    filteredAllowedHosts.push(hostEntry);
  }
}
if (ignoredRestrictedHosts.length > 0) {
  configWarnings.push(
    `Ignored restricted platform entries in VEXORA_ALLOWED_HOSTS (${ignoredRestrictedHosts.join(', ')}): VEXORA enforces platform and DRM restrictions regardless of host allowlists.`
  );
}

export const serverConfig: ServerConfig = {
  port: parsePositiveInt(process.env.PORT, 3000, 1, 65535),
  nodeEnv,
  isProduction,
  appUrl: rawAppUrl || rawRenderUrl,
  allowedOrigins: Array.from(allowedOrigins),
  jobsDir: resolveSafeDirectory(process.env.VEXORA_JOBS_DIR, path.join(os.tmpdir(), 'vexora-jobs')),
  dataDir: resolveSafeDirectory(process.env.VEXORA_DATA_DIR, path.join(os.tmpdir(), 'vexora-data')),
  maxMediaMb,
  maxMediaBytes: maxMediaMb * 1024 * 1024,
  ffmpegPath: ffmpegCfg.command,
  ffprobePath: ffprobeCfg.command,
  rateLimitMax: parsePositiveInt(process.env.VEXORA_RATE_LIMIT_MAX, 300, 20, 5000),
  allowedHostAllowlist: filteredAllowedHosts,
  sessionSecret,
  usesEphemeralSessionSecret: !hasStrongSessionSecret,
  configWarnings,
};

ensureWritableDir(serverConfig.jobsDir);
ensureWritableDir(serverConfig.dataDir);

export function getBinaryStatus(): BinaryStatus {
  const ffmpegResolvedPath = resolveCommandOnSystemPath(serverConfig.ffmpegPath);
  const ffprobeResolvedPath = resolveCommandOnSystemPath(serverConfig.ffprobePath);
  const jobsDirCheck = ensureWritableDir(serverConfig.jobsDir);
  const dataDirCheck = ensureWritableDir(serverConfig.dataDir);

  return {
    ffmpegAvailable: Boolean(ffmpegResolvedPath),
    ffmpegResolvedPath,
    ffmpegError: ffmpegResolvedPath
      ? null
      : `FFmpeg was not found (checked "${serverConfig.ffmpegPath}" and system PATH). Install FFmpeg or set FFMPEG_PATH to enable HLS downloads, audio extraction, and format conversion.`,
    ffprobeAvailable: Boolean(ffprobeResolvedPath),
    ffprobeResolvedPath,
    ffprobeError: ffprobeResolvedPath
      ? null
      : `FFprobe was not found (checked "${serverConfig.ffprobePath}" and system PATH). Install FFprobe (bundled with FFmpeg) or set FFPROBE_PATH to inspect video resolution, duration, and codecs.`,
    jobsDirWritable: jobsDirCheck.writable,
    jobsDirError: jobsDirCheck.error,
    dataDirWritable: dataDirCheck.writable,
    dataDirError: dataDirCheck.error,
  };
}
