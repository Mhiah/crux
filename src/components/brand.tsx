/**
 * The Crux mark: chevrons running clockwise around an open arc, forming the "C" of the
 * wordmark (the gap on the right is what makes it a C rather than a ring). Drawn in
 * currentColor so it follows the theme.
 */

// Positions every 30° clockwise from the top; the three on the right are left out for the C's opening.
const CHEVRONS = [0, 30, 150, 180, 210, 240, 270, 300, 330];

export function CruxMark({ className = "", weight = 11 }: { className?: string; weight?: number }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden>
      {CHEVRONS.map((deg) => (
        <path
          key={deg}
          d="M -4.5 -7.5 L 3.5 0 L -4.5 7.5"
          transform={`rotate(${deg - 90}) translate(40 0) rotate(90)`}
          fill="none"
          stroke="currentColor"
          strokeWidth={weight}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}

/**
 * The mark as the C, then "RUX" in bold italic capitals. The mark is sized to the capital
 * height and sits on the baseline, so C, R, U and X read as one word.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline leading-none font-bold ${className}`} aria-label="Crux">
      <CruxMark className="mr-[0.03em] h-[0.76em] w-[0.76em] translate-y-[0.02em]" />
      <span aria-hidden className="italic tracking-tight">
        RUX
      </span>
    </span>
  );
}
