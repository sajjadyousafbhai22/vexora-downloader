import { AlertCircle, CheckCircle2, Download, Loader2, PauseCircle, Play, X } from 'lucide-react';
import type { DownloadProgressState } from '../types/vexora';
import { formatBytes, formatSpeed } from '../utils/formatters';

interface DownloadStatusPopupProps {
  isOpen: boolean;
  onClose: () => void;
  activeDownloads: DownloadProgressState[];
  lastCompleted: { id: string; title: string } | null;
  lastError: string | null;
  onPlayLastCompleted: (id: string) => void;
  onOpenManagerTab: () => void;
}

export function DownloadStatusPopup({
  isOpen,
  onClose,
  activeDownloads,
  lastCompleted,
  lastError,
  onPlayLastCompleted,
  onOpenManagerTab,
}: DownloadStatusPopupProps) {
  if (!isOpen) return null;

  const primary = activeDownloads[0] ?? null;
  const isPaused = primary?.stage === 'paused';
  const activeCount = activeDownloads.filter((d) => d.stage !== 'paused').length;

  return (
    <aside
      aria-label="Download status popup"
      aria-live="polite"
      className="fixed bottom-[68px] md:bottom-5 right-3 left-3 sm:left-auto sm:right-5 sm:w-[350px] z-30 rounded-2xl border border-[#D8E2F0] bg-white/95 dark:border-[#233761] dark:bg-[#0B1325]/95 backdrop-blur-md p-3.5 shadow-2xl shadow-slate-900/10 dark:shadow-black/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F4F7FB] dark:border-[#233761] dark:bg-[#101C36]">
            {primary ? (
              isPaused ? (
                <PauseCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" aria-hidden="true" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
              )
            ) : lastCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : lastError ? (
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              {primary
                ? activeDownloads.length > 1
                  ? `${activeCount} Active · ${activeDownloads.length} in Queue`
                  : primary.statusMessage
                : lastCompleted
                  ? 'Download Complete'
                  : lastError
                    ? 'Download Failed'
                    : 'Download Status · Ready'}
            </p>

            {primary ? (
              <>
                <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-300 font-mono-tabular">
                  {primary.title}
                  {primary.percent !== null ? ` · ${primary.percent}%` : ''}
                  {primary.receivedBytes > 0 ? ` · ${formatBytes(primary.receivedBytes)}` : ''}
                  {!isPaused && primary.speedBytesPerSec
                    ? ` · ${formatSpeed(primary.speedBytesPerSec)}`
                    : ''}
                </p>
                <button
                  type="button"
                  onClick={onOpenManagerTab}
                  className="mt-2 inline-flex min-h-[32px] items-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-[#243761] dark:bg-[#101A30] dark:text-blue-300 dark:hover:text-white cursor-pointer"
                >
                  Open Download Manager
                </button>
              </>
            ) : lastCompleted ? (
              <>
                <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-300">
                  {lastCompleted.title}
                </p>
                <button
                  type="button"
                  onClick={() => onPlayLastCompleted(lastCompleted.id)}
                  className="mt-2 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-500 cursor-pointer"
                >
                  <Play className="h-3 w-3" aria-hidden="true" />
                  <span>Play in App</span>
                </button>
              </>
            ) : lastError ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                {lastError}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                No active downloads. Paste a supported video URL and press Download Video.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close download status popup"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#14203B] dark:hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
