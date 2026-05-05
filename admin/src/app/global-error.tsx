"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: "#666", marginBottom: 16 }}>
              The application hit a critical error. Please try reloading.
            </p>
            {error.digest && (
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#999" }}>
                ref: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{
                marginTop: 12,
                padding: "8px 16px",
                background: "#111",
                color: "white",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
