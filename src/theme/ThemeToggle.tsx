import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTheme } from './theme-context';

/**
 * The one control that changes the theme, in the topbar so it is reachable from every screen.
 *
 * It shows the theme you would switch *to* — a moon while you are in light mode — which is the
 * convention users already read elsewhere, and it says so in its label rather than relying on the
 * icon alone, so the control is unambiguous to a screen reader.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const target = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${target} mode`;

  return (
    <Tooltip title={label} placement="bottom">
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={label}
        aria-pressed={theme === 'dark'}
      >
        {theme === 'dark' ? <SunOutlined aria-hidden /> : <MoonOutlined aria-hidden />}
      </button>
    </Tooltip>
  );
}
