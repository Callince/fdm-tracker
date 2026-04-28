import { useState } from "react";

interface Props {
  /** Pixel height of the logo. Width is derived from the image's aspect ratio. */
  height?: number;
  /** When the logo image is missing, also render a short text label beside the fallback tile. */
  showFallbackText?: boolean;
  className?: string;
}

/**
 * Fourth Dimension brand mark.
 *
 * Preferred: drop the logo at
 *   src/renderer/public/4d-logo.webp
 * Vite copies `public/` verbatim into the build, so the image is served as
 * `./4d-logo.webp` from the renderer. When present we render it at its
 * natural aspect ratio (no separate text label — the logo already says
 * "Fourth Dimension").
 *
 * When the file is missing we fall back to a compact square tile + text
 * label so the UI is still branded.
 */
export function BrandMark({ height = 36, showFallbackText = true, className = "" }: Props) {
  const [imgBroken, setImgBroken] = useState(false);

  if (!imgBroken) {
    return (
      <img
        src="./4d-logo.webp"
        alt="Fourth Dimension"
        onError={() => setImgBroken(true)}
        style={{ height, width: "auto" }}
        className={`block select-none ${className}`}
        draggable={false}
      />
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex items-center justify-center rounded-md bg-brand text-white shadow-sm"
        style={{ width: height, height }}
      >
        <svg viewBox="0 0 32 32" width={height * 0.6} height={height * 0.6} aria-hidden>
          <path
            fill="currentColor"
            d="M18 4v14h4v4h-4v6h-4v-6H2v-3L17 4h1Zm-4 6L6 18h8v-8Z"
          />
        </svg>
      </div>
      {showFallbackText && (
        <div className="leading-tight">
          <div className="text-sm font-semibold text-brand-dark">Fourth Dimension</div>
          <div className="text-xs text-slate-500 tracking-wide uppercase">FDM Tracker</div>
        </div>
      )}
    </div>
  );
}
