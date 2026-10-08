import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  isTheme,
  otherTheme,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
} from './theme-preference';

/** A localStorage stand-in, so the tests do not depend on jsdom's shared storage. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

/** Storage that throws on every call — a browser with site data blocked. */
const hostileStorage = new Proxy({} as Storage, {
  get() {
    throw new Error('Access to storage is denied');
  },
});

describe('theme preference', () => {
  it('accepts only the themes that exist', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    for (const value of ['Dark', 'system', '', null, undefined, 1]) {
      expect(isTheme(value)).toBe(false);
    }
  });

  it('gives a first-time visitor light mode', () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(resolveInitialTheme(memoryStorage())).toBe('light');
  });

  /** The point of persisting at all: a reload must not undo the choice. */
  it('restores the theme chosen on a previous visit', () => {
    const storage = memoryStorage();
    storeTheme('dark', storage);
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(resolveInitialTheme(storage)).toBe('dark');
  });

  it('falls back to the default when the stored value is not a theme', () => {
    expect(resolveInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'midnight' }))).toBe('light');
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'midnight' }))).toBeNull();
  });

  /** A preference is a convenience; an unreadable one must not take the application down. */
  it('survives storage that throws on access', () => {
    expect(() => readStoredTheme(hostileStorage)).not.toThrow();
    expect(readStoredTheme(hostileStorage)).toBeNull();
    expect(resolveInitialTheme(hostileStorage)).toBe('light');
    expect(() => storeTheme('dark', hostileStorage)).not.toThrow();
  });

  it('survives storage being absent altogether', () => {
    expect(resolveInitialTheme(null)).toBe('light');
    expect(() => storeTheme('dark', null)).not.toThrow();
  });

  it('toggles between exactly two themes', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });

  describe('applying a theme', () => {
    let root: HTMLElement;
    beforeEach(() => {
      root = document.createElement('html');
    });

    it('marks the document so the stylesheet can key off it', () => {
      applyTheme('dark', root);
      expect(root.getAttribute('data-theme')).toBe('dark');
      expect(root.style.colorScheme).toBe('dark');
    });

    /** Light is written out, not represented by the absence of the attribute. */
    it('states light explicitly when switching back', () => {
      applyTheme('dark', root);
      applyTheme('light', root);
      expect(root.getAttribute('data-theme')).toBe('light');
      expect(root.style.colorScheme).toBe('light');
    });
  });
});
