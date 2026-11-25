const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const VALID_API_BASE =
  rawBase.startsWith('http://') || rawBase.startsWith('https://') ? rawBase : '';

/**
 * Resolves a backend endpoint path against optional VITE_API_BASE_URL (for split
 * frontend/backend deployments) or defaults cleanly to same-origin relative URLs.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return VALID_API_BASE ? `${VALID_API_BASE}${normalized}` : normalized;
}

export const HAS_CUSTOM_API_BASE = VALID_API_BASE.length > 0;
