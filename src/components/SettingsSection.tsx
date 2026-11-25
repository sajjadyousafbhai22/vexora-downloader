import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Loader2,
  Moon,
  Music,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react';
import type { MediaFormat, MediaQuality, ThemeMode, UserSettings } from '../types/vexora';
import { isAudioFormat } from '../utils/formatters';

interface SettingsSectionProps {
  settings: UserSettings;
  onUpdateSettings: (next: UserSettings) => void;
  storageError: string | null;
  completedCount: number;
  failedCount: number;
  activeCount: number;
  onClearAllHistory: () => Promise<void>;
}

const FORMAT_OPTIONS: Array<{ id: MediaFormat; label: string; detail: string; kind: 'video' | 'audio' }> = [
  { id: 'mp4', label: 'MP4', detail: 'H.264 / AAC', kind: 'video' },
  { id: 'webm', label: 'WebM', detail: 'VP9 / Opus', kind: 'video' },
  { id: 'mkv', label: 'MKV', detail: 'Matroska', kind: 'video' },
  { id: 'mp3', label: 'MP3', detail: 'Audio Track', kind: 'audio' },
  { id: 'm4a', label: 'M4A', detail: 'AAC Audio', kind: 'audio' },
];

const VIDEO_QUALITY_OPTIONS: Array<{ id: MediaQuality; label: string }> = [
  { id: 'source', label: 'Source (Original)' },
  { id: '2160p', label: '2160p 4K' },
  { id: '1440p', label: '1440p QHD' },
  { id: '1080p', label: '1080p HD' },
  { id: '720p', label: '720p HD' },
  { id: '480p', label: '480p SD' },
  { id: '360p', label: '360p' },
];

const AUDIO_QUALITY_OPTIONS: Array<{ id: MediaQuality; label: string }> = [
  { id: 'source', label: 'Original' },
  { id: '320k', label: '320 kbps' },
  { id: '192k', label: '192 kbps' },
  { id: '128k', label: '128 kbps' },
];

export function SettingsSection({
  settings,
  onUpdateSettings,
  storageError,
  completedCount,
  failedCount,
  activeCount,
  onClearAllHistory,
}: SettingsSectionProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  const totalHistoryCount = completedCount + failedCount;
  const isAudioDefault = isAudioFormat(settings.defaultFormat);
  const qualityChoices = isAudioDefault ? AUDIO_QUALITY_OPTIONS : VIDEO_QUALITY_OPTIONS;

  const handleThemeChange = (theme: ThemeMode) => {
    setClearFeedback(null);
    onUpdateSettings({ ...settings, theme });
  };

  const handleDefaultFormatChange = (nextFormat: MediaFormat) => {
    setClearFeedback(null);
    const nextIsAudio = isAudioFormat(nextFormat);
    const curIsAudioQ =
      settings.defaultQuality === '320k' ||
      settings.defaultQuality === '192k' ||
      settings.defaultQuality === '128k';

    let nextQuality = settings.defaultQuality;
    if (nextIsAudio && !curIsAudioQ && nextQuality !== 'source') {
      nextQuality = '192k';
    } else if (!nextIsAudio && curIsAudioQ) {
      nextQuality = 'source';
    }

    onUpdateSettings({
      ...settings,
      defaultFormat: nextFormat,
      defaultQuality: nextQuality,
    });
  };

  const handleDefaultQualityChange = (nextQuality: MediaQuality) => {
    setClearFeedback(null);
    onUpdateSettings({
      ...settings,
      defaultQuality: nextQuality,
    });
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    setClearError(null);
    setClearFeedback(null);
    const countBefore = totalHistoryCount;
    try {
      await onClearAllHistory();
      setConfirmingClear(false);
      setClearFeedback(
        countBefore === 1
          ? 'Cleared 1 history entry and cached offline media.'
          : `Cleared ${countBefore} history entries and cached offline media.`
      );
    } catch {
      setClearError('Unable to clear cached media storage right now. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <section
      id="settings"
      aria-labelledby="settings-heading"
      className="py-8 pb-24 md:pb-12"
    >
      <div className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <h2
            id="settings-heading"
            className="font-display text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl"
          >
            Settings &amp; Preferences
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Preferences are saved locally in your browser and persist automatically across reloads.
        </p>
      </div>

      {storageError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <span>{storageError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Appearance: Dark Mode / Light Mode */}
        <div className="rounded-2xl border border-[#D8E2F0] bg-white p-4 sm:p-5 dark:border-[#1E2E52] dark:bg-[#0B1222]">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Appearance Theme
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Switch between the VEXORA dark navy interface and high-contrast light mode.
          </p>

          <div
            role="group"
            aria-label="Theme mode"
            className="mt-4 grid grid-cols-2 gap-2.5"
          >
            <button
              type="button"
              onClick={() => handleThemeChange('dark')}
              aria-pressed={settings.theme === 'dark'}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                settings.theme === 'dark'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Dark Mode</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange('light')}
              aria-pressed={settings.theme === 'light'}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                settings.theme === 'light'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Light Mode</span>
            </button>
          </div>
        </div>

        {/* Clear Download History with Confirmation */}
        <div className="rounded-2xl border border-[#D8E2F0] bg-white p-4 sm:p-5 dark:border-[#1E2E52] dark:bg-[#0B1222]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Download History &amp; Local Cache
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400 font-mono-tabular">
                {totalHistoryCount === 0
                  ? 'No saved history entries'
                  : `${completedCount} downloaded · ${failedCount} failed or cancelled`}
                {activeCount > 0 ? ` · ${activeCount} active` : ''}
              </p>
            </div>

            {!confirmingClear && (
              <button
                type="button"
                disabled={totalHistoryCount === 0 || isClearing}
                onClick={() => {
                  setClearFeedback(null);
                  setClearError(null);
                  setConfirmingClear(true);
                }}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-45 disabled:cursor-not-allowed dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Clear History</span>
              </button>
            )}
          </div>

          {totalHistoryCount === 0 && !clearFeedback && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Your download history and offline media cache are currently empty.
            </p>
          )}

          {confirmingClear && (
            <div
              role="alertdialog"
              aria-label="Confirm clearing download history"
              className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3.5 dark:border-rose-500/40 dark:bg-rose-950/30"
            >
              <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                Clear all {totalHistoryCount} saved download history entries?
              </p>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300/90">
                This removes all Downloaded and Failed entries along with offline cached media blobs. Active downloads will continue running.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => void handleConfirmClear()}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {isClearing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{isClearing ? 'Clearing...' : 'Confirm Clear'}</span>
                </button>
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => setConfirmingClear(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-[#243761] dark:bg-[#101A30] dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {clearFeedback && (
            <div
              role="status"
              className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{clearFeedback}</span>
            </div>
          )}

          {clearError && (
            <div
              role="alert"
              className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span>{clearError}</span>
            </div>
          )}
        </div>

        {/* Default Download Format */}
        <div className="rounded-2xl border border-[#D8E2F0] bg-white p-4 sm:p-5 dark:border-[#1E2E52] dark:bg-[#0B1222]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Default Download Format
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
              {settings.defaultFormat.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Pre-selected output container whenever you open VEXORA (MP4 recommended for universal playback).
          </p>

          <div
            role="group"
            aria-label="Default download format"
            className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
            {FORMAT_OPTIONS.map((item) => {
              const active = settings.defaultFormat === item.id;
              const isAud = item.kind === 'audio';
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleDefaultFormatChange(item.id)}
                  className={`flex min-h-[48px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer min-w-0 ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-600/15 dark:text-white'
                      : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:border-[#2B406E] dark:hover:text-white'
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

        {/* Default Quality Preference */}
        <div className="rounded-2xl border border-[#D8E2F0] bg-white p-4 sm:p-5 dark:border-[#1E2E52] dark:bg-[#0B1222]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Default Quality Preference
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
              {settings.defaultQuality === 'source' ? 'Source' : settings.defaultQuality}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Applied automatically when detected on a verified URL; falls back to Source if unavailable.
          </p>

          <div
            role="group"
            aria-label="Default quality preference"
            className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
            {qualityChoices.map((opt) => {
              const active = settings.defaultQuality === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleDefaultQualityChange(opt.id)}
                  className={`flex min-h-[44px] items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer text-center ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-600/15 dark:text-white'
                      : 'border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 hover:border-blue-400 dark:border-[#1B2948] dark:bg-[#080E1B] dark:text-slate-300 dark:hover:border-[#2B406E] dark:hover:text-white'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
