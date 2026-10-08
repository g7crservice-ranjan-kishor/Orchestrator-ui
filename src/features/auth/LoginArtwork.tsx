/**
 * The illustration on the sign-in panel: a delivery workspace seen at an angle, with an orbit
 * passing behind it.
 *
 * Drawn as SVG rather than shipped as an image — it stays crisp at any size, weighs nothing, and
 * recolours with the theme instead of needing a second asset for dark mode. It is decorative, so
 * it is `aria-hidden` and never focusable.
 */
export function LoginArtwork() {
  return (
    <svg
      className="login-artwork"
      viewBox="0 0 420 420"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="la-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#dfe4f5" />
        </linearGradient>
        <linearGradient id="la-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b4dc4" />
          <stop offset="100%" stopColor="#1d2a7a" />
        </linearGradient>
        <linearGradient id="la-orbit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0" />
          <stop offset="45%" stopColor="#c084fc" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="la-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="la-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <filter id="la-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      {/* Light pooling behind the stack. */}
      <ellipse
        cx="215"
        cy="230"
        rx="120"
        ry="96"
        fill="#6d28d9"
        opacity="0.5"
        filter="url(#la-glow)"
      />

      {/* The card behind — another workspace, slightly further away. */}
      <g transform="translate(96 84) skewY(9) rotate(-2)">
        <rect width="196" height="150" rx="16" fill="url(#la-back)" opacity="0.92" />
        <circle cx="26" cy="26" r="5" fill="#f87171" opacity="0.85" />
        <circle cx="44" cy="26" r="5" fill="#fbbf24" opacity="0.85" />
        <circle cx="62" cy="26" r="5" fill="#34d399" opacity="0.85" />
      </g>

      {/* The orbit, crossing behind the front card. */}
      <ellipse
        cx="212"
        cy="252"
        rx="164"
        ry="60"
        fill="none"
        stroke="url(#la-orbit)"
        strokeWidth="3"
        transform="rotate(-18 212 252)"
        className="login-artwork-orbit"
      />

      {/* The workspace itself. */}
      <g transform="translate(120 132) skewY(9)">
        <rect width="216" height="180" rx="20" fill="url(#la-front)" />

        {/* Product mark. */}
        <rect x="20" y="20" width="40" height="40" rx="12" fill="url(#la-badge)" />
        <path
          d="M40 31c4 3 6 7 6 11 0 3-2 5-6 7-4-2-6-4-6-7 0-4 2-8 6-11z"
          fill="#ffffff"
          opacity="0.95"
        />
        <circle cx="40" cy="41" r="2.4" fill="url(#la-badge)" />

        {/* Copy lines. */}
        <rect x="20" y="76" width="112" height="7" rx="3.5" fill="#94a3b8" opacity="0.5" />
        <rect x="20" y="90" width="84" height="7" rx="3.5" fill="#94a3b8" opacity="0.35" />

        {/* Progress ring. */}
        <circle cx="166" cy="62" r="28" fill="none" stroke="#cbd5e1" strokeWidth="9" />
        <circle
          cx="166"
          cy="62"
          r="28"
          fill="none"
          stroke="url(#la-bar)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="126 176"
          transform="rotate(-90 166 62)"
        />

        {/* Throughput. */}
        {[
          { x: 20, h: 22 },
          { x: 40, h: 38 },
          { x: 60, h: 30 },
          { x: 80, h: 52 },
          { x: 100, h: 44 },
        ].map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={152 - bar.h}
            width="12"
            height={bar.h}
            rx="4"
            fill="url(#la-bar)"
          />
        ))}
        <rect x="128" y="120" width="68" height="7" rx="3.5" fill="#94a3b8" opacity="0.45" />
        <rect x="128" y="134" width="52" height="7" rx="3.5" fill="#94a3b8" opacity="0.3" />
      </g>
    </svg>
  );
}
