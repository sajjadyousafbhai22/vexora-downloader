export type DetectedSourceKind =
  | 'direct_video'
  | 'direct_audio'
  | 'hls_playlist'
  | 'html5_video_page';

export interface RestrictedPlatformInfo {
  label: string;
  reason: string;
}

const RESTRICTED_PLATFORMS: Array<{ match: RegExp; label: string; reason: string }> = [
  {
    match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
    label: 'YouTube',
    reason: 'YouTube restricts automated server downloads and uses protected adaptive streams.',
  },
  {
    match: /(^|\.)netflix\.com$/i,
    label: 'Netflix',
    reason: 'Netflix streams are DRM-protected and require authenticated playback.',
  },
  {
    match: /(^|\.)spotify\.com$/i,
    label: 'Spotify',
    reason: 'Spotify audio streams are DRM-protected and require an authorized account.',
  },
  {
    match: /(^|\.)disneyplus\.com$|(^|\.)hulu\.com$|(^|\.)max\.com$|(^|\.)primevideo\.com$/i,
    label: 'Streaming Platform',
    reason: 'Subscription streaming platforms enforce DRM and account-gated playback controls.',
  },
  {
    match: /(^|\.)tiktok\.com$/i,
    label: 'TikTok',
    reason: 'TikTok blocks unauthenticated automated media fetching.',
  },
  {
    match: /(^|\.)instagram\.com$/i,
    label: 'Instagram',
    reason: 'Instagram enforces login gates and blocks automated server downloads.',
  },
  {
    match: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/i,
    label: 'Facebook',
    reason: 'Facebook restricts automated media extraction and uses session-gated URLs.',
  },
  {
    match: /(^|\.)twitter\.com$|(^|\.)x\.com$/i,
    label: 'X / Twitter',
    reason: 'X / Twitter blocks automated server extraction and requires session tokens.',
  },
  {
    match: /(^|\.)twitch\.tv$/i,
    label: 'Twitch',
    reason: 'Twitch enforces stream access controls and tokenized manifests.',
  },
];

export function findRestrictedPlatform(hostname: string): RestrictedPlatformInfo | null {
  const lower = hostname.toLowerCase();
  const match = RESTRICTED_PLATFORMS.find((entry) => entry.match.test(lower));
  return match ? { label: match.label, reason: match.reason } : null;
}

export function detectHlsDrm(playlistText: string): string | null {
  const lines = playlistText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('#EXT-X-KEY') && !line.startsWith('#EXT-X-SESSION-KEY')) {
      continue;
    }
    const upper = line.toUpperCase();
    if (
      upper.includes('METHOD=SAMPLE-AES') ||
      upper.includes('METHOD=SAMPLE-AES-CTR') ||
      upper.includes('METHOD=SAMPLE-AES-CENC') ||
      upper.includes('COM.WIDEVINE') ||
      upper.includes('COM.APPLE.FPS') ||
      upper.includes('COM.MICROSOFT.PLAYREADY') ||
      upper.includes('EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED')
    ) {
      return 'This HLS playlist uses DRM encryption (FairPlay, Widevine, or PlayReady). VEXORA does not bypass DRM.';
    }
  }
  return null;
}

export function detectHtmlDrmOrPaywall(html: string): string | null {
  const lower = html.toLowerCase();
  if (
    lower.includes('requestmediakeysystemaccess') ||
    lower.includes('com.widevine.alpha') ||
    lower.includes('com.microsoft.playready') ||
    lower.includes('com.apple.fps.')
  ) {
    return 'This webpage uses browser Encrypted Media Extensions (DRM) protection. VEXORA only downloads unencrypted, publicly permitted media.';
  }
  return null;
}

export function classifySourceKind(
  contentType: string,
  isHls: boolean,
  hasVideo: boolean,
  extractedFromPage: boolean
): DetectedSourceKind {
  if (isHls) return 'hls_playlist';
  if (extractedFromPage) return 'html5_video_page';
  if (!hasVideo || contentType.toLowerCase().startsWith('audio/')) {
    return 'direct_audio';
  }
  return 'direct_video';
}

export const SUPPORTED_SOURCE_SUMMARY = [
  {
    id: 'direct_video',
    label: 'Direct Public Video URLs',
    extensions: ['.mp4', '.webm', '.mov', '.m4v', '.mkv'],
    description: 'Direct HTTP/HTTPS links returning public video streams without login gates or DRM.',
  },
  {
    id: 'direct_audio',
    label: 'Direct Public Audio URLs',
    extensions: ['.mp3', '.m4a', '.ogg', '.wav', '.aac'],
    description: 'Direct HTTP/HTTPS links returning public audio streams.',
  },
  {
    id: 'hls_playlist',
    label: 'Unencrypted HLS Playlists',
    extensions: ['.m3u8'],
    description: 'Open HTTP Live Streaming manifests without FairPlay, Widevine, or PlayReady DRM.',
  },
  {
    id: 'html5_video_page',
    label: 'Open HTML5 & OpenGraph Pages',
    extensions: ['<video>', 'og:video'],
    description: 'Public webpages containing unencrypted HTML5 video/source tags or OpenGraph stream metadata.',
  },
];
