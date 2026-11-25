export type MediaFormat = 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a';

export type MediaQuality =
  | 'source'
  | '2160p'
  | '1440p'
  | '1080p'
  | '720p'
  | '480p'
  | '360p'
  | '320k'
  | '192k'
  | '128k';

export interface AvailableFormatOption {
  id: MediaFormat;
  label: string;
  detail: string;
  kind: 'video' | 'audio';
}

export interface AvailableQualityOption {
  id: MediaQuality;
  label: string;
  resolutionLabel: string | null;
  fileSizeBytes: number | null;
  isOriginal: boolean;
}

export interface MediaInspectionResult {
  sourceUrl: string;
  resolvedMediaUrl: string;
  title: string;
  domain: string;
  contentType: string;
  contentLength: number | null;
  supportsRange: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateBps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  isHls: boolean;
  recommendedFilename: string;
  extractedFromPage: boolean;
  posterUrl: string | null;
  sourceType?: 'direct_video' | 'direct_audio' | 'hls_playlist' | 'html5_video_page';
  availableFormats: AvailableFormatOption[];
  availableQualities: AvailableQualityOption[];
}

export type DownloadMode = 'direct' | 'transcode';

export interface CreateDownloadResponse {
  jobId: string;
  mode: DownloadMode;
  format: MediaFormat;
  quality: MediaQuality;
  filename: string;
  title: string;
  domain: string;
  contentType: string;
  contentLength: number | null;
  supportsRange: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
  streamUrl: string;
  eventsUrl: string | null;
  fileUrl: string | null;
}

export type JobStage =
  | 'validating'
  | 'inspecting'
  | 'processing'
  | 'transferring'
  | 'paused'
  | 'ready'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface DownloadProgressState {
  localId: string;
  jobId: string;
  title: string;
  sourceUrl: string;
  domain: string;
  format: MediaFormat;
  quality: MediaQuality;
  mode: DownloadMode;
  stage: JobStage;
  percent: number | null;
  receivedBytes: number;
  totalBytes: number | null;
  speedBytesPerSec: number | null;
  speedText: string | null;
  etaSeconds: number | null;
  canPauseResume: boolean;
  pauseHint: string | null;
  statusMessage: string;
  errorMessage: string | null;
  startedAt: number;
}

export type HistoryStatus = 'completed' | 'failed' | 'cancelled';

export interface DownloadHistoryItem {
  id: string;
  title: string;
  filename: string;
  sourceUrl: string;
  domain: string;
  format: MediaFormat;
  quality: MediaQuality;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  resolution: string | null;
  status: HistoryStatus;
  errorMessage: string | null;
  createdAt: number;
  hasCachedMedia: boolean;
  thumbnailUrl: string | null;
}

export interface PlayerMediaItem {
  id: string;
  title: string;
  filename: string;
  sourceUrl: string;
  playbackUrl: string;
  format: MediaFormat;
  quality: MediaQuality;
  isAudioOnly: boolean;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  resolution: string | null;
  thumbnailUrl: string | null;
  isObjectUrl: boolean;
}

export type DownloadManagerTab = 'downloading' | 'completed' | 'failed';

export type UrlValidationStatus = 'idle' | 'checking' | 'supported' | 'invalid';

export type UrlValidationCode =
  | 'SUPPORTED'
  | 'INVALID_SYNTAX'
  | 'UNSUPPORTED_PROTOCOL'
  | 'BLOCKED_EXECUTABLE'
  | 'BLOCKED_NETWORK'
  | 'UNSUPPORTED_MEDIA'
  | 'RESTRICTED_PLATFORM'
  | 'DRM_PROTECTED'
  | 'AUTH_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNREACHABLE';

export interface UrlValidationResponse {
  valid: boolean;
  status: 'supported' | 'invalid';
  code: UrlValidationCode;
  title: string;
  message: string;
  inspection: MediaInspectionResult | null;
}

export type ThemeMode = 'dark' | 'light';

export interface UserSettings {
  theme: ThemeMode;
  defaultFormat: MediaFormat;
  defaultQuality: MediaQuality;
}

