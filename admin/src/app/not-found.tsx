import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The page you are looking for does not exist. It may have moved, or the link may be wrong.
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/"
          className="focus-ring inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="focus-ring inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
