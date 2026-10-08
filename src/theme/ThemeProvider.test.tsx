import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';
import { THEME_STORAGE_KEY } from './theme-preference';

function renderShell() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const currentTheme = () => document.documentElement.getAttribute('data-theme');

describe('ThemeProvider + ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it('starts in light mode when nothing has been chosen before', () => {
    renderShell();
    expect(currentTheme()).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('switches the whole document to dark on one click, and back', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(currentTheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(currentTheme()).toBe('light');
  });

  it('remembers the choice for the next visit', () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    unmount();
    document.documentElement.removeAttribute('data-theme');
    renderShell();
    expect(currentTheme()).toBe('dark');
  });

  /** The control reports its own state, so it is not read by icon shape alone. */
  it('exposes the current theme to assistive technology', () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
