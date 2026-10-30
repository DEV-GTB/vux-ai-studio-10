export function Terms({ onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-forge-bg text-forge-text">
      <main className="w-full max-w-2xl rounded-2xl border border-forge-border bg-forge-surface p-6 lg:p-8">
        <div className="text-sm font-semibold uppercase tracking-widest text-forge-primary">VUX AI</div>
        <h1 className="mt-4 text-3xl font-display font-bold text-white">Terms of Service</h1>
        <p className="mt-4 text-forge-textMuted">Terms of Service content will be published here before public launch.</p>
        <button onClick={onBack} className="mt-8 rounded-xl bg-forge-primary px-5 py-3 font-semibold text-black hover:bg-forge-primaryHover transition">Back</button>
      </main>
    </div>
  )
}