/**
 * The deep field behind the sign-in panel: aurora ribbons, a drift of stars and a planet limb
 * rising at the bottom.
 *
 * All CSS and SVG — no image asset, no canvas, and nothing running once the page has painted.
 * Decorative throughout, so it is `aria-hidden` and never takes focus, and
 * `prefers-reduced-motion` stops every part of it (see `index.css`).
 */

/** Star positions as percentages, fixed so the sky looks the same on every visit. */
const STARS = [
  { x: 6, y: 12, s: 2, d: 0 },
  { x: 14, y: 46, s: 1.5, d: 3 },
  { x: 21, y: 78, s: 2, d: 6 },
  { x: 28, y: 22, s: 1.5, d: 1.5 },
  { x: 35, y: 62, s: 2.5, d: 4.5 },
  { x: 43, y: 8, s: 1.5, d: 7.5 },
  { x: 49, y: 88, s: 2, d: 2 },
  { x: 57, y: 34, s: 1.5, d: 5 },
  { x: 64, y: 70, s: 2, d: 8 },
  { x: 71, y: 16, s: 2.5, d: 2.5 },
  { x: 78, y: 54, s: 1.5, d: 6.5 },
  { x: 85, y: 84, s: 2, d: 1 },
  { x: 91, y: 30, s: 1.5, d: 4 },
  { x: 96, y: 64, s: 2, d: 7 },
  { x: 11, y: 92, s: 1.5, d: 5.5 },
  { x: 67, y: 4, s: 1.5, d: 3.5 },
];

export function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <span className="login-aurora login-aurora-1" />
      <span className="login-aurora login-aurora-2" />
      <span className="login-aurora login-aurora-3" />

      {/* Ribbons sweeping across the field, the way a long-exposure trail curves. */}
      <svg
        className="login-ribbons"
        viewBox="0 0 800 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="lb-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0" />
            <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M-40 210 C 180 80, 420 300, 840 120"
          fill="none"
          stroke="url(#lb-ribbon)"
          strokeWidth="2"
        />
        <path
          d="M-40 300 C 220 140, 460 380, 840 210"
          fill="none"
          stroke="url(#lb-ribbon)"
          strokeWidth="1.5"
        />
        <path
          d="M-40 640 C 240 520, 520 760, 840 560"
          fill="none"
          stroke="url(#lb-ribbon)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="login-stars">
        {STARS.map((star) => (
          <span
            key={`${star.x}-${star.y}`}
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.s,
              height: star.s,
              animationDelay: `${star.d}s`,
            }}
          />
        ))}
      </div>

      {/* The planet limb at the foot of the panel. */}
      <span className="login-planet" />
    </div>
  );
}
