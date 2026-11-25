import type { RefObject } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  Film,
  Loader2,
  Music,
  Play,
  Search,
  X,
} from 'lucide-react';
import type {
  AvailableFormatOption,
  AvailableQualityOption,
  MediaFormat,
  MediaInspectionResult,
  MediaQuality,
  UrlValidationStatus,
} from '../types/vexora';
import { formatBytes, formatDuration, isAudioFormat } from '../utils/formatters';

interface DownloaderHeroProps {
  url: string;
  onUrlChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  format: MediaFormat;
  onFormatChange: (format: MediaFormat) => void;
  quality: MediaQuality;
  onQualityChange: (quality: MediaQuality) => void;
  validationStatus: UrlValidationStatus;
  validationTitle: string | null;
  validationMessage: string | null;
  isDownloading: boolean;
  inspection: MediaInspectionResult | null;
  errorMessage: string | null;
  onPasteFromClipboard: () => void;
  onInspect: () => void;
  onDownload: () => void;
  onPreviewInspected: (inspection: MediaInspectionResult) => void;
  setupNotices?: string[];
  transcodingAvailable?: boolean;
}

const BACKEND_FORMATS: AvailableFormatOption[] = [
  { id: 'mp4', label: 'MP4', detail: 'H.264 / AAC', kind: 'video' },
  { id: 'webm', label: 'WebM', detail: 'VP9 / Opus', kind: 'video' },
  { id: 'mkv', label: 'MKV', detail: 'Matroska', kind: 'video' },
  { id: 'mp3', label: 'MP3', detail: 'Audio Track', kind: 'audio' },
  { id: 'm4a', label: 'M4A', detail: 'AAC Audio', kind: 'audio' },
];

const AUDIO_QUALITIES: Array<{ id: MediaQuality; label: string; sub: string }> = [
  { id: 'source', label: 'Original', sub: 'Source audio' },
  { id: '320k', label: '320 kbps', sub: 'High bitrate' },
  { id: '192k', label: '192 kbps', sub: 'Standard' },
  { id: '128k', label: '128 kbps', sub: 'Compact' },
];

export function DownloaderHero({
  url,
  onUrlChange,
  inputRef,
  format,
  onFormatChange,
  quality,
  onQualityChange,
  validationStatus,
  validationTitle,
  validationMessage,
  isDownloading,
  inspection,
  errorMessage,
  onPasteFromClipboard,
  onInspect,
  onDownload,
  onPreviewInspected,
  setupNotices = [],
  transcodingAvailable = true,
}: DownloaderHeroProps) {
  const audioSelected = isAudioFormat(format);
  const isChecking = validationStatus === 'checking';
  const isInvalid = validationStatus === 'invalid' || Boolean(errorMessage);
  const isSupported = validationStatus === 'supported' && Boolean(inspection) && !errorMessage;

  // Show only backend-supported formats (filtered to stream capabilities when inspected)
  const visibleFormats: AvailableFormatOption[] =
    isSupported && inspection && inspection.availableFormats.length > 0
      ? inspection.availableFormats
      : transcodingAvailable
        ? BACKEND_FORMATS
        : BACKEND_FORMATS.filter((item) => item.id === 'mp4');

  // Show only actually available qualities when inspected
  const detectedVideoQualities: AvailableQualityOption[] =
    isSupported && inspection && !audioSelected ? inspection.availableQualities : [];

  const displayErrorTitle = errorMessage
    ? 'Unable to process URL'
    : validationTitle || 'Unsupported URL';
  const displayErrorMessage = errorMessage || validationMessage;

  const selectedQualityInfo = detectedVideoQualities.find((q) => q.id === quality);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDownload();
  };

  return (
    <section
      id="downloader"
      aria-labelledby="vexora-hero-heading"
      className="pt-8 pb-6 sm:pt-12 sm:pb-8"
    >
      <div className="mx-auto max-w-4xl text-center">
        <h1
          id="vexora-hero-heading"
          className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl [text-wrap:balance]"
        >
          Fast, Secure Web Video &amp; Audio Downloader
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
          Verify public video URLs before downloading, choose detected resolutions and MP4 or audio
          formats, and play media right inside your browser.
        </p>
      </div>

      {/* Primary Workspace Card */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="mx-auto mt-6 sm:mt-8 max-w-4xl rounded-2xl border border-[#D8E2F0] bg-white p-4 sm:p-6 shadow-xl shadow-slate-900/5 dark:border-[#1E2E52] dark:bg-[#0B1222] dark:shadow-black/30"
      >
        {/* Label + Live Validation State */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label htmlFor="video-url-input" className="font-medium text-slate-600 dark:text-slate-400">
            Video or Audio URL
          </label>
          {isChecking && (
            <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Checking URL...</span>
            </span>
          )}
          {isSupported && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Supported stream verified</span>
            </span>
          )}
          {isInvalid && !isChecking && (
            <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{displayErrorTitle}</span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="relative flex-1 min-w-0">
            <input
              ref={inputRef}
              id="video-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://example.com/media/clip.mp4"
              aria-invalid={isInvalid}
              aria-describedby={isInvalid ? 'url-error-message' : undefined}
              className={`h-14 w-full min-w-0 rounded-xl border bg-[#F8FAFC] dark:bg-[#070C18] pl-4 pr-24 sm:pr-28 text-sm sm:text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 ${
                isInvalid && !isChecking
                  ? 'border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/25'
                  : isSupported
                    ? 'border-emerald-500/60 focus:border-blue-500 focus:ring-blue-500/30'
                    : 'border-[#CBD5E1] dark:border-[#243761] focus:border-blue-500 focus:ring-blue-500/30'
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {url.length > 0 && (
                <button
                  type="button"
                  onClick={() => onUrlChange('')}
                  aria-label="Clear URL"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#131E38] dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={onPasteFromClipboard}
                aria-label="Paste URL from clipboard"
                className="flex h-10 items-center gap-1.5 rounded-lg border border-[#D8E2F0] bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-500/50 hover:text-slate-900 dark:border-[#22345C] dark:bg-[#101A30] dark:text-slate-300 dark:hover:text-white cursor-pointer whitespace-nowrap"
              >
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Paste</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[375px]:grid-cols-2 gap-2.5 sm:flex sm:shrink-0">
            <button
              type="button"
              disabled={isChecking || isDownloading}
              onClick={onInspect}
              className="inline-flex h-12 sm:h-14 items-center justify-center gap-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3 sm:px-4 text-xs sm:text-sm font-semibold text-slate-800 transition-colors hover:border-blue-500/50 hover:bg-slate-100 dark:border-[#243761] dark:bg-[#101A30] dark:text-slate-200 dark:hover:bg-[#15223E] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              )}
              <span>{isChecking ? 'Checking' : 'Inspect'}</span>
            </button>

            <button
              type="submit"
              disabled={isDownloading}
              className="inline-flex h-12 sm:h-14 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 sm:px-6 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isDownloading
                  ? 'Starting'
                  : audioSelected
                    ? 'Download Audio'
                    : 'Download Video'}
              </span>
            </button>
          </div>
        </div>

        {/* Loading Indicator While Checking */}
        {isChecking && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/20 dark:text-blue-200"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>
              Validating URL security, detecting supported formats, and probing available video
              qualities...
            </span>
          </div>
        )}

        {/* Clear Error Message for Invalid / Unsupported Links */}
        {!isChecking && isInvalid && displayErrorMessage && (
          <div
            id="url-error-message"
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-left text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold text-rose-800 dark:text-rose-300">{displayErrorTitle}</p>
              <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-200/90 break-words">
                {displayErrorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Clear Setup Notice ONLY when FFmpeg, FFprobe, or writable temp storage is unavailable */}
        {setupNotices.length > 0 && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-left text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              Server Media Tooling Setup Required
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed">
              {setupNotices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Verified Supported Stream Summary */}
        {!isChecking && isSupported && inspection && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-500/35 dark:bg-[#081322] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{validationMessage || 'Verified playable media stream'}</span>
              </div>
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {inspection.title}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
                <span>{inspection.domain}</span>
                {inspection.width && inspection.height && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {inspection.width}x{inspection.height}
                    </span>
                  </>
                )}
                {inspection.durationSeconds !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(inspection.durationSeconds)}</span>
                  </>
                )}
                {inspection.contentLength !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(inspection.contentLength)}</span>
                  </>
                )}
                {inspection.videoCodec && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{inspection.videoCodec.toUpperCase()}</span>
                  </>
                )}
                {inspection.isHls && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>HLS Stream</span>
                  </>
                )}
              </div>
            </div>

            {!inspection.isHls && (
              <button
                type="button"
                onClick={() => onPreviewInspected(inspection)}
                className="inline-flex min-h-[44px] sm:min-h-[40px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-500/40 dark:bg-blue-600/10 dark:text-blue-300 dark:hover:bg-blue-600/20 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Preview in Player</span>
              </button>
            )}
          </div>
        )}

        {/* Format & Quality Selection Interface */}
        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-[#E2E8F0] pt-5 dark:border-[#182542] lg:grid-cols-12">
          {/* Format Selection */}
          <div className="lg:col-span-5 min-w-0">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium">Output Format</span>
              <span>{audioSelected ? 'Audio Extraction' : 'Video Container'}</span>
            </div>
            <div
              role="group"
              aria-label="Output format selection"
              className="grid grid-cols-2 sm:grid-cols-3 gap-2"
            >
              {visibleFormats.map((item) => {
                const active = format === item.id;
                const isAud = item.kind === 'audio';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFormatChange(item.id)}
                    className={`flex min-h-[50px] min-w-0 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-600/15 dark:text-white'
                        : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 hover:text-slate-900 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:border-[#2B406E] dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                      {isAud ? (
                        <Music
                          className={`h-3.5 w-3.5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <Film
                          className={`h-3.5 w-3.5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
                          aria-hidden="true"
                        />
                      )}
                      {item.label}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                      {item.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quality Selection */}
          <div className="lg:col-span-7 min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium">
                {audioSelected ? 'Audio Bitrate' : 'Video Quality'}
              </span>
              <span className="font-mono-tabular truncate">
                {audioSelected
                  ? quality === 'source' && inspection?.contentLength
                    ? `Original · ${formatBytes(inspection.contentLength)}`
                    : quality === 'source'
                      ? 'Original bitrate'
                      : `${quality}bps`
                  : selectedQualityInfo?.fileSizeBytes
                    ? `Actual size · ${formatBytes(selectedQualityInfo.fileSizeBytes)}`
                    : isSupported
                      ? quality === 'source'
                        ? 'Original stream'
                        : 'Server transcode'
                      : 'Detected after URL check'}
              </span>
            </div>

            {audioSelected ? (
              <div
                role="group"
                aria-label="Audio bitrate selection"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {AUDIO_QUALITIES.map((item) => {
                  const active = quality === item.id;
                  const showOriginalSize =
                    item.id === 'source' &&
                    isSupported &&
                    inspection &&
                    !inspection.hasVideo &&
                    inspection.contentLength !== null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onQualityChange(item.id)}
                      className={`flex min-h-[50px] min-w-0 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-600/15 dark:text-white'
                          : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 hover:text-slate-900 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:border-[#2B406E] dark:hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold whitespace-nowrap">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular truncate max-w-full">
                        {showOriginalSize
                          ? formatBytes(inspection.contentLength)
                          : item.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : detectedVideoQualities.length > 0 ? (
              <div
                role="group"
                aria-label="Available video qualities"
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
              >
                {detectedVideoQualities.map((item) => {
                  const active = quality === item.id;
                  const metaText = item.isOriginal
                    ? item.fileSizeBytes !== null
                      ? formatBytes(item.fileSizeBytes)
                      : item.resolutionLabel || 'Original'
                    : 'Transcode';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onQualityChange(item.id)}
                      className={`flex min-h-[50px] min-w-0 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-600/15 dark:text-white'
                          : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 hover:text-slate-900 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:border-[#2B406E] dark:hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold whitespace-nowrap">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular truncate max-w-full">
                        {metaText}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-[#D8E2F0] bg-[#F8FAFC] p-3 text-xs text-slate-600 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-400">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                  <span className="inline-flex h-7 items-center rounded-lg border border-blue-300 bg-blue-50 px-2.5 text-xs font-semibold text-blue-900 dark:border-blue-500/40 dark:bg-blue-600/15 dark:text-white whitespace-nowrap shrink-0">
                    Source (Original)
                  </span>
                  <span className="leading-relaxed">
                    {isChecking
                      ? 'Detecting available video resolutions and actual file size...'
                      : 'Enter and verify a video URL to list available qualities (360p, 480p, 720p, 1080p, or higher) and actual file size.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
