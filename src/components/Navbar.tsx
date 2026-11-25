import { useEffect, useState } from 'react';
import {
  ClipboardPaste,
  Download,
  Film,
  History,
  Layers,
  Menu,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export type NavSection = 'downloader' | 'player' | 'history' | 'formats' | 'settings';

interface NavbarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onPasteUrl: () => void;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  { id: 'downloader', label: 'Downloader' },
  { id: 'player', label: 'Player' },
  { id: 'history', label: 'History' },
  { id: 'formats', label: 'Formats' },
  { id: 'settings', label: 'Settings' },
];

export function Navbar({ activeSection, onNavigate, onPasteUrl }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const handleMobileSelect = (section: NavSection) => {
    setMobileMenuOpen(false);
    onNavigate(section);
  };

  return (
    <>
      <header className="relative border-b border-[#D8E2F0] bg-white/90 dark:border-[#1A2744] dark:bg-[#060A14]/90 backdrop-blur-md md:sticky md:top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 md:gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#downloader"
            onClick={(e) => {
              e.preventDefault();
              setMobileMenuOpen(false);
              onNavigate('downloader');
            }}
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md"
          >
            <svg
              width="26"
              height="26"
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
            <span className="font-display">VEXORA</span>
          </a>

          {/* Zone 2: Clean single-line desktop navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.id);
                  }}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                    isActive
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[21px] h-[2px] bg-blue-600 dark:bg-blue-500"
                    />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Primary action + mobile menu button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onPasteUrl();
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <ClipboardPaste className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Paste URL</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="vexora-mobile-menu"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#D8E2F0] bg-[#F8FAFC] text-slate-700 transition-colors hover:text-slate-900 dark:border-[#1E2E52] dark:bg-[#0D1528] dark:text-slate-200 dark:hover:text-white cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Clean Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            id="vexora-mobile-menu"
            aria-label="Mobile menu"
            className="md:hidden border-t border-[#D8E2F0] bg-white px-4 py-3 shadow-lg dark:border-[#1A2744] dark:bg-[#091020]"
          >
            <div className="flex flex-col gap-1">
              {[
                { id: 'downloader' as const, label: 'Downloader', icon: Download },
                { id: 'history' as const, label: 'Download Manager & History', icon: History },
                { id: 'player' as const, label: 'In-App Media Player', icon: Film },
                { id: 'formats' as const, label: 'Formats & Security', icon: Layers },
                { id: 'settings' as const, label: 'Settings', icon: SlidersHorizontal },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMobileSelect(item.id)}
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-600/15 dark:text-blue-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#111C36]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Mobile Fixed Bottom Thumb-Zone Navigation (60px <= 15% mobile viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#D8E2F0] bg-white/95 dark:border-[#1A2744] dark:bg-[#080E1C]/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-4 h-[60px]">
          <button
            type="button"
            onClick={() => handleMobileSelect('downloader')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
              activeSection === 'downloader'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Download className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="whitespace-nowrap">Downloader</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileSelect('history')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
              activeSection === 'history'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <History className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="whitespace-nowrap">History</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileSelect('player')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
              activeSection === 'player'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Film className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="whitespace-nowrap">Player</span>
          </button>
          <button
            type="button"
            onClick={() => handleMobileSelect('settings')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
              activeSection === 'settings'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="whitespace-nowrap">Settings</span>
          </button>
        </div>
      </nav>
    </>
  );
}
