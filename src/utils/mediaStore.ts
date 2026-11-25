import type {
  DownloadHistoryItem,
  MediaFormat,
  MediaQuality,
  ThemeMode,
  UserSettings,
} from '../types/vexora';

const HISTORY_STORAGE_KEY = 'vexora_download_history_v1';
const SETTINGS_STORAGE_KEY = 'vexora_settings_v1';
const DB_NAME = 'vexora_media_cache';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;
const MAX_CACHED_BLOB_BYTES = 150 * 1024 * 1024; // 150 MB per cached item

const VALID_FORMATS = new Set<MediaFormat>(['mp4', 'webm', 'mkv', 'mp3', 'm4a']);
const VALID_QUALITIES = new Set<MediaQuality>([
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

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  defaultFormat: 'mp4',
  defaultQuality: 'source',
};

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;

    const theme: ThemeMode = parsed.theme === 'light' ? 'light' : 'dark';
    const defaultFormat: MediaFormat =
      parsed.defaultFormat && VALID_FORMATS.has(parsed.defaultFormat)
        ? parsed.defaultFormat
        : 'mp4';
    const defaultQuality: MediaQuality =
      parsed.defaultQuality && VALID_QUALITIES.has(parsed.defaultQuality)
        ? parsed.defaultQuality
        : 'source';

    return { theme, defaultFormat, defaultQuality };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Unable to persist settings in browser storage. Changes apply for this session only.',
    };
  }
}

export function loadHistory(): DownloadHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      thumbnailUrl: typeof item?.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
    }));
  } catch {
    return [];
  }
}

export function saveHistory(items: DownloadHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Ignore storage quota errors
  }
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheMediaBlob(id: string, blob: Blob): Promise<boolean> {
  if (blob.size > MAX_CACHED_BLOB_BYTES) {
    return false;
  }
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getCachedMediaBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteCachedMediaBlob(id: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore errors
  }
}

export async function clearAllCachedMedia(): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore errors
  }
}
