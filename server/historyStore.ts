import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { DownloadHistoryItem, MediaFormat, MediaQuality } from '../src/types/vexora.ts';
import { serverConfig } from './config.ts';
import { isValidUuid } from './security.ts';

interface StoredHistoryRecord {
  id: string;
  sessionId: string;
  title: string;
  filename: string;
  sourceUrl: string;
  domain: string;
  format: MediaFormat;
  quality: MediaQuality;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  resolution: string | null;
  status: 'completed' | 'failed' | 'cancelled';
  errorMessage: string | null;
  thumbnailUrl: string | null;
  createdAt: number;
}

const MAX_RECORDS_PER_SESSION = 50;
const MAX_TOTAL_RECORDS = 1000;
const SESSION_COOKIE_NAME = 'vexora_sid';

function getHistoryFilePath(): string {
  const baseDir = path.resolve(serverConfig.dataDir);
  const resolved = path.resolve(baseDir, 'history.json');
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid server history storage path.');
  }
  return resolved;
}

function signSessionId(sessionId: string): string {
  return crypto
    .createHmac('sha256', serverConfig.sessionSecret)
    .update(sessionId)
    .digest('base64url');
}

function verifySignedSessionCookie(rawValue: string): string | null {
  const dotIdx = rawValue.indexOf('.');
  if (dotIdx <= 0) return null;
  const sessionId = rawValue.slice(0, dotIdx);
  const providedSig = rawValue.slice(dotIdx + 1);
  if (!isValidUuid(sessionId) || !providedSig) return null;

  const expectedSig = signSessionId(sessionId);
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? sessionId : null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function getOrCreateSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie);
  const rawCookie = cookies[SESSION_COOKIE_NAME];
  if (rawCookie) {
    const verified = verifySignedSessionCookie(rawCookie);
    if (verified) return verified;
  }

  const newSessionId = crypto.randomUUID();
  const signedToken = `${newSessionId}.${signSessionId(newSessionId)}`;
  const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';

  const cookieAttributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedToken)}`,
    'Path=/',
    'Max-Age=2592000',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure', 'Partitioned'] : []),
  ];
  res.append('Set-Cookie', cookieAttributes.join('; '));
  return newSessionId;
}

export function readExistingSessionId(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const rawCookie = cookies[SESSION_COOKIE_NAME];
  if (!rawCookie) return null;
  return verifySignedSessionCookie(rawCookie);
}

function readAllRecords(): StoredHistoryRecord[] {
  const filePath = getHistoryFilePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as StoredHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAllRecords(records: StoredHistoryRecord[]): void {
  const filePath = getHistoryFilePath();
  if (!fs.existsSync(serverConfig.dataDir)) {
    fs.mkdirSync(serverConfig.dataDir, { recursive: true });
  }
  const trimmed = records
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_TOTAL_RECORDS);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(trimmed, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function recordServerHistory(record: StoredHistoryRecord): void {
  try {
    const all = readAllRecords();
    const filtered = all.filter((item) => !(item.sessionId === record.sessionId && item.id === record.id));
    const next = [record, ...filtered];

    // Enforce per-session cap while keeping other sessions intact
    const sessionRecords = next.filter((r) => r.sessionId === record.sessionId);
    if (sessionRecords.length > MAX_RECORDS_PER_SESSION) {
      const keepIds = new Set(
        sessionRecords.slice(0, MAX_RECORDS_PER_SESSION).map((r) => r.id)
      );
      writeAllRecords(
        next.filter((r) => r.sessionId !== record.sessionId || keepIds.has(r.id))
      );
      return;
    }

    writeAllRecords(next);
  } catch {
    // Do not break active downloads if history file write fails
  }
}

export function listSessionHistory(sessionId: string): DownloadHistoryItem[] {
  const all = readAllRecords();
  return all
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((item) => ({
      id: item.id,
      title: item.title,
      filename: item.filename,
      sourceUrl: item.sourceUrl,
      domain: item.domain,
      format: item.format,
      quality: item.quality,
      fileSizeBytes: item.fileSizeBytes,
      durationSeconds: item.durationSeconds,
      resolution: item.resolution,
      status: item.status,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
      hasCachedMedia: false,
      thumbnailUrl: item.thumbnailUrl,
    }));
}

export function deleteSessionHistoryItem(sessionId: string, id: string): boolean {
  const all = readAllRecords();
  const next = all.filter((item) => !(item.sessionId === sessionId && item.id === id));
  if (next.length === all.length) return false;
  writeAllRecords(next);
  return true;
}

export function clearSessionHistory(
  sessionId: string,
  statusFilter?: 'completed' | 'failed'
): number {
  const all = readAllRecords();
  const next = all.filter((item) => {
    if (item.sessionId !== sessionId) return true;
    if (!statusFilter) return false;
    if (statusFilter === 'completed') return item.status !== 'completed';
    return item.status === 'completed';
  });
  const removed = all.length - next.length;
  if (removed > 0) {
    writeAllRecords(next);
  }
  return removed;
}
