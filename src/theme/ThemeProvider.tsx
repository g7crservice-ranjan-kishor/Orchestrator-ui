import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { ThemeContext } from './theme-context';
import {
  applyTheme,
  otherTheme,
  resolveInitialTheme,
  storeTheme,
  type Theme,
} from './theme-preference';

/**
 * The interface font stack, written once.
 *
 * `index.css` sets this on `:root` for everything the application styles itself; antd needs to be
 * told separately because it applies its own stack to the body. Same list, so a component rendered
 * by antd and one rendered by us cannot end up in different fonts.
 */
const FONT_STACK = '"Inter Variable", Inter, "Segoe UI", system-ui, sans-serif';

/**
 * The application's single theme authority. It owns three things and nothing else: the current
 * theme, the `data-theme` attribute the stylesheet reads, and the algorithm antd composes its own
 * components from. Every screen therefore changes together — there is no per-page theming, and no
 * component needs a dark variant of itself.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  // Applied in an effect rather than at render so React's rendering stays free of side effects;
  // index.html has already set the attribute for the very first paint, so this is a no-op on load
  // and the real write on every later change.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    storeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = otherTheme(current);
      storeTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          // antd's dark algorithm recolours everything it renders for us — modals, drawers,
          // dropdowns, tooltips, tables, inputs, date pickers — from one switch. Without it those
          // surfaces would stay white on a dark page, which is the usual way a dark mode fails.
          algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            // Indigo, lightened for dark so it clears contrast against a near-black surface.
            colorPrimary: theme === 'dark' ? '#8b93f8' : '#4f46e5',
            borderRadius: 10,
            /*
             * antd ships its own font stack and `antd/dist/reset.css` applies it to the body, so
             * without this its components — every modal, select, button and table — rendered in
             * the system font while the rest of the page used ours. The mismatch is subtle enough
             * to read as sloppiness rather than as a bug, which is why it survived this long.
             *
             * Kept identical to the `:root` stack in `index.css`: two places naming the same font
             * is already one too many, and they must not be allowed to drift.
             */
            fontFamily: FONT_STACK,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
