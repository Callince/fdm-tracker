# Drop the Fourth Dimension logo here

Save your official Fourth Dimension logo as **`4d-logo.webp`** in this
folder (`src/renderer/public/4d-logo.webp`). The wide "Fourth Dimension /
ENSURING REACH" lockup works well — the BrandMark renders it at its
natural aspect ratio.

Vite copies anything in `public/` to the output as-is, so the image is
served at `./4d-logo.webp` from the renderer.

Until the file is there, the BrandMark component falls back to an inline
SVG + text label so the layout never breaks.
