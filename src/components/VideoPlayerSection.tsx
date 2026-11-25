import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Film,
  Maximize2,
  Music,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PlayerMediaItem } from '../types/vexora';
import { formatBytes, formatDuration, isSafeImageUrl } from '../utils/formatters';

interface VideoPlayerSectionProps {
  media: PlayerMediaItem | null;
  onSaveMedia: (media: PlayerMediaItem) => void;
  playSignal?: number;
  togglePlaySignal?: number;
  onPlayingChange?: (playing: boolean) => void;
}

const BACKDROP_IMAGE_PATH = '/src/assets/images/vexora_player_backdrop_1795525728075.jpg';

export function VideoPlayerSection({
  media,
  onSaveMedia,
  playSignal = 0,
  togglePlaySignal = 0,
  onPlayingChange,
}: VideoPlayerSectionProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingAutoPlayRef = useRef(false);
  const lastPlaySignalRef = useRef(0);
  const lastToggleSignalRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [backdropFailed, setBackdropFailed] = useState(false);

  const activeElement = (): HTMLMediaElement | null =>
    media?.isAudioOnly ? audioRef.current : videoRef.current;

  const updatePlayingState = (next: boolean) => {
    setIsPlaying(next);
    onPlayingChange?.(next);
  };

  useEffect(() => {
    updatePlayingState(false);
    setCurrentTime(0);
    setDuration(media?.durationSeconds ?? 0);
    setMediaError(null);
    setPlaybackRate(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id, media?.playbackUrl]);

  useEffect(() => {
    if (playSignal > 0 && playSignal !== lastPlaySignalRef.current) {
      lastPlaySignalRef.current = playSignal;
      pendingAutoPlayRef.current = true;
      const el = activeElement();
      if (el && el.readyState >= 2) {
        pendingAutoPlayRef.current = false;
        void el.play().catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal, media?.id, media?.playbackUrl]);

  useEffect(() => {
    if (togglePlaySignal > 0 && togglePlaySignal !== lastToggleSignalRef.current) {
      lastToggleSignalRef.current = togglePlaySignal;
      void togglePlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlaySignal]);

  const togglePlay = async () => {
    const el = activeElement();
    if (!el || !media) return;
    try {
      if (el.paused) {
        await el.play();
        updatePlayingState(true);
      } else {
        el.pause();
        updatePlayingState(false);
      }
    } catch {
      setMediaError('Playback could not start. Your browser may not support this codec.');
    }
  };

  const handleSeek = (nextTime: number) => {
    const el = activeElement();
    if (!el) return;
    el.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (nextVol: number) => {
    const el = activeElement();
    setVolume(nextVol);
    setIsMuted(nextVol === 0);
    if (el) {
      el.volume = nextVol;
      el.muted = nextVol === 0;
    }
  };

  const toggleMute = () => {
    const el = activeElement();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (el) {
      el.muted = nextMuted;
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(next);
    const el = activeElement();
    if (el) {
      el.playbackRate = next;
    }
  };

  const handlePip = async () => {
    const el = videoRef.current;
    if (!el || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch {
      // Ignore unsupported PiP
    }
  };

  const handleFullscreen = async () => {
    const target = containerRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      // Ignore unsupported fullscreen
    }
  };

  const safePoster =
    media?.thumbnailUrl && isSafeImageUrl(media.thumbnailUrl) ? media.thumbnailUrl : undefined;

  return (
    <section id="player" aria-labelledby="player-heading" className="py-8">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="player-heading"
            className="font-display text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl"
          >
            In-App Media Player
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Play downloaded files offline from local cache or preview verified media streams directly.
          </p>
        </div>

        {media && (
          <button
            type="button"
            onClick={() => onSaveMedia(media)}
            className="inline-flex min-h-[40px] items-center gap-2 self-start sm:self-auto rounded-lg border border-[#D8E2F0] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-500/50 hover:text-slate-900 dark:border-[#243761] dark:bg-[#101A30] dark:text-slate-200 dark:hover:text-white cursor-pointer whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Save {media.format.toUpperCase()}</span>
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-2xl border border-[#D8E2F0] bg-white shadow-sm dark:border-[#1E2E52] dark:bg-[#080E1B] dark:shadow-none"
      >
        {/* Video / Poster Stage */}
        <div className="relative aspect-video w-full bg-[#050811]">
          {media && !media.isAudioOnly ? (
            <>
              <video
                ref={videoRef}
                key={media.playbackUrl}
                src={media.playbackUrl}
                poster={safePoster}
                playsInline
                preload="metadata"
                onClick={togglePlay}
                onCanPlay={(e) => {
                  if (pendingAutoPlayRef.current) {
                    pendingAutoPlayRef.current = false;
                    void e.currentTarget.play().catch(() => {});
                  }
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  if (Number.isFinite(e.currentTarget.duration)) {
                    setDuration(e.currentTarget.duration);
                  }
                }}
                onPlay={() => updatePlayingState(true)}
                onPause={() => updatePlayingState(false)}
                onEnded={() => updatePlayingState(false)}
                onError={() =>
                  setMediaError(
                    'This media format cannot be decoded natively in the browser player, but the file can still be saved.'
                  )
                }
                className="h-full w-full object-contain bg-black cursor-pointer"
              />

              {!isPlaying && !mediaError && (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15 cursor-pointer"
                >
                  <span className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full border border-blue-400/50 bg-blue-600/90 text-white shadow-xl shadow-blue-950/60 transition-transform hover:scale-105">
                    <Play className="h-6 w-6 sm:h-7 sm:w-7 translate-x-0.5" aria-hidden="true" />
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="relative h-full w-full overflow-hidden">
              {!backdropFailed ? (
                <img
                  src={BACKDROP_IMAGE_PATH}
                  alt="VEXORA studio media backdrop"
                  referrerPolicy="no-referrer"
                  onError={() => setBackdropFailed(true)}
                  className="h-full w-full object-cover opacity-55"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[#0A1328] via-[#070B16] to-[#0D1E42]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#060A14] via-[#060A14]/60 to-transparent" />

              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                {media && media.isAudioOnly ? (
                  <>
                    <audio
                      ref={audioRef}
                      key={media.playbackUrl}
                      src={media.playbackUrl}
                      preload="metadata"
                      onCanPlay={(e) => {
                        if (pendingAutoPlayRef.current) {
                          pendingAutoPlayRef.current = false;
                          void e.currentTarget.play().catch(() => {});
                        }
                      }}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        if (Number.isFinite(e.currentTarget.duration)) {
                          setDuration(e.currentTarget.duration);
                        }
                      }}
                      onPlay={() => updatePlayingState(true)}
                      onPause={() => updatePlayingState(false)}
                      onEnded={() => updatePlayingState(false)}
                      onError={() =>
                        setMediaError('Unable to play this audio file in the browser.')
                      }
                    />
                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-blue-500/40 bg-blue-600/20 text-blue-300">
                      <Music className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                    </div>
                    <p className="mt-2.5 max-w-full sm:max-w-md truncate text-sm sm:text-base font-semibold text-white">
                      {media.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-300 font-mono-tabular">
                      {media.format.toUpperCase()} · {media.quality === 'source' ? 'Original Audio' : media.quality}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-[#243761] bg-[#0B1222]/90 text-blue-400">
                      <Film className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                    </div>
                    <p className="mt-2.5 text-sm sm:text-base font-semibold text-white">
                      No Media Loaded
                    </p>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-300">
                      Download a video or audio track above, inspect a URL to preview it, or select
                      an item from the Downloaded tab.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {mediaError && (
            <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-[#0B1222]/95 px-3.5 py-2.5 text-xs text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{mediaError}</span>
            </div>
          )}
        </div>

        {/* Transport & Metadata Bar */}
        <div className="border-t border-[#D8E2F0] bg-[#F8FAFC] p-3 sm:p-4 dark:border-[#182542] dark:bg-[#0A101F]">
          {media && (
            <div className="mb-2 flex items-center justify-between gap-2 md:hidden">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                {media.title}
              </p>
              <span className="shrink-0 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
                {media.format.toUpperCase()}
                {media.fileSizeBytes ? ` · ${formatBytes(media.fileSizeBytes)}` : ''}
              </span>
            </div>
          )}

          {/* Scrubber */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-400 w-10 sm:w-12 text-right shrink-0">
              {formatDuration(currentTime)}
            </span>
            <input
              type="range"
              aria-label="Seek timeline"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              disabled={!media || duration <= 0}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => handleSeek(Number.parseFloat(e.target.value))}
              className="h-1.5 flex-1 min-w-0 cursor-pointer accent-blue-600 dark:accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="font-mono-tabular text-xs text-slate-600 dark:text-slate-400 w-10 sm:w-12 shrink-0">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Controls Row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                disabled={!media}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 translate-x-0.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                disabled={!media}
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8E2F0] bg-white text-slate-700 transition-colors hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0F182E] dark:text-slate-300 dark:hover:text-white disabled:opacity-40 cursor-pointer shrink-0"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                )}
              </button>

              <input
                type="range"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.05}
                disabled={!media}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                className="hidden sm:block w-20 h-1.5 cursor-pointer accent-blue-600 dark:accent-blue-500 disabled:opacity-40"
              />

              {media && (
                <div className="ml-2 hidden md:block min-w-0">
                  <p className="truncate max-w-xs text-xs font-semibold text-slate-900 dark:text-white">
                    {media.title}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono-tabular">
                    {media.format.toUpperCase()}
                    {media.resolution ? ` · ${media.resolution}` : ''}
                    {media.fileSizeBytes ? ` · ${formatBytes(media.fileSizeBytes)}` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!media}
                onClick={cycleSpeed}
                aria-label="Playback speed"
                className="flex h-11 min-w-[48px] items-center justify-center rounded-xl border border-[#D8E2F0] bg-white px-2.5 font-mono-tabular text-xs font-semibold text-slate-700 transition-colors hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0F182E] dark:text-slate-300 dark:hover:text-white disabled:opacity-40 cursor-pointer"
              >
                {playbackRate}x
              </button>

              {!media?.isAudioOnly && (
                <>
                  <button
                    type="button"
                    disabled={!media}
                    onClick={handlePip}
                    aria-label="Picture in Picture"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8E2F0] bg-white text-slate-700 transition-colors hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0F182E] dark:text-slate-300 dark:hover:text-white disabled:opacity-40 cursor-pointer"
                  >
                    <PictureInPicture2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!media}
                    onClick={handleFullscreen}
                    aria-label="Fullscreen"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D8E2F0] bg-white text-slate-700 transition-colors hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0F182E] dark:text-slate-300 dark:hover:text-white disabled:opacity-40 cursor-pointer"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
