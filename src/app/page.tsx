import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">SoleUp</h1>
      <p className="text-lg text-muted">
        Decide what matters, turn goals into realistic next steps, follow
        through, and review your progress.
      </p>
      <div className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          The foundation is being built. Goals and Today arrive in the next
          chunks.
        </p>
        <Link
          href="/sign-in"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
