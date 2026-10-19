import { useState, useRef, useEffect } from 'react'
import { apiUrl } from '../lib/api.js'

const sampleMusic = [
  {
    label: 'Ambient piano',
    prompt: 'A warm cinematic ambient track with soft piano, subtle strings, and a hopeful mood.',
    instrumental: true,
  },
  {
    label: 'Upbeat electronic',
    prompt: 'An upbeat electronic dance track with a catchy synth melody and a driving beat.',
    instrumental: false,
  },
]

export function Music({ username: _username }) {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [audioSource, setAudioSource] = useState(null)
  const [audioType, setAudioType] = useState('audio/mpeg')
  const [musicHistory, setMusicHistory] = useState([])
  const [isInstrumental, setIsInstrumental] = useState(false)
  const [forceInstrumental, setForceInstrumental] = useState(true)
  const audioObjectUrls = useRef(new Set())

  useEffect(() => () => {
    audioObjectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    audioObjectUrls.current.clear()
  }, [])

  useEffect(() => {
    const retainedUrls = new Set([
      audioSource,
      ...musicHistory.map((music) => music.data),
    ].filter((value) => typeof value === 'string' && value.startsWith('blob:')))

    audioObjectUrls.current.forEach((url) => {
      if (!retainedUrls.has(url)) {
        URL.revokeObjectURL(url)
        audioObjectUrls.current.delete(url)
      }
    })
  }, [audioSource, musicHistory])

  const createLocalPreview = () => {
    const safePrompt = prompt.trim().replace(/[<&>"']/g, (character) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    })[character])
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101d3a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><circle cx="1050" cy="120" r="170" fill="#4cd7f6" fill-opacity=".22"/><circle cx="180" cy="560" r="240" fill="#8b5cf6" fill-opacity=".24"/><text x="80" y="110" fill="#dae2fd" font-family="sans-serif" font-size="28" letter-spacing="5">VUX LOCAL PREVIEW</text><text x="80" y="380" fill="white" font-family="sans-serif" font-size="40" font-weight="700">${safePrompt.slice(0, 40)}</text><text x="80" y="440" fill="#dae2fd" font-family="sans-serif" font-size="24">No external generation request was sent.</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const generateMusic = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setProgress(0)
    setErrorMessage('')

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      const response = await fetch(apiUrl('/api/music'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          isInstrumental,
          forceInstrumental,
        }),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate music')
      }

      const data = await response.json()
      const audioSource = data.audio
      if (typeof audioSource !== 'string' || !audioSource.startsWith('data:audio/')) {
        throw new Error('The music service returned an unsupported audio file.')
      }

      const base64 = audioSource.slice(audioSource.indexOf(',') + 1)
      const audioBlob = new Blob([Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0))], { type: audioType })
      const audioUrl = URL.createObjectURL(audioBlob)
      audioObjectUrls.current.add(audioUrl)
      setProgress(100)
      setAudioSource(audioUrl)
      setAudioType(audioBlob.type)

      setMusicHistory((prev) => [
        {
          id: Date.now(),
          data: audioUrl,
          mimeType: audioBlob.type,
          prompt,
          isInstrumental,
          forceInstrumental,
          timestamp: new Date().toLocaleString(),
        },
        ...prev.slice(0, 9),
      ])
    } catch (error) {
      console.error('Error generating music:', error)
      setErrorMessage(error.message || 'Failed to generate music. Please try again.')
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const downloadMusic = () => {
    if (!audioSource) return
    const link = document.createElement('a')
    link.href = audioSource
    link.download = `generated-music.${(audioType.split('/')[1] || 'mp3')}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10 slide-in">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center glow-pulse">
            <span className="text-xl wave-animation">🎵</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            AI Music Generator
          </h1>
        </div>
      </header>

      <div className="p-4 lg:p-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2 space-y-6">
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-forge-ai/10 rounded-full blur-3xl float-animation"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-primary/10 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }}></div>
              </div>

              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-4">CREATE YOUR TRACK</h2>

                <div className="mb-4">
                  <p className="text-xs text-forge-textMuted mb-2">
                    Describe the music you want. Instrumental is recommended for a seamless loop.
                  </p>
                </div>

                <div className="relative mb-4">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the music you want to create..."
                    className="w-full bg-forge-surfaceLow border border-forge-border rounded-xl px-4 py-3 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none h-32 placeholder-forge-textDim"
                    disabled={isGenerating}
                  />
                </div>

                <div className="mb-4">
                  <p className="text-xs text-forge-textMuted mb-2">Try these prompts:</p>
                  <div className="flex flex-wrap gap-2">
                    {sampleMusic.map((sample, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setPrompt(sample.prompt)
                          setIsInstrumental(sample.instrumental)
                        }}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-xs hover:border-forge-primary hover:bg-forge-primary/10 transition-all magnetic-button scale-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateMusic}
                  disabled={isGenerating || !prompt.trim()}
                  className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 magnetic-button ${
                    isGenerating || !prompt.trim()
                      ? 'bg-forge-surfaceLow text-forge-textDim cursor-not-allowed'
                      : 'bg-gradient-to-r from-forge-primary to-forge-ai text-black hover:from-forge-primaryHover hover:to-forge-aiHover glow-pulse'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      Generating... {progress}%
                    </>
                  ) : (
                    <>
                      <span className="wave-animation">✨</span> Generate Music
                    </>
                  )}
                </button>

                {errorMessage && (
                  <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
                    {errorMessage}
                  </p>
                )}

                {isGenerating && (
                  <div className="mt-4 scale-in">
                    <div className="h-2 bg-forge-surfaceLow rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-forge-primary to-forge-ai transition-all duration-300 progress-striped"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-forge-textMuted">
                      <span className={progress >= 30 ? 'text-forge-primary' : ''}>Analyzing prompt</span>
                      <span className={progress >= 60 ? 'text-forge-primary' : ''}>Preparing generation</span>
                      <span className={progress >= 90 ? 'text-forge-primary' : ''}>Rendering</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {audioSource && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-forge-success/10 rounded-full blur-3xl float-animation"></div>
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-display font-semibold">GENERATED TRACK</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (audioSource) {
                            const link = document.createElement('audio')
                            link.src = audioSource
                            link.controls = true
                            link.playsInline = true
                            document.body.appendChild(link)
                            link.play()
                            link.onended = () => document.body.removeChild(link)
                          }
                        }}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                      >
                        ▶ Play
                      </button>
                      <button
                        onClick={downloadMusic}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                      >
                        📥 Download
                      </button>
                    </div>
                  </div>
                  <audio src={audioSource} controls loop playsInline className="w-full rounded-xl border border-forge-border bg-black" aria-label="Generated music preview" />
                  <p className="mt-3 text-sm text-forge-textMuted">{prompt}</p>
                </div>
              </div>
            )}

            {musicHistory.length > 0 && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 slide-in">
                <h2 className="text-lg font-display font-semibold mb-4">RECENT GENERATIONS</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {musicHistory.map((music, index) => (
                    <div
                      key={music.id}
                      className="relative group cursor-pointer scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => {
                        setAudioSource(music.data)
                        setAudioType(music.mimeType || 'audio/mpeg')
                      }}
                    >
                      <audio
                        src={music.data}
                        muted
                        preload="metadata"
                        className="w-full h-28 object-cover rounded-lg border border-forge-border group-hover:border-forge-primary transition-all group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs bounce-in">Play</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-2xl p-6 relative overflow-hidden slide-in">
              <div className="absolute top-0 right-0 w-24 h-24 bg-forge-ai/10 rounded-full blur-2xl float-animation"></div>
              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                  <span className="wave-animation">💡</span> TIPS
                </h2>
                <ul className="space-y-2 text-sm text-forge-textMuted">
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Keep the prompt descriptive and specific</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Set instrumental for seamless background loops</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Longer tracks take more generation time</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
