"use client";

import Link from "next/link";

/**
 * Floating "Home" button in the bottom-right corner of result pages, back to the landing
 * page. A link by default, or `onHome` when the home page needs to reset its own state.
 */
export function HomeButton({ onHome }: { onHome?: () => void }) {
  const className =
    "fixed right-4 bottom-4 z-20 flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg transition hover:opacity-90 sm:right-6 sm:bottom-6 print:hidden";
  const content = (
    <>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />
      </svg>
      Home
    </>
  );
  return onHome ? (
    <button type="button" onClick={onHome} className={className} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {content}
    </button>
  ) : (
    <Link href="/" className={className} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {content}
    </Link>
  );
}
