import { describe, it, expect } from 'vitest';

/**
 * Guard test (issue #299): native browser dialogs are banned in app code.
 *
 * `window.confirm` / `alert` / `prompt` are unstyled, inaccessible, and
 * unreliable in some browsers and automation contexts. Destructive actions must
 * use the inline <ConfirmButton> primitive instead. This test fails if any
 * source file reintroduces a native dialog call, so the anti-pattern cannot
 * silently come back.
 */

// Load every app source file as raw text (excludes this test via the filter below).
const sources = import.meta.glob('../**/*.{js,jsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Matches calls like `confirm(`, `window.confirm(`, `globalThis.alert(`, `prompt(`
// but not member calls on other objects (e.g. `promptsApi.foo(`, `obj.confirm(`)
// or identifiers like `promptLabel`.
const NATIVE_DIALOG_CALL = /(?<![.\w])(?:window\.|globalThis\.)?(?:confirm|alert|prompt)\s*\(/;

describe('no native browser dialogs in app code', () => {
  const appFiles = Object.entries(sources).filter(
    ([path]) => !path.includes('/__tests__/') && !path.includes('setupTests'),
  );

  it('scans a non-trivial number of source files', () => {
    expect(appFiles.length).toBeGreaterThan(10);
  });

  it.each(appFiles)('%s contains no window.confirm/alert/prompt call', (_path, code) => {
    // Strip line and block comments so doc references to `window.confirm` (no
    // call parens anyway) never trip the guard.
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(NATIVE_DIALOG_CALL.test(withoutComments)).toBe(false);
  });
});
