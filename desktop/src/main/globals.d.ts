/**
 * Module-process global state. Currently only `__fdmQuitting` — set to true
 * by the tray "Quit" handler so the BrowserWindow `close` listener knows
 * the user really wants to exit (vs the default minimize-to-tray behaviour).
 *
 * Declared here so call sites can read/write `globalThis.__fdmQuitting`
 * directly without `as unknown as` casts.
 */
export {};

declare global {
  // eslint-disable-next-line no-var
  var __fdmQuitting: boolean | undefined;
}
