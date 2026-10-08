import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './theme/ThemeProvider';
/*
 * The interface font, self-hosted.
 *
 * `index.css` has always asked for `Inter` first — but nothing ever loaded it, so every browser
 * fell through to the next name in the stack and the whole application rendered in Segoe UI on
 * Windows. A font-family that names a font nobody ships is a silent default, and silent is the
 * problem: it looks deliberate.
 *
 * Self-hosted rather than fetched from a CDN: no third-party request on first paint, nothing to
 * allow through a content-security policy, and it still works on a machine with no internet.
 * The variable build is one file for every weight the UI uses.
 */
import '@fontsource-variable/inter';
import 'antd/dist/reset.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
