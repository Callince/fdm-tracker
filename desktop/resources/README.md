# Build resources

Drop the brand PNGs here before building installers. `electron-builder`
auto-generates `.ico` / `.icns` from `icon.png` at build time, so a single
512×512+ PNG covers Windows and macOS installers.

- `icon.png` — 512×512 or larger, square. Used for the main window icon,
  the floating widget window icon, and the installer (Win + Mac).
- `tray-icon.png` — 16×16 (or 16×16 + `tray-icon@2x.png` at 32×32). On
  macOS the tray PNG is template-rendered (black-only so it recolors to
  match the menu bar).

To swap in a new brand logo: replace `icon.png` with the new square PNG.
Keep file names the same — all wiring (`src/main/windows.ts`,
`src/main/widget.ts`, `src/main/tray.ts`, `electron-builder.yml`) already
points at these paths.
