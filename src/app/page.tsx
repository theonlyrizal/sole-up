export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">SoleUp</h1>
      <p className="text-lg text-muted">
        Decide what matters, turn goals into realistic next steps, follow
        through, and review your progress.
      </p>
      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          The foundation is being built. Sign-in, goals and Today arrive in the
          next chunks.
        </p>
      </div>
    </main>
  );
}
