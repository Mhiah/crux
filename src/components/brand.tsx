/**
 * The Crux mark: twelve chevrons circling clockwise, used as the "C" of the wordmark.
 * Drawn in currentColor so it follows the theme.
 */

const CHEVRONS = Array.from({ length: 12 }, (_, i) => i * 30);

export function CruxMark({ className = "", title, weight = 6 }: { className?: string; title?: string; weight?: number }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {CHEVRONS.map((deg) => (
        // Each chevron sits on the ring and points along it, clockwise.
        <path
          key={deg}
          d="M -4.5 -7 L 3.5 0 L -4.5 7"
          transform={`rotate(${deg - 90}) translate(38 0) rotate(90)`}
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

/** "Crux" with the mark standing in for the C. Pass the size and weight in `className`. */
export function Wordmark({ className = "font-semibold", markWeight }: { className?: string; markWeight?: number }) {
  return (
    <span className={`inline-flex items-baseline tracking-tight ${className}`} aria-label="Crux">
      <CruxMark weight={markWeight} className="mr-[0.05em] h-[0.9em] w-[0.9em] self-center" />
      <span aria-hidden>rux</span>
    </span>
  );
}
