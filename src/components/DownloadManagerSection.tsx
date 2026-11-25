import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Film,
  Loader2,
  Music,
  Pause,
  PauseCircle,
  Play,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  DownloadHistoryItem,
  DownloadManagerTab,
  DownloadProgressState,
} from '../types/vexora';
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatRelativeTime,
  formatSpeed,
  isAudioFormat,
  isSafeImageUrl,
} from '../utils/formatters';

interface DownloadManagerSectionProps {
  activeTab: DownloadManagerTab;
  onTabChange: (tab: DownloadManagerTab) => void;
  activeDownloads: DownloadProgressState[];
  completedItems: DownloadHistoryItem[];
  failedItems: DownloadHistoryItem[];
  activePlayerId: string | null;
  isPlayerPlaying: boolean;
  onPauseDownload: (localId: string) => void;
  onResumeDownload: (localId: string) => void;
  onCancelDownload: (localId: string) => void;
  onPlayCompleted: (item: DownloadHistoryItem) => void;
  onRedownloadCompleted: (item: DownloadHistoryItem) => void;
  onRetryFailed: (item: DownloadHistoryItem) => void;
  onDeleteHistoryItem: (id: string) => void;
  onClearCompleted: () => void;
  onClearFailed: () => void;
  onFocusInput: () => void;
}

type CompletedFilter = 'all' | 'video' | 'audio';

export function DownloadManagerSection({
  activeTab,
  onTabChange,
  activeDownloads,
  completedItems,
  failedItems,
  activePlayerId,
  isPlayerPlaying,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  onPlayCompleted,
  onRedownloadCompleted,
  onRetryFailed,
  onDeleteHistoryItem,
  onClearCompleted,
  onClearFailed,
  onFocusInput,
}: DownloadManagerSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [completedFilter, setCompletedFilter] = useState<CompletedFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const filteredCompleted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return completedItems.filter((item) => {
      if (completedFilter === 'video' && isAudioFormat(item.format)) return false;
      if (completedFilter === 'audio' && !isAudioFormat(item.format)) return false;
      if (q) {
        return (
          item.title.toLowerCase().includes(q) ||
          item.domain.toLowerCase().includes(q) ||
          item.format.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [completedItems, completedFilter, searchQuery]);

  const handleCopyUrl = async (id: string, sourceUrl: string) => {
    try {
      await navigator.clipboard.writeText(sourceUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <section
      id="history"
      aria-labelledby="download-manager-heading"
      className="py-6 sm:py-8"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="download-manager-heading"
            className="font-display text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl"
          >
            Download Manager
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Track active transfers, pause and resume supported streams, replay downloaded media, or retry failed URLs.
          </p>
        </div>

        {activeTab === 'completed' && completedItems.length > 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="inline-flex min-h-[40px] items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#D8E2F0] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-[#22345C] dark:bg-[#0D1528] dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-300 cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear Downloaded</span>
          </button>
        )}

        {activeTab === 'failed' && failedItems.length > 0 && (
          <button
            type="button"
            onClick={onClearFailed}
            className="inline-flex min-h-[40px] items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#D8E2F0] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-[#22345C] dark:bg-[#0D1528] dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-300 cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear Failed</span>
          </button>
        )}
      </div>

      {/* Primary Download Manager Tabs (responsive without horizontal scroll) */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Download manager sections"
          className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[#D8E2F0] bg-white p-1 sm:inline-flex sm:w-auto dark:border-[#1A2744] dark:bg-[#091020]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'downloading'}
            onClick={() => onTabChange('downloading')}
            className={`min-h-[42px] sm:min-h-[40px] rounded-lg px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer font-mono-tabular ${
              activeTab === 'downloading'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Downloading{activeDownloads.length > 0 ? ` (${activeDownloads.length})` : ''}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'completed'}
            onClick={() => onTabChange('completed')}
            className={`min-h-[42px] sm:min-h-[40px] rounded-lg px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer font-mono-tabular ${
              activeTab === 'completed'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Downloaded{completedItems.length > 0 ? ` (${completedItems.length})` : ''}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'failed'}
            onClick={() => onTabChange('failed')}
            className={`min-h-[42px] sm:min-h-[40px] rounded-lg px-2 sm:px-3.5 py-2 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer font-mono-tabular ${
              activeTab === 'failed'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span className="sm:hidden">
              Failed{failedItems.length > 0 ? ` (${failedItems.length})` : ''}
            </span>
            <span className="hidden sm:inline">
              Failed Downloads{failedItems.length > 0 ? ` (${failedItems.length})` : ''}
            </span>
          </button>
        </div>

        {activeTab === 'completed' && completedItems.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div
              role="group"
              aria-label="Filter downloaded media by type"
              className="inline-flex rounded-xl border border-[#D8E2F0] bg-white p-1 self-start dark:border-[#1A2744] dark:bg-[#091020]"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'video', label: 'Video' },
                  { id: 'audio', label: 'Audio' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setCompletedFilter(sub.id)}
                  className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    completedFilter === sub.id
                      ? 'bg-blue-600 text-white dark:bg-[#162544]'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search downloaded..."
                aria-label="Search downloaded videos"
                className="h-10 w-full rounded-xl border border-[#D8E2F0] bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-[#1E2E52] dark:bg-[#080E1B] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: DOWNLOADING */}
      {activeTab === 'downloading' && (
        <div role="tabpanel" aria-label="Downloading">
          {activeDownloads.length === 0 ? (
            <div className="rounded-2xl border border-[#D8E2F0] bg-white p-6 sm:p-8 text-center dark:border-[#1A2744] dark:bg-[#0B1222]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No active downloads
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Real download progress, transfer speed, remaining time, and Pause/Resume controls
                appear here once you submit a supported URL.
              </p>
              <button
                type="button"
                onClick={onFocusInput}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Paste Video URL</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-2xl border border-[#D8E2F0] bg-white dark:divide-[#17233D] dark:border-[#1E2E52] dark:bg-[#0B1222]">
              {activeDownloads.map((item) => {
                const isPaused = item.stage === 'paused';
                const isProcessing = item.stage === 'processing' || item.stage === 'inspecting';
                const percentVal =
                  item.percent !== null ? Math.min(100, Math.max(0, item.percent)) : null;

                return (
                  <div key={item.localId} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          {isPaused ? (
                            <PauseCircle
                              className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <Loader2
                              className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={`text-xs font-semibold ${
                              isPaused
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {item.statusMessage}
                          </span>
                        </div>

                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
                          <span>{item.format.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.quality === 'source' ? 'Original' : item.quality}</span>
                          {item.domain && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.domain}</span>
                            </>
                          )}
                          {item.receivedBytes > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {formatBytes(item.receivedBytes)}
                                {item.totalBytes
                                  ? ` / ${formatBytes(item.totalBytes)}`
                                  : ' downloaded'}
                              </span>
                            </>
                          )}
                          {!isPaused && item.speedBytesPerSec !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatSpeed(item.speedBytesPerSec)}</span>
                            </>
                          )}
                          {!isPaused && item.speedBytesPerSec === null && item.speedText && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.speedText}</span>
                            </>
                          )}
                          {!isPaused && item.etaSeconds !== null && item.etaSeconds > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatEta(item.etaSeconds)} left</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Percentage + Pause/Resume + Cancel Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end sm:self-center shrink-0">
                        <span className="mr-1 font-mono-tabular text-base font-semibold text-slate-900 dark:text-white">
                          {percentVal !== null ? `${percentVal}%` : 'Streaming'}
                        </span>

                        <div className="flex items-center gap-2">
                          {isPaused ? (
                            <button
                              type="button"
                              onClick={() => onResumeDownload(item.localId)}
                              className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                            >
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Resume</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!item.canPauseResume || isProcessing}
                              title={
                                item.pauseHint ||
                                (isProcessing
                                  ? 'Pause is available once file transfer starts'
                                  : 'Pause download')
                              }
                              onClick={() => onPauseDownload(item.localId)}
                              className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-500/50 hover:text-slate-900 dark:border-[#243761] dark:bg-[#101A30] dark:text-slate-200 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                            >
                              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Pause</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onCancelDownload(item.localId)}
                            className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40 cursor-pointer whitespace-nowrap"
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div
                      role="progressbar"
                      aria-valuenow={percentVal ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#131E38]"
                    >
                      <div
                        className={`h-full rounded-full transition-transform duration-150 ease-out origin-left ${
                          isPaused ? 'bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'
                        } ${percentVal === null && !isPaused ? 'animate-pulse' : ''}`}
                        style={{
                          transform: `scaleX(${
                            percentVal !== null ? percentVal / 100 : 0.35
                          })`,
                        }}
                      />
                    </div>

                    {!item.canPauseResume && !isPaused && item.pauseHint && (
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.pauseHint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DOWNLOADED */}
      {activeTab === 'completed' && (
        <div role="tabpanel" aria-label="Downloaded">
          {completedItems.length === 0 ? (
            <div className="rounded-2xl border border-[#D8E2F0] bg-white p-6 sm:p-8 text-center dark:border-[#1A2744] dark:bg-[#0B1222]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No downloaded videos yet
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Successfully downloaded videos and audio files appear here persistently with
                thumbnails, quality, file size, and instant in-app playback.
              </p>
              <button
                type="button"
                onClick={onFocusInput}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Start a Download</span>
              </button>
            </div>
          ) : filteredCompleted.length === 0 ? (
            <div className="rounded-2xl border border-[#D8E2F0] bg-white p-6 text-center text-xs text-slate-600 dark:border-[#1A2744] dark:bg-[#0B1222] dark:text-slate-400">
              No downloaded items match your filter.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-2xl border border-[#D8E2F0] bg-white dark:divide-[#17233D] dark:border-[#1E2E52] dark:bg-[#0B1222]">
              {filteredCompleted.map((item) => {
                const isAudio = isAudioFormat(item.format);
                const showThumb =
                  !isAudio &&
                  Boolean(item.thumbnailUrl) &&
                  isSafeImageUrl(item.thumbnailUrl) &&
                  !brokenThumbs[item.id];
                const isThisActive = activePlayerId === item.id;
                const isThisPlaying = isThisActive && isPlayerPlaying;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-[#0E172B] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onPlayCompleted(item)}
                        aria-label={isThisPlaying ? `Pause ${item.title}` : `Play ${item.title}`}
                        className="relative aspect-video w-24 sm:w-32 shrink-0 overflow-hidden rounded-xl border border-[#CBD5E1] bg-slate-100 dark:border-[#1F3157] dark:bg-[#080F1E] cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {showThumb ? (
                          <img
                            src={item.thumbnailUrl!}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenThumbs((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 text-blue-600 dark:from-[#0A1328] dark:to-[#0E1D3D] dark:text-blue-400">
                            {isAudio ? (
                              <Music className="h-5 w-5" aria-hidden="true" />
                            ) : (
                              <Film className="h-5 w-5" aria-hidden="true" />
                            )}
                          </div>
                        )}

                        <div
                          className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                            isThisPlaying
                              ? 'bg-black/35 opacity-100'
                              : 'bg-black/35 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/95 text-white">
                            {isThisPlaying ? (
                              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <Play className="h-3.5 w-3.5 translate-x-0.5" aria-hidden="true" />
                            )}
                          </span>
                        </div>

                        {item.durationSeconds !== null && (
                          <span className="absolute bottom-1 right-1 rounded bg-[#060A14]/85 px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium text-slate-100">
                            {formatDuration(item.durationSeconds)}
                          </span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{isThisPlaying ? 'Playing' : 'Downloaded'}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.format.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.quality === 'source'
                              ? item.resolution || 'Original'
                              : item.quality}
                          </span>
                          {item.fileSizeBytes !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatBytes(item.fileSizeBytes)}</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[140px]">{item.domain}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeTime(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 self-stretch sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => onPlayCompleted(item)}
                        className={`inline-flex min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          isThisPlaying
                            ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-500'
                            : 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-600 hover:text-white dark:bg-blue-600/15 dark:border-blue-500/35 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white'
                        }`}
                      >
                        {isThisPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Play</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRedownloadCompleted(item)}
                        aria-label={`Save ${item.title}`}
                        title="Save file again"
                        className="flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 transition-colors hover:border-blue-400 hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0D162A] dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-white cursor-pointer"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyUrl(item.id, item.sourceUrl)}
                        aria-label="Copy source URL"
                        title="Copy source URL"
                        className="flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 transition-colors hover:border-blue-400 hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0D162A] dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-white cursor-pointer"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteHistoryItem(item.id)}
                        aria-label={`Delete ${item.title}`}
                        title="Delete from history"
                        className="flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-500 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-[#1E2E52] dark:bg-[#0D162A] dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FAILED DOWNLOADS */}
      {activeTab === 'failed' && (
        <div role="tabpanel" aria-label="Failed Downloads">
          {failedItems.length === 0 ? (
            <div className="rounded-2xl border border-[#D8E2F0] bg-white p-6 sm:p-8 text-center dark:border-[#1A2744] dark:bg-[#0B1222]">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                No failed downloads
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Any unsupported, interrupted, or cancelled downloads will appear here with a
                one-click Retry button.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] overflow-hidden rounded-2xl border border-[#D8E2F0] bg-white dark:divide-[#17233D] dark:border-[#1E2E52] dark:bg-[#0B1222]">
              {failedItems.map((item) => {
                const isCancelled = item.status === 'cancelled';
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-[#0E172B] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-400">
                        {isCancelled ? (
                          <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
                          <span
                            className={
                              isCancelled
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {isCancelled ? 'Cancelled' : 'Failed'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.format.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.quality === 'source' ? 'Original' : item.quality}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[140px]">{item.domain}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeTime(item.createdAt)}</span>
                        </div>
                        {item.errorMessage && (
                          <p className="text-xs text-rose-700 dark:text-rose-300/90 break-words">
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 self-stretch sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => onRetryFailed(item)}
                        className="inline-flex min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Retry</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyUrl(item.id, item.sourceUrl)}
                        aria-label="Copy source URL"
                        title="Copy source URL"
                        className="flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 transition-colors hover:border-blue-400 hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0D162A] dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-white cursor-pointer"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteHistoryItem(item.id)}
                        aria-label={`Delete ${item.title}`}
                        title="Delete from history"
                        className="flex min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-500 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-[#1E2E52] dark:bg-[#0D162A] dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
