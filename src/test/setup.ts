import '@testing-library/jest-dom';

/**
 * jsdom implements no media queries, and Ant Design's overlay components (Modal, Select dropdowns)
 * call `matchMedia` on mount. Without this they throw before a single assertion runs, which says
 * nothing about the component under test. Nothing here matches, so components take their default
 * layout — which is the one the tests are written against.
 */
/**
 * jsdom has no ResizeObserver either, and Ant Design's dropdowns observe their trigger to position
 * themselves. It throws asynchronously, so without this a test fails with an unrelated "element not
 * found" while the real error is reported separately as an unhandled rejection.
 */
if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
