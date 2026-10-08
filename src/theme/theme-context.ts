import { createContext, useContext } from 'react';
import { DEFAULT_THEME, type Theme } from './theme-preference';

export type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

/**
 * Defaulted rather than undefined: a component rendered outside the provider (a test that mounts
 * one card in isolation, say) gets the light theme and an inert toggle instead of a crash.
 */
export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleTheme: () => {},
});

/** The current theme and the two ways to change it. One provider, at the application root. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
