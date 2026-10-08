/**
 * The theme preference, as data. Kept free of React and of the DOM beyond a single attribute so
 * the rules — what is a valid theme, what a first-time visitor gets, what survives a reload — can
 * be tested directly rather than through a rendered tree.
 */

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * What a first-time visitor sees. Deliberately not `prefers-color-scheme`: the product's default
 * appearance is light, and a visitor whose OS is dark should still meet the application the way
 * it is documented and demonstrated. They can switch, and the switch is what gets remembered.
 */
export const DEFAULT_THEME: Theme = 'light';

export const THEME_STORAGE_KEY = 'orchestrator.theme';

/** The attribute the stylesheet keys off. Only ever set on the document element. */
export const THEME_ATTRIBUTE = 'data-theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Storage can throw outright — a browser with site data blocked raises on the *property access*,
 * not just the read — so every call is guarded. A theme is a convenience; losing it must never
 * take the application down with it.
 */
function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The remembered choice, or `null` if there is none (or it is unreadable, or it is nonsense). */
export function readStoredTheme(storage: Storage | null = safeStorage()): Theme | null {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A preference we cannot persist still applies for this session.
  }
}

/** What to render on load: the remembered choice, else the product default. */
export function resolveInitialTheme(storage: Storage | null = safeStorage()): Theme {
  return readStoredTheme(storage) ?? DEFAULT_THEME;
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Puts the theme on the document element, which is where `tokens.css` looks for it. Light is
 * written explicitly rather than left as the absence of an attribute, so the value in the DOM is
 * always the answer to "which theme is this" — including for anything reading it from outside.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute(THEME_ATTRIBUTE, theme);
  // Native form controls, scrollbars and the canvas behind the page follow `color-scheme`, which
  // `tokens.css` sets per theme; naming it here too keeps the very first paint consistent.
  root.style.colorScheme = theme;
}
