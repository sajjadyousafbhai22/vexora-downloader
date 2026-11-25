import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloaderHero } from './components/DownloaderHero';
import { DownloadManagerSection } from './components/DownloadManagerSection';
import { DownloadStatusPopup } from './components/DownloadStatusPopup';
import { Navbar, type NavSection } from './components/Navbar';
import { SupportedFormatsSection } from './components/SupportedFormatsSection';
import { SettingsSection } from './components/SettingsSection';
import { VideoPlayerSection } from './components/VideoPlayerSection';
import {
  WELCOME_POPUP_STORAGE_KEY,
  WelcomeDownloadPopup,
} from './components/WelcomeDownloadPopup';
import type {
  CreateDownloadResponse,
  DownloadHistoryItem,
  DownloadManagerTab,
  DownloadProgressState,
  MediaFormat,
  MediaInspectionResult,
  MediaQuality,
  PlayerMediaItem,
  UrlValidationResponse,
  UrlValidationStatus,
  UserSettings,
} from './types/vexora';
import { apiUrl, HAS_CUSTOM_API_BASE } from './utils/api';
import { captureVideoThumbnail, isAudioFormat, precheckUrlSyntax } from './utils/formatters';
import {
  cacheMediaBlob,
  clearAllCachedMedia,
  deleteCachedMediaBlob,
  getCachedMediaBlob,
  loadHistory,
  loadSettings,
  saveHistory,
  saveSettings,
} from './utils/mediaStore';

const API_CREDENTIALS: RequestCredentials = HAS_CUSTOM_API_BASE ? 'include' : 'same-origin';

interface JobRuntime {
  localId: string;
  serverJobId: string | null;
  abortController: AbortController | null;
  eventSource: EventSource | null;
  chunks: Uint8Array[];
  receivedBytes: number;
  totalBytes: number | null;
  downloadUrl: string | null;
  jobMeta: CreateDownloadResponse | null;
  sourceUrl: string;
  pauseRequested: boolean;
  cancelRequested: boolean;
}

function triggerBrowserSave(objectUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [settingsStorageError, setSettingsStorageError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<NavSection>('downloader');
  const [managerTab, setManagerTab] = useState<DownloadManagerTab>('downloading');

  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<MediaFormat>(() => loadSettings().defaultFormat);
  const [quality, setQuality] = useState<MediaQuality>(() => loadSettings().defaultQuality);

  const [validationStatus, setValidationStatus] = useState<UrlValidationStatus>('idle');
  const [validationTitle, setValidationTitle] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspection, setInspection] = useState<MediaInspectionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [setupNotices, setSetupNotices] = useState<string[]>([]);
  const [transcodingAvailable, setTranscodingAvailable] = useState(true);

  const [activeDownloads, setActiveDownloads] = useState<DownloadProgressState[]>([]);
  const [history, setHistory] = useState<DownloadHistoryItem[]>(() => loadHistory());
  const [playerMedia, setPlayerMedia] = useState<PlayerMediaItem | null>(null);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [togglePlaySignal, setTogglePlaySignal] = useState(0);

  const [statusPopupOpen, setStatusPopupOpen] = useState(true);
  const [welcomePopupOpen, setWelcomePopupOpen] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(WELCOME_POPUP_STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [lastCompleted, setLastCompleted] = useState<{ id: string; title: string } | null>(null);
  const [lastPopupError, setLastPopupError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const runtimesRef = useRef<Map<string, JobRuntime>>(new Map());
  const activeObjectUrlRef = useRef<string | null>(null);
  const validationAbortRef = useRef<AbortController | null>(null);
  const validationTimerRef = useRef<number | null>(null);
  const settingsRef = useRef<UserSettings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
    const isDark = settings.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#060A14' : '#F4F7FB');
    }
  }, [settings]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    if (!welcomePopupOpen) return;
    try {
      window.sessionStorage.setItem(WELCOME_POPUP_STORAGE_KEY, '1');
    } catch {
      // Ignore sessionStorage restrictions
    }
  }, [welcomePopupOpen]);

  useEffect(() => {
    let active = true;
    fetch(apiUrl('/api/history'), { credentials: API_CREDENTIALS })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: DownloadHistoryItem[] } | null) => {
        if (!active || !data || !Array.isArray(data.items) || data.items.length === 0) {
          return;
        }
        setHistory((prev) => {
          const existingIds = new Set(prev.map((entry) => entry.id));
          const merged = [...prev];
          for (const srvItem of data.items!) {
            if (!existingIds.has(srvItem.id)) {
              merged.push({
                ...srvItem,
                hasCachedMedia: false,
              });
            }
          }
          return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
        });
      })
      .catch(() => {
        // Offline or backend starting up — local history remains intact
      });
    fetch(apiUrl('/api/health'), { credentials: API_CREDENTIALS })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            capabilities?: { transcoding?: boolean };
            diagnostics?: { setupIssues?: string[] };
          } | null
        ) => {
          if (!active || !data) return;
          if (typeof data.capabilities?.transcoding === 'boolean') {
            setTranscodingAvailable(data.capabilities.transcoding);
          }
          if (Array.isArray(data.diagnostics?.setupIssues)) {
            setSetupNotices(data.diagnostics.setupIssues);
          }
        }
      )
      .catch(() => {
        // Ignore transient startup checks
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const runtimes = runtimesRef.current;
    return () => {
      if (validationTimerRef.current !== null) {
        window.clearTimeout(validationTimerRef.current);
      }
      validationAbortRef.current?.abort();
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }
      for (const rt of runtimes.values()) {
        rt.eventSource?.close();
        rt.abortController?.abort();
      }
      runtimes.clear();
    };
  }, []);

  const completedItems = useMemo(
    () => history.filter((item) => item.status === 'completed'),
    [history]
  );

  const failedItems = useMemo(
    () => history.filter((item) => item.status === 'failed' || item.status === 'cancelled'),
    [history]
  );

  const updateTaskState = useCallback(
    (localId: string, updater: (prev: DownloadProgressState) => DownloadProgressState) => {
      setActiveDownloads((prev) =>
        prev.map((task) => (task.localId === localId ? updater(task) : task))
      );
    },
    []
  );

  const removeTaskState = useCallback((localId: string) => {
    setActiveDownloads((prev) => prev.filter((task) => task.localId !== localId));
  }, []);

  const navigateTo = useCallback(
    (section: NavSection) => {
      setActiveSection(section);
      if (section === 'history') {
        if (activeDownloads.length > 0) {
          setManagerTab('downloading');
        } else if (completedItems.length > 0) {
          setManagerTab('completed');
        }
      }
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [activeDownloads.length, completedItems.length]
  );

  const handleDismissWelcomePopup = useCallback(() => {
    try {
      window.sessionStorage.setItem(WELCOME_POPUP_STORAGE_KEY, '1');
    } catch {
      // Ignore sessionStorage restrictions
    }
    setWelcomePopupOpen(false);
  }, []);

  const handleStartDownloadFromWelcome = useCallback(() => {
    handleDismissWelcomePopup();
    navigateTo('downloader');
    window.setTimeout(() => inputRef.current?.focus(), 140);
  }, [handleDismissWelcomePopup, navigateTo]);

  const handleFormatChange = (nextFormat: MediaFormat) => {
    setFormat(nextFormat);
    const nextIsAudio = isAudioFormat(nextFormat);
    const currentIsAudioQuality = quality === '320k' || quality === '192k' || quality === '128k';
    if (nextIsAudio && !currentIsAudioQuality && quality !== 'source') {
      setQuality('192k');
    } else if (!nextIsAudio && currentIsAudioQuality) {
      setQuality('source');
    }
  };

  const runServerValidation = useCallback(
    async (rawUrl: string): Promise<UrlValidationResponse | null> => {
      const syntax = precheckUrlSyntax(rawUrl);
      if (!syntax.ok) {
        setValidationStatus('invalid');
        setValidationTitle(syntax.title);
        setValidationMessage(syntax.message);
        setInspection(null);
        return null;
      }

      validationAbortRef.current?.abort();
      const controller = new AbortController();
      validationAbortRef.current = controller;

      setValidationStatus('checking');
      setValidationTitle(null);
      setValidationMessage('Checking URL & verifying media stream...');
      setInspection(null);
      setErrorMessage(null);

      try {
        const resp = await fetch(apiUrl('/api/validate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: API_CREDENTIALS,
          body: JSON.stringify({ url: syntax.normalizedUrl }),
          signal: controller.signal,
        });

        const payload = (await resp.json().catch(() => null)) as UrlValidationResponse | null;
        if (controller.signal.aborted) return null;

        if (!payload || !resp.ok || !payload.valid) {
          setValidationStatus('invalid');
          setValidationTitle(payload?.title || 'Unsupported URL');
          setValidationMessage(
            payload?.message || 'This URL is not supported or could not be verified.'
          );
          setInspection(null);
          return payload;
        }

        setValidationStatus('supported');
        setValidationTitle(payload.title);
        setValidationMessage(payload.message);
        setInspection(payload.inspection);

        if (payload.inspection) {
          const validFormats = payload.inspection.availableFormats.map((f) => f.id);
          const validQualities = payload.inspection.availableQualities.map((q) => q.id);
          const preferredQuality = settingsRef.current.defaultQuality;
          setFormat((prevFormat) => {
            if (validFormats.length > 0 && !validFormats.includes(prevFormat)) {
              setQuality('source');
              return validFormats[0];
            }
            if (!isAudioFormat(prevFormat)) {
              setQuality((prevQuality) => {
                if (validQualities.length === 0) return 'source';
                if (validQualities.includes(prevQuality)) return prevQuality;
                if (validQualities.includes(preferredQuality)) return preferredQuality;
                return 'source';
              });
            }
            return prevFormat;
          });
        }
        return payload;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }
        setValidationStatus('invalid');
        setValidationTitle('Verification Failed');
        setValidationMessage(
          'Network error while validating URL. Check your connection and try again.'
        );
        setInspection(null);
        return null;
      }
    },
    []
  );

  const handleUrlChange = useCallback(
    (nextValue: string) => {
      setUrl(nextValue);
      setErrorMessage(null);
      setInspection(null);

      if (validationTimerRef.current !== null) {
        window.clearTimeout(validationTimerRef.current);
        validationTimerRef.current = null;
      }
      validationAbortRef.current?.abort();

      if (!nextValue.trim()) {
        setValidationStatus('idle');
        setValidationTitle(null);
        setValidationMessage(null);
        return;
      }

      const syntax = precheckUrlSyntax(nextValue);
      if (!syntax.ok) {
        setValidationStatus('invalid');
        setValidationTitle(syntax.title);
        setValidationMessage(syntax.message);
        return;
      }

      setValidationStatus('checking');
      setValidationTitle(null);
      setValidationMessage('Checking URL & verifying media stream...');

      validationTimerRef.current = window.setTimeout(() => {
        void runServerValidation(nextValue);
      }, 450);
    },
    [runServerValidation]
  );

  const handlePasteFromClipboard = async () => {
    setErrorMessage(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          handleUrlChange(text.trim());
        }
      }
    } catch {
      // Clipboard permission denied — focus input
    }
    navigateTo('downloader');
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  const handleInspect = async () => {
    if (validationTimerRef.current !== null) {
      window.clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }
    await runServerValidation(url);
  };

  const setSafePlayerMedia = (next: PlayerMediaItem) => {
    if (activeObjectUrlRef.current && activeObjectUrlRef.current !== next.playbackUrl) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    if (next.isObjectUrl) {
      activeObjectUrlRef.current = next.playbackUrl;
    }
    setPlayerMedia(next);
  };

  const handlePreviewInspected = (meta: MediaInspectionResult) => {
    setSafePlayerMedia({
      id: `preview-${Date.now()}`,
      title: meta.title,
      filename: meta.recommendedFilename,
      sourceUrl: meta.sourceUrl,
      playbackUrl: apiUrl(`/api/preview?url=${encodeURIComponent(meta.resolvedMediaUrl)}`),
      format: meta.contentType.includes('webm')
        ? 'webm'
        : meta.hasVideo
          ? 'mp4'
          : 'mp3',
      quality: 'source',
      isAudioOnly: !meta.hasVideo,
      durationSeconds: meta.durationSeconds,
      fileSizeBytes: meta.contentLength,
      resolution: meta.width && meta.height ? `${meta.width}x${meta.height}` : null,
      thumbnailUrl: meta.posterUrl ?? null,
      isObjectUrl: false,
    });
    setPlaySignal((n) => n + 1);
    navigateTo('player');
  };

  const transferStreamChunks = async (runtime: JobRuntime, resumeFromByte: number) => {
    if (!runtime.downloadUrl || !runtime.jobMeta) {
      throw new Error('Missing transfer stream metadata.');
    }

    const jobMeta = runtime.jobMeta;
    const abortController = new AbortController();
    runtime.abortController = abortController;
    runtime.pauseRequested = false;

    const headers: Record<string, string> = {};
    if (resumeFromByte > 0) {
      headers.Range = `bytes=${resumeFromByte}-`;
    }

    const resp = await fetch(apiUrl(runtime.downloadUrl), {
      headers,
      credentials: API_CREDENTIALS,
      signal: abortController.signal,
    });

    if (!resp.ok && resp.status !== 206) {
      const errData = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        errData.error || `Server returned HTTP ${resp.status} while transferring media.`
      );
    }

    // If upstream ignored Range and returned 200 OK, reset accumulated chunks cleanly
    if (resumeFromByte > 0 && resp.status === 200) {
      runtime.chunks = [];
      runtime.receivedBytes = 0;
    }

    const contentRange = resp.headers.get('content-range');
    const headerLen = resp.headers.get('content-length');
    let totalBytes = runtime.totalBytes ?? jobMeta.contentLength;

    if (contentRange) {
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      if (rangeMatch?.[1]) {
        totalBytes = Number.parseInt(rangeMatch[1], 10);
      }
    } else if (resp.status === 200 && headerLen && /^\d+$/.test(headerLen)) {
      totalBytes = Number.parseInt(headerLen, 10);
    }
    runtime.totalBytes = totalBytes;

    const canPauseResume =
      jobMeta.mode === 'transcode' ||
      jobMeta.supportsRange ||
      resp.status === 206 ||
      (resp.headers.get('accept-ranges') || '').toLowerCase().includes('bytes');

    if (!resp.body) {
      throw new Error('Browser did not receive a readable media stream.');
    }

    const reader = resp.body.getReader();
    const samples: Array<{ t: number; b: number }> = [
      { t: performance.now(), b: runtime.receivedBytes },
    ];
    let lastUiUpdate = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      runtime.chunks.push(value);
      runtime.receivedBytes += value.byteLength;

      const now = performance.now();
      samples.push({ t: now, b: runtime.receivedBytes });
      while (samples.length > 2 && now - samples[0].t > 1500) {
        samples.shift();
      }

      if (now - lastUiUpdate >= 100 || (totalBytes && runtime.receivedBytes >= totalBytes)) {
        lastUiUpdate = now;
        const oldest = samples[0];
        const dtSec = Math.max(0.08, (now - oldest.t) / 1000);
        const dBytes = runtime.receivedBytes - oldest.b;
        const speedBytesPerSec = dBytes > 0 ? dBytes / dtSec : null;
        const percent =
          totalBytes && totalBytes > 0
            ? Math.min(100, Math.round((runtime.receivedBytes / totalBytes) * 100))
            : null;
        const etaSeconds =
          totalBytes &&
          totalBytes > runtime.receivedBytes &&
          speedBytesPerSec &&
          speedBytesPerSec > 0
            ? (totalBytes - runtime.receivedBytes) / speedBytesPerSec
            : null;

        updateTaskState(runtime.localId, (prev) => ({
          ...prev,
          stage: 'transferring',
          percent,
          receivedBytes: runtime.receivedBytes,
          totalBytes,
          speedBytesPerSec,
          speedText: null,
          etaSeconds,
          canPauseResume,
          pauseHint: canPauseResume
            ? null
            : 'Pause unavailable: source server does not support byte-range resume',
          statusMessage: 'Downloading',
        }));
      }
    }

    // Assemble complete file from all chunks
    const blobParts: BlobPart[] = runtime.chunks.map((chunk) => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    });
    const blob = new Blob(blobParts, { type: jobMeta.contentType });
    const objectUrl = URL.createObjectURL(blob);

    triggerBrowserSave(objectUrl, jobMeta.filename);

    const historyId = jobMeta.jobId;
    const isAudio = isAudioFormat(jobMeta.format);
    const [cached, capturedThumb] = await Promise.all([
      cacheMediaBlob(historyId, blob),
      !isAudio ? captureVideoThumbnail(objectUrl) : Promise.resolve(null),
    ]);
    const thumbnailUrl = capturedThumb ?? jobMeta.posterUrl ?? null;
    const resolution =
      jobMeta.width && jobMeta.height ? `${jobMeta.width}x${jobMeta.height}` : null;

    const completedEntry: DownloadHistoryItem = {
      id: historyId,
      title: jobMeta.title,
      filename: jobMeta.filename,
      sourceUrl: runtime.sourceUrl,
      domain: jobMeta.domain,
      format: jobMeta.format,
      quality: jobMeta.quality,
      fileSizeBytes: blob.size,
      durationSeconds: jobMeta.durationSeconds,
      resolution,
      status: 'completed',
      errorMessage: null,
      createdAt: Date.now(),
      hasCachedMedia: cached,
      thumbnailUrl,
    };

    setHistory((prev) => [completedEntry, ...prev].slice(0, 50));
    setLastCompleted({ id: historyId, title: jobMeta.title });
    setLastPopupError(null);

    setSafePlayerMedia({
      id: historyId,
      title: jobMeta.title,
      filename: jobMeta.filename,
      sourceUrl: runtime.sourceUrl,
      playbackUrl: objectUrl,
      format: jobMeta.format,
      quality: jobMeta.quality,
      isAudioOnly: isAudio,
      durationSeconds: jobMeta.durationSeconds,
      fileSizeBytes: blob.size,
      resolution,
      thumbnailUrl,
      isObjectUrl: true,
    });

    runtimesRef.current.delete(runtime.localId);
    removeTaskState(runtime.localId);
  };

  const handleDownloadFailure = (
    runtime: JobRuntime,
    err: unknown,
    targetFormat: MediaFormat,
    targetQuality: MediaQuality,
    fallbackTitle: string
  ) => {
    if (runtime.pauseRequested) {
      updateTaskState(runtime.localId, (prev) => ({
        ...prev,
        stage: 'paused',
        speedBytesPerSec: null,
        speedText: null,
        etaSeconds: null,
        statusMessage: 'Paused',
      }));
      return;
    }

    const isCancelled =
      runtime.cancelRequested || (err instanceof DOMException && err.name === 'AbortError');
    const msg = isCancelled
      ? 'Download cancelled by user.'
      : err instanceof Error
        ? err.message
        : 'Download failed.';

    if (!isCancelled) {
      setErrorMessage(msg);
      setLastPopupError(msg);
      setLastCompleted(null);
    }

    let domain = 'unknown';
    try {
      domain = new URL(runtime.sourceUrl).hostname;
    } catch {
      // Ignore
    }

    const failedEntry: DownloadHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: runtime.jobMeta?.title || fallbackTitle,
      filename: runtime.jobMeta?.filename || `failed.${targetFormat}`,
      sourceUrl: runtime.sourceUrl,
      domain: runtime.jobMeta?.domain || domain,
      format: targetFormat,
      quality: targetQuality,
      fileSizeBytes: null,
      durationSeconds: runtime.jobMeta?.durationSeconds ?? null,
      resolution: null,
      status: isCancelled ? 'cancelled' : 'failed',
      errorMessage: msg,
      createdAt: Date.now(),
      hasCachedMedia: false,
      thumbnailUrl: runtime.jobMeta?.posterUrl ?? null,
    };

    setHistory((prev) => [failedEntry, ...prev].slice(0, 50));
    if (!isCancelled && !runtime.serverJobId) {
      void fetch(apiUrl('/api/history/record-failure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: API_CREDENTIALS,
        body: JSON.stringify({
          sourceUrl: runtime.sourceUrl,
          format: targetFormat,
          quality: targetQuality,
          errorMessage: msg,
        }),
      }).catch(() => {});
    }
    runtimesRef.current.delete(runtime.localId);
    removeTaskState(runtime.localId);
  };

  const startRealDownload = async (
    targetUrl: string,
    targetFormat: MediaFormat,
    targetQuality: MediaQuality
  ) => {
    const syntax = precheckUrlSyntax(targetUrl);
    if (!syntax.ok) {
      setValidationStatus('invalid');
      setValidationTitle(syntax.title);
      setValidationMessage(syntax.message);
      setInspection(null);
      inputRef.current?.focus();
      return;
    }

    const cleanUrl = syntax.normalizedUrl;

    if (validationTimerRef.current !== null) {
      window.clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }

    // Always ensure URL has passed real backend validation before starting download
    const alreadyValidatedSameUrl =
      validationStatus === 'supported' &&
      inspection &&
      inspection.sourceUrl === cleanUrl;

    let verifiedInspection = alreadyValidatedSameUrl ? inspection : null;
    if (!alreadyValidatedSameUrl) {
      const check = await runServerValidation(cleanUrl);
      if (!check || !check.valid || !check.inspection) {
        let failedDomain = 'unknown';
        try {
          failedDomain = new URL(cleanUrl).hostname;
        } catch {
          // Ignore
        }
        const errMsg =
          check?.message || 'This URL could not be verified as a downloadable media stream.';
        setLastPopupError(errMsg);
        setLastCompleted(null);
        setHistory((prev) =>
          [
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title: cleanUrl,
              filename: `failed.${targetFormat}`,
              sourceUrl: cleanUrl,
              domain: failedDomain,
              format: targetFormat,
              quality: targetQuality,
              fileSizeBytes: null,
              durationSeconds: null,
              resolution: null,
              status: 'failed' as const,
              errorMessage: errMsg,
              createdAt: Date.now(),
              hasCachedMedia: false,
              thumbnailUrl: null,
            },
            ...prev,
          ].slice(0, 50)
        );
        void fetch(apiUrl('/api/history/record-failure'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: API_CREDENTIALS,
          body: JSON.stringify({
            sourceUrl: cleanUrl,
            format: targetFormat,
            quality: targetQuality,
            errorMessage: errMsg,
          }),
        }).catch(() => {});
        inputRef.current?.focus();
        return;
      }
      verifiedInspection = check.inspection;
    }
    const localId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let parsedDomain = '';
    try {
      parsedDomain = new URL(cleanUrl).hostname;
    } catch {
      parsedDomain = '';
    }

    const initialTitle = verifiedInspection?.title || cleanUrl;

    setErrorMessage(null);
    setLastPopupError(null);
    setIsSubmitting(true);
    setStatusPopupOpen(true);
    setManagerTab('downloading');

    const abortController = new AbortController();
    const runtime: JobRuntime = {
      localId,
      serverJobId: null,
      abortController,
      eventSource: null,
      chunks: [],
      receivedBytes: 0,
      totalBytes: null,
      downloadUrl: null,
      jobMeta: null,
      sourceUrl: cleanUrl,
      pauseRequested: false,
      cancelRequested: false,
    };
    runtimesRef.current.set(localId, runtime);

    setActiveDownloads((prev) => [
      {
        localId,
        jobId: 'pending',
        title: initialTitle,
        sourceUrl: cleanUrl,
        domain: parsedDomain,
        format: targetFormat,
        quality: targetQuality,
        mode: 'direct',
        stage: 'inspecting',
        percent: null,
        receivedBytes: 0,
        totalBytes: null,
        speedBytesPerSec: null,
        speedText: null,
        etaSeconds: null,
        canPauseResume: false,
        pauseHint: 'Pause available during file transfer',
        statusMessage: 'Validating & inspecting stream',
        errorMessage: null,
        startedAt: Date.now(),
      },
      ...prev,
    ]);

    try {
      const createResp = await fetch(apiUrl('/api/downloads'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: API_CREDENTIALS,
        body: JSON.stringify({
          url: cleanUrl,
          format: targetFormat,
          quality: targetQuality,
        }),
        signal: abortController.signal,
      });

      const createPayload = (await createResp.json().catch(() => ({}))) as CreateDownloadResponse & {
        error?: string;
      };

      setIsSubmitting(false);

      if (!createResp.ok) {
        throw new Error(
          createPayload.error || 'This URL is unsupported or could not be downloaded.'
        );
      }

      runtime.serverJobId = createPayload.jobId;
      runtime.jobMeta = createPayload;
      runtime.totalBytes = createPayload.contentLength;

      updateTaskState(localId, (prev) => ({
        ...prev,
        jobId: createPayload.jobId,
        title: createPayload.title,
        domain: createPayload.domain,
        mode: createPayload.mode,
        totalBytes: createPayload.contentLength,
        canPauseResume:
          createPayload.mode === 'direct' ? createPayload.supportsRange : false,
        pauseHint:
          createPayload.mode === 'direct'
            ? createPayload.supportsRange
              ? null
              : 'Pause unavailable: source server does not support byte-range resume'
            : 'Pause available once server processing finishes',
      }));

      if (createPayload.mode === 'direct') {
        runtime.downloadUrl = createPayload.streamUrl;
        await transferStreamChunks(runtime, 0);
        return;
      }

      if (!createPayload.eventsUrl || !createPayload.fileUrl) {
        throw new Error('Server did not provide progress endpoints for transcode job.');
      }

      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(apiUrl(createPayload.eventsUrl!), {
          withCredentials: HAS_CUSTOM_API_BASE,
        });
        runtime.eventSource = es;

        const onAbort = () => {
          es.close();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        abortController.signal.addEventListener('abort', onAbort, { once: true });

        es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as {
              status: string;
              percent: number | null;
              processedBytes: number;
              speedLabel: string | null;
              outTimeSeconds: number | null;
              outputSizeBytes: number | null;
              errorMessage: string | null;
            };

            if (data.status === 'processing' || data.status === 'pending') {
              let etaSeconds: number | null = null;
              if (
                createPayload.durationSeconds &&
                data.outTimeSeconds !== null &&
                data.speedLabel
              ) {
                const speedFactor = Number.parseFloat(data.speedLabel.replace(/x$/i, ''));
                if (Number.isFinite(speedFactor) && speedFactor > 0) {
                  const remainingMediaSec = Math.max(
                    0,
                    createPayload.durationSeconds - data.outTimeSeconds
                  );
                  etaSeconds = remainingMediaSec / speedFactor;
                }
              }

              updateTaskState(localId, (prev) => ({
                ...prev,
                stage: 'processing',
                percent: data.percent,
                receivedBytes: data.processedBytes,
                speedBytesPerSec: null,
                speedText: data.speedLabel ? `Encoding ${data.speedLabel}` : null,
                etaSeconds,
                canPauseResume: false,
                pauseHint: 'Pause available once server processing finishes',
                statusMessage: 'Processing media on server',
              }));
            } else if (data.status === 'ready') {
              es.close();
              runtime.eventSource = null;
              abortController.signal.removeEventListener('abort', onAbort);
              resolve();
            } else if (data.status === 'error') {
              es.close();
              runtime.eventSource = null;
              abortController.signal.removeEventListener('abort', onAbort);
              reject(new Error(data.errorMessage || 'Server media processing failed.'));
            } else if (data.status === 'cancelled') {
              es.close();
              runtime.eventSource = null;
              abortController.signal.removeEventListener('abort', onAbort);
              reject(new DOMException('Cancelled', 'AbortError'));
            }
          } catch {
            // Ignore malformed SSE event
          }
        };

        es.onerror = () => {
          es.close();
          runtime.eventSource = null;
          abortController.signal.removeEventListener('abort', onAbort);
          reject(new Error('Lost connection to server media processor.'));
        };
      });

      runtime.downloadUrl = createPayload.fileUrl;
      runtime.totalBytes = null;
      await transferStreamChunks(runtime, 0);
    } catch (err) {
      setIsSubmitting(false);
      handleDownloadFailure(runtime, err, targetFormat, targetQuality, initialTitle);
    }
  };

  const handlePauseDownload = (localId: string) => {
    const runtime = runtimesRef.current.get(localId);
    if (!runtime) return;
    runtime.pauseRequested = true;
    runtime.abortController?.abort();
  };

  const handleResumeDownload = async (localId: string) => {
    const runtime = runtimesRef.current.get(localId);
    if (!runtime || !runtime.jobMeta || !runtime.downloadUrl) return;

    updateTaskState(localId, (prev) => ({
      ...prev,
      stage: 'transferring',
      statusMessage: 'Resuming download',
    }));

    try {
      await transferStreamChunks(runtime, runtime.receivedBytes);
    } catch (err) {
      handleDownloadFailure(
        runtime,
        err,
        runtime.jobMeta.format,
        runtime.jobMeta.quality,
        runtime.jobMeta.title
      );
    }
  };

  const handleCancelDownload = async (localId: string) => {
    const runtime = runtimesRef.current.get(localId);
    if (!runtime) {
      removeTaskState(localId);
      return;
    }

    const wasPaused = runtime.abortController === null || runtime.pauseRequested;
    runtime.cancelRequested = true;
    runtime.pauseRequested = false;
    runtime.eventSource?.close();
    runtime.abortController?.abort();

    if (runtime.serverJobId) {
      await fetch(apiUrl(`/api/downloads/${runtime.serverJobId}`), {
        method: 'DELETE',
        credentials: API_CREDENTIALS,
      }).catch(() => {});
    }

    if (wasPaused) {
      handleDownloadFailure(
        runtime,
        new DOMException('Cancelled', 'AbortError'),
        runtime.jobMeta?.format || format,
        runtime.jobMeta?.quality || quality,
        runtime.jobMeta?.title || runtime.sourceUrl
      );
    }
  };

  const handlePlayCompleted = async (item: DownloadHistoryItem) => {
    if (playerMedia && playerMedia.id === item.id) {
      setTogglePlaySignal((n) => n + 1);
      return;
    }

    if (item.hasCachedMedia) {
      const cachedBlob = await getCachedMediaBlob(item.id);
      if (cachedBlob) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        setSafePlayerMedia({
          id: item.id,
          title: item.title,
          filename: item.filename,
          sourceUrl: item.sourceUrl,
          playbackUrl: objectUrl,
          format: item.format,
          quality: item.quality,
          isAudioOnly: isAudioFormat(item.format),
          durationSeconds: item.durationSeconds,
          fileSizeBytes: item.fileSizeBytes,
          resolution: item.resolution,
          thumbnailUrl: item.thumbnailUrl,
          isObjectUrl: true,
        });
        setPlaySignal((n) => n + 1);
        navigateTo('player');
        return;
      }
    }

    setSafePlayerMedia({
      id: item.id,
      title: item.title,
      filename: item.filename,
      sourceUrl: item.sourceUrl,
      playbackUrl: apiUrl(`/api/preview?url=${encodeURIComponent(item.sourceUrl)}`),
      format: item.format,
      quality: item.quality,
      isAudioOnly: isAudioFormat(item.format),
      durationSeconds: item.durationSeconds,
      fileSizeBytes: item.fileSizeBytes,
      resolution: item.resolution,
      thumbnailUrl: item.thumbnailUrl,
      isObjectUrl: false,
    });
    setPlaySignal((n) => n + 1);
    navigateTo('player');
  };

  const handleSaveFromPlayer = async (media: PlayerMediaItem) => {
    if (media.isObjectUrl) {
      triggerBrowserSave(media.playbackUrl, media.filename);
      return;
    }
    setUrl(media.sourceUrl);
    await startRealDownload(media.sourceUrl, media.format, media.quality);
  };

  const handleRedownloadCompleted = async (item: DownloadHistoryItem) => {
    if (item.hasCachedMedia) {
      const cachedBlob = await getCachedMediaBlob(item.id);
      if (cachedBlob) {
        const objUrl = URL.createObjectURL(cachedBlob);
        triggerBrowserSave(objUrl, item.filename);
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
        return;
      }
    }
    setUrl(item.sourceUrl);
    setFormat(item.format);
    setQuality(item.quality);
    await startRealDownload(item.sourceUrl, item.format, item.quality);
  };

  const handleRetryFailed = (item: DownloadHistoryItem) => {
    setUrl(item.sourceUrl);
    setFormat(item.format);
    setQuality(item.quality);
    setInspection(null);
    void startRealDownload(item.sourceUrl, item.format, item.quality);
  };

  const handleDeleteHistoryItem = async (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (playerMedia?.id === id) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      setPlayerMedia(null);
      setIsPlayerPlaying(false);
    }
    void fetch(apiUrl(`/api/history/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      credentials: API_CREDENTIALS,
    }).catch(() => {});
    await deleteCachedMediaBlob(id);
  };

  const handleClearCompleted = async () => {
    const idsToDelete = completedItems.map((i) => i.id);
    setHistory((prev) => prev.filter((item) => item.status !== 'completed'));
    if (playerMedia && idsToDelete.includes(playerMedia.id)) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      setPlayerMedia(null);
      setIsPlayerPlaying(false);
    }
    void fetch(apiUrl('/api/history?status=completed'), {
      method: 'DELETE',
      credentials: API_CREDENTIALS,
    }).catch(() => {});
    await Promise.all(idsToDelete.map((id) => deleteCachedMediaBlob(id)));
  };

  const handleClearFailed = () => {
    setHistory((prev) => prev.filter((item) => item.status === 'completed'));
    void fetch(apiUrl('/api/history?status=failed'), {
      method: 'DELETE',
      credentials: API_CREDENTIALS,
    }).catch(() => {});
  };

  const handleClearAllHistory = async () => {
    const historyIds = new Set(history.map((i) => i.id));
    setHistory([]);
    setLastCompleted(null);
    setLastPopupError(null);
    if (playerMedia && historyIds.has(playerMedia.id)) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      setPlayerMedia(null);
      setIsPlayerPlaying(false);
    }
    void fetch(apiUrl('/api/history'), {
      method: 'DELETE',
      credentials: API_CREDENTIALS,
    }).catch(() => {});
    await clearAllCachedMedia();
  };

  const handleUpdateSettings = (next: UserSettings) => {
    const prev = settings;
    setSettings(next);
    const saved = saveSettings(next);
    setSettingsStorageError(saved.ok ? null : saved.error ?? null);

    if (prev.defaultFormat !== next.defaultFormat) {
      setFormat(next.defaultFormat);
    }
    if (prev.defaultQuality !== next.defaultQuality) {
      if (
        !inspection ||
        isAudioFormat(next.defaultFormat) ||
        inspection.availableQualities.some((q) => q.id === next.defaultQuality)
      ) {
        setQuality(next.defaultQuality);
      }
    }
  };

  const handlePlayLastCompleted = (id: string) => {
    const found = history.find((item) => item.id === id);
    if (found) {
      void handlePlayCompleted(found);
    } else {
      navigateTo('player');
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F7FB] text-slate-900 dark:bg-[#060A14] dark:text-slate-100">
      <Navbar
        activeSection={activeSection}
        onNavigate={navigateTo}
        onPasteUrl={handlePasteFromClipboard}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 min-w-0">
        <DownloaderHero
          url={url}
          onUrlChange={handleUrlChange}
          inputRef={inputRef}
          format={format}
          onFormatChange={handleFormatChange}
          quality={quality}
          onQualityChange={setQuality}
          validationStatus={validationStatus}
          validationTitle={validationTitle}
          validationMessage={validationMessage}
          isDownloading={isSubmitting}
          inspection={inspection}
          errorMessage={errorMessage}
          onPasteFromClipboard={handlePasteFromClipboard}
          onInspect={() => void handleInspect()}
          onDownload={() => void startRealDownload(url, format, quality)}
          onPreviewInspected={handlePreviewInspected}
          setupNotices={setupNotices}
          transcodingAvailable={transcodingAvailable}
        />

        <DownloadManagerSection
          activeTab={managerTab}
          onTabChange={setManagerTab}
          activeDownloads={activeDownloads}
          completedItems={completedItems}
          failedItems={failedItems}
          activePlayerId={playerMedia?.id ?? null}
          isPlayerPlaying={isPlayerPlaying}
          onPauseDownload={handlePauseDownload}
          onResumeDownload={(id) => void handleResumeDownload(id)}
          onCancelDownload={(id) => void handleCancelDownload(id)}
          onPlayCompleted={(item) => void handlePlayCompleted(item)}
          onRedownloadCompleted={(item) => void handleRedownloadCompleted(item)}
          onRetryFailed={handleRetryFailed}
          onDeleteHistoryItem={(id) => void handleDeleteHistoryItem(id)}
          onClearCompleted={() => void handleClearCompleted()}
          onClearFailed={handleClearFailed}
          onFocusInput={() => {
            navigateTo('downloader');
            setTimeout(() => inputRef.current?.focus(), 120);
          }}
        />

        <VideoPlayerSection
          media={playerMedia}
          onSaveMedia={(media) => void handleSaveFromPlayer(media)}
          playSignal={playSignal}
          togglePlaySignal={togglePlaySignal}
          onPlayingChange={setIsPlayerPlaying}
        />

        <SupportedFormatsSection />

        <SettingsSection
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          storageError={settingsStorageError}
          completedCount={completedItems.length}
          failedCount={failedItems.length}
          activeCount={activeDownloads.length}
          onClearAllHistory={handleClearAllHistory}
        />
      </main>

      <footer className="hidden md:block border-t border-[#D8E2F0] dark:border-[#15203B] py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-xs text-slate-500">
          <span>VEXORA Web Media Downloader</span>
          <span>Browser-native playback · Server-verified streams</span>
        </div>
      </footer>

      <WelcomeDownloadPopup
        isOpen={welcomePopupOpen}
        onClose={handleDismissWelcomePopup}
        onStartDownload={handleStartDownloadFromWelcome}
      />

      <DownloadStatusPopup
        isOpen={statusPopupOpen}
        onClose={() => setStatusPopupOpen(false)}
        activeDownloads={activeDownloads}
        lastCompleted={lastCompleted}
        lastError={lastPopupError}
        onPlayLastCompleted={handlePlayLastCompleted}
        onOpenManagerTab={() => {
          setManagerTab('downloading');
          navigateTo('history');
        }}
      />
    </div>
  );
}
