import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDownToLine, X } from 'lucide-react';

export const WELCOME_POPUP_STORAGE_KEY = 'vexora_welcome_popup_seen_v1';

interface WelcomeDownloadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onStartDownload: () => void;
}

export function WelcomeDownloadPopup({
  isOpen,
  onClose,
  onStartDownload,
}: WelcomeDownloadPopupProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-x-0 top-3 sm:top-5 z-50 flex justify-center px-3 sm:px-4 pointer-events-none"
          role="region"
          aria-label="Welcome prompt"
        >
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-labelledby="vexora-welcome-heading"
            aria-describedby="vexora-welcome-description"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -18, scale: 0.98 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -14, scale: 0.98 }
            }
            transition={{
              duration: prefersReducedMotion ? 0.12 : 0.32,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="pointer-events-auto relative w-full max-w-[540px] overflow-hidden rounded-2xl border border-[#1E335E] bg-[#0B1222]/96 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-md"
          >
            {/* Subtle top electric-blue hairline highlight */}
            <div
              aria-hidden="true"
              className="h-[2px] w-full bg-gradient-to-r from-blue-600/20 via-blue-500 to-blue-600/20"
            />

            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                {/* VEXORA Logo Lockup */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 28 28"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <rect width="28" height="28" rx="7" fill="#1D4ED8" />
                    <path
                      d="M8.5 9.5L14 19.5L19.5 9.5"
                      stroke="#FFFFFF"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11.5 9.5L14 14L16.5 9.5"
                      stroke="#93C5FD"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
                    VEXORA
                  </span>
                </div>

                {/* Visible Close (X) Button */}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close welcome popup"
                  className="flex h-10 w-10 sm:h-11 sm:w-11 -mr-1 -mt-1 shrink-0 items-center justify-center rounded-xl border border-[#1E2E52] bg-[#0F182D] text-slate-300 transition-colors hover:border-blue-500/60 hover:bg-[#152240] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2
                    id="vexora-welcome-heading"
                    className="font-display text-lg sm:text-xl font-semibold tracking-tight text-white [text-wrap:balance]"
                  >
                    Ready to Download?
                  </h2>
                  <p
                    id="vexora-welcome-description"
                    className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-300"
                  >
                    Paste your video link and download in your preferred quality.
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={onStartDownload}
                    className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-colors hover:bg-blue-500 active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1222] whitespace-nowrap cursor-pointer"
                  >
                    <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Start Download</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
