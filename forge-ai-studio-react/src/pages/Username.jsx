import { useState } from 'react'

export function Username({ onContinue }) {
  const [username, setUsername] = useState('')
  const [vibe, setVibe] = useState('Fast launch')
  const vibes = ['Fast launch', 'Builder mode', 'Creative flow']

  const handleSubmit = (event) => {
    event.preventDefault()
    const value = username.trim()
    if (!value) return
    onContinue(value, vibe)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-forge-bg text-forge-text">
      <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-2xl border border-forge-border bg-forge-surface p-6 lg:p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-forge-primary/30 bg-forge-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-forge-primary">
            <span>⚡</span> VUX AI
          </div>
          <h1 className="mt-5 text-3xl font-display font-bold text-white">Before we continue, what should we call you?</h1>
        </div>

        <label className="mb-2 block text-sm text-forge-textMuted" htmlFor="username-input">Username</label>
        <input
          id="username-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoFocus
          placeholder="Enter your username"
          className="w-full rounded-xl border border-forge-border bg-forge-bg px-4 py-3 text-white placeholder:text-forge-textDim focus:border-forge-primary focus:outline-none"
        />

        <div className="mt-6">
          <div className="mb-2 text-sm text-forge-textMuted">Project vibe</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {vibes.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setVibe(option)}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${vibe === option ? 'border-forge-primary bg-forge-primary/10 text-forge-primary' : 'border-forge-border bg-forge-surfaceLow text-forge-textMuted hover:border-forge-primary/50'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="mt-6 w-full rounded-xl bg-forge-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-black hover:bg-forge-primaryHover transition">
          Continue
        </button>
      </form>
    </div>
  )
}