"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
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
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-2xl font-semibold">Something went wrong</div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The page hit an unexpected error. The team has been notified.
        </p>
        {error.digest && (
          <p className="text-xs font-mono text-neutral-500">ref: {error.digest}</p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
