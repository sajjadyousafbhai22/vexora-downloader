import { Globe, Lock, SlidersHorizontal } from 'lucide-react';

const CAPABILITY_ITEMS = [
  {
    icon: SlidersHorizontal,
    title: 'Supported Output Formats',
    summary:
      'Download streams directly in original quality or transcode on the server into MP4 (H.264/AAC), WebM (VP9/Opus), MKV, MP3 (128–320 kbps), and M4A.',
  },
  {
    icon: Globe,
    title: 'Supported Media Sources',
    summary:
      'Works with public direct media links (.mp4, .webm, .mov, .mp3, .m4a), HLS adaptive playlists (.m3u8), and open HTML5 or OpenGraph video pages.',
  },
  {
    icon: Lock,
    title: 'Verified Web Security',
    summary:
      'Every URL is validated on the backend against private network ranges, redirect chains, and non-media payloads. Executable and APK files are always blocked.',
  },
];

export function SupportedFormatsSection() {
  return (
    <section id="formats" aria-labelledby="formats-heading" className="py-8">
      <div className="mb-5">
        <h2
          id="formats-heading"
          className="font-display text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl"
        >
          Formats &amp; Architecture
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Built as a pure web application with server-side stream verification and browser-native playback.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CAPABILITY_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-2xl border border-[#D8E2F0] bg-white p-5 dark:border-[#1A2744] dark:bg-[#0B1222]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D8E2F0] bg-[#F4F7FB] text-blue-600 dark:border-[#22345C] dark:bg-[#0E182D] dark:text-blue-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">
                {item.summary}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
