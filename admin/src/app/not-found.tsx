import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl font-semibold tracking-tight">404</div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
