/**
 * The Overview hero illustration: a delivery workspace seen from above, with the three stages the
 * product names — Plan, Deliver, Govern — threaded along a dotted path.
 *
 * Inline SVG rather than an image file: every colour is a theme token, so the drawing follows
 * light and dark mode exactly like the rest of the page, and it stays crisp at any size. Purely
 * decorative, so it is hidden from assistive technology — the heading beside it carries the
 * meaning.
 */
export function HeroArtwork() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 540 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="hero-card-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--hero-art-surface)" />
          <stop offset="100%" stopColor="var(--hero-art-surface-alt)" />
        </linearGradient>
        <linearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--hero-art-accent)" />
          <stop offset="100%" stopColor="var(--hero-art-accent-soft)" />
        </linearGradient>
      </defs>

      {/* The stack: three sheets of work, the nearest one in focus. */}
      <g opacity="0.45">
        <rect
          x="150"
          y="92"
          width="300"
          height="196"
          rx="16"
          transform="rotate(-6 300 190)"
          fill="var(--hero-art-surface)"
          stroke="var(--hero-art-line)"
        />
      </g>
      <g opacity="0.7">
        <rect
          x="140"
          y="104"
          width="300"
          height="196"
          rx="16"
          transform="rotate(-3 290 202)"
          fill="var(--hero-art-surface)"
          stroke="var(--hero-art-line)"
        />
      </g>

      <rect
        x="128"
        y="120"
        width="300"
        height="196"
        rx="16"
        fill="url(#hero-card-face)"
        stroke="var(--hero-art-line)"
      />

      {/* Board tiles — the planning side of the workspace. */}
      <g fill="var(--hero-art-accent)">
        <rect x="152" y="146" width="20" height="20" rx="5" opacity="0.85" />
        <rect x="178" y="146" width="20" height="20" rx="5" opacity="0.4" />
        <rect x="152" y="172" width="20" height="20" rx="5" opacity="0.4" />
        <rect x="178" y="172" width="20" height="20" rx="5" opacity="0.85" />
      </g>

      {/* Lines of a written plan. */}
      <g fill="var(--hero-art-line)">
        <rect x="152" y="208" width="112" height="9" rx="4.5" />
        <rect x="152" y="225" width="78" height="9" rx="4.5" />
        <rect x="152" y="242" width="96" height="9" rx="4.5" />
      </g>

      {/* Delivery, measured. */}
      <g>
        <rect x="292" y="246" width="16" height="30" rx="5" fill="var(--hero-art-accent-soft)" />
        <rect x="316" y="228" width="16" height="48" rx="5" fill="var(--hero-art-accent-soft)" />
        <rect x="340" y="200" width="16" height="76" rx="5" fill="var(--hero-art-accent)" />
        <rect x="364" y="216" width="16" height="60" rx="5" fill="var(--hero-art-accent-soft)" />
      </g>

      {/* The product mark, watching over the work. */}
      <circle cx="338" cy="160" r="26" stroke="url(#hero-ring)" strokeWidth="9" />

      {/* The thread running through the three stages. */}
      <path
        d="M300 92 C 372 72, 424 96, 448 146 C 470 194, 452 250, 424 290"
        stroke="var(--hero-art-accent-soft)"
        strokeWidth="2"
        strokeDasharray="5 7"
        strokeLinecap="round"
      />

      <Stage x={252} y={40} label="Plan" tone="accent">
        <g stroke="var(--hero-art-accent)" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M-7 -9 h10 l5 5 v13 h-15 z" />
          <path d="M-3 0 h7 M-3 5 h7" />
        </g>
      </Stage>

      <Stage x={446} y={96} label="Deliver" tone="accent">
        <g stroke="var(--hero-art-accent)" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M5 -10 c6 4 7 12 2 18 l-7 -5 z" />
          <path d="M-6 3 c-3 -7 1 -13 8 -13" />
          <path d="M-6 8 l-3 5 l6 -1" />
        </g>
      </Stage>

      <Stage x={424} y={288} label="Govern" tone="success">
        <g stroke="var(--success-solid)" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M0 -10 l9 4 v7 c0 6 -4 10 -9 12 c-5 -2 -9 -6 -9 -12 v-7 z" />
          <path d="M-4 0 l3 3 l6 -6" />
        </g>
      </Stage>
    </svg>
  );
}

/** One labelled stage card floating over the illustration. */
function Stage({
  x,
  y,
  label,
  tone,
  children,
}: {
  x: number;
  y: number;
  label: string;
  tone: 'accent' | 'success';
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-38"
        y="-38"
        width="76"
        height="76"
        rx="16"
        fill="var(--hero-art-surface)"
        stroke={tone === 'success' ? 'var(--success-solid)' : 'var(--hero-art-accent-soft)'}
        strokeWidth={tone === 'success' ? 1.5 : 1}
      />
      <g transform="translate(0 -6)">{children}</g>
      <text x="0" y="26" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--hero-text)">
        {label}
      </text>
    </g>
  );
}
