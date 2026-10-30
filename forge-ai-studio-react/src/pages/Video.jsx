import { useState, useRef, useEffect } from 'react'
import { apiUrl } from '../lib/api.js'

const sampleVideos = [
  {
    label: 'Chain reaction track',
    prompt: 'A marble rolling fast on a chain reaction style track, continuous smooth shot.',
  },
  {
    label: 'Game cinematic',
    prompt: 'A cinematic aerial shot over a neon city at night, perfect for a game title sequence.',
  },
  {
    label: 'Product launch teaser',
    prompt: 'A sleek tech product rotating in a dark studio, glowing rim light, 8 seconds loop.',
  },
  {
    label: 'Animated logo sting',
    prompt: 'A friendly robot waving from a cloud, rendered as a smooth 6 second loop.',
  },
]

export function Video({ username: _username }) {
  const [prompt, setPrompt] = useState('')
  const [generatedVideo, setGeneratedVideo] = useState(null)
  const [generatedVideoType, setGeneratedVideoType] = useState('video/mp4')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [videoHistory, setVideoHistory] = useState([])
  const [duration, setDuration] = useState('10s')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [showSettings, setShowSettings] = useState(false)
  const videoObjectUrls = useRef(new Set())

  useEffect(() => () => {
    videoObjectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    videoObjectUrls.current.clear()
  }, [])

  useEffect(() => {
    const retainedUrls = new Set([
      generatedVideo,
      ...videoHistory.map((video) => video.data),
    ].filter((value) => typeof value === 'string' && value.startsWith('blob:')))

    videoObjectUrls.current.forEach((url) => {
      if (!retainedUrls.has(url)) {
        URL.revokeObjectURL(url)
        videoObjectUrls.current.delete(url)
      }
    })
  }, [generatedVideo, videoHistory])

  const aspectRatios = [
    { label: '16:9', value: '16:9', description: 'Landscape for trailers and store pages' },
    { label: '9:16', value: '9:16', description: 'Vertical for mobile and shorts' },
    { label: '1:1', value: '1:1', description: 'Square for social posts' },
    { label: '3:2', value: '3:2', description: 'Classic cinematic frame' },
    { label: '21:9', value: '21:9', description: 'Wide banner format' },
  ]

  const durationOptions = [
    { label: '6 seconds', value: '6s' },
    { label: '10 seconds', value: '10s' },
    { label: '15 seconds', value: '15s' },
  ]

  const createLocalPreview = () => {
    const safePrompt = prompt.trim().replace(/[<&>"']/g, (character) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    })[character])
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101d3a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><circle cx="1050" cy="120" r="170" fill="#4cd7f6" fill-opacity=".22"/><circle cx="180" cy="560" r="240" fill="#8b5cf6" fill-opacity=".24"/><text x="80" y="110" fill="#dae2fd" font-family="sans-serif" font-size="28" letter-spacing="5">VUX LOCAL PREVIEW</text><text x="80" y="380" fill="white" font-family="sans-serif" font-size="44" font-weight="700">${safePrompt.slice(0, 42)}</text><text x="80" y="440" fill="#dae2fd" font-family="sans-serif" font-size="24">No external generation request was sent.</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const generateVideo = async () => {
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

      const response = await fetch(apiUrl('/api/video'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          duration,
        }),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate video')
      }

      const data = await response.json()
      const videoSource = data.video
      if (typeof videoSource !== 'string' || !videoSource.startsWith('data:video/')) {
        throw new Error('The video service returned an unsupported video.')
      }

      const base64 = videoSource.slice(videoSource.indexOf(',') + 1)
      const videoBlob = new Blob([Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0))], { type: generatedVideoType })
      const videoUrl = URL.createObjectURL(videoBlob)
      videoObjectUrls.current.add(videoUrl)
      setProgress(100)
      setGeneratedVideo(videoUrl)
      setGeneratedVideoType(videoBlob.type)

      setVideoHistory((prev) => [
        {
          id: Date.now(),
          data: videoUrl,
          mimeType: videoBlob.type,
          prompt,
          duration,
          aspectRatio,
          timestamp: new Date().toLocaleString(),
        },
        ...prev.slice(0, 9),
      ])
    } catch (error) {
      console.error('Error generating video:', error)
      setErrorMessage(error.message || 'Failed to generate video. Please try again.')
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const downloadVideo = () => {
    if (!generatedVideo) return
    const link = document.createElement('a')
    link.href = generatedVideo
    link.download = `generated-video.${generatedVideoType.split('/')[1] || 'mp4'}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10 slide-in">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center glow-pulse">
            <span className="text-xl wave-animation">🎬</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            AI Video Generator
          </h1>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh hover:border-forge-primary transition-all magnetic-button"
            title="Toggle settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="p-4 lg:p-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2 space-y-6">
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-forge-primary/10 rounded-full blur-3xl float-animation"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-ai/10 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }}></div>
              </div>

              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-4">CREATE YOUR ANIMATED SCENE</h2>

                <div className="mb-4">
                  <p className="text-xs text-forge-textMuted mb-2">
                    Describe the motion you want, for games, apps, or store pages. Generation can take a while.
                  </p>
                </div>

                <div className="relative mb-4">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the animation you want to create..."
                    className="w-full bg-forge-surfaceLow border border-forge-border rounded-xl px-4 py-3 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none h-32 placeholder-forge-textDim"
                    disabled={isGenerating}
                  />
                </div>

                <div className="mb-4">
                  <p className="text-xs text-forge-textMuted mb-2">Try these prompts:</p>
                  <div className="flex flex-wrap gap-2">
                    {sampleVideos.map((sample, index) => (
                      <button
                        key={index}
                        onClick={() => setPrompt(sample.prompt)}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-xs hover:border-forge-primary hover:bg-forge-primary/10 transition-all magnetic-button scale-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateVideo}
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
                      <span className="wave-animation">✨</span> Generate Video
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

            {generatedVideo && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-forge-success/10 rounded-full blur-3xl float-animation"></div>
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-display font-semibold">GENERATED VIDEO</h2>
                    <button
                      onClick={downloadVideo}
                      className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                    >
                      📥 Download
                    </button>
                  </div>
                  <video
                    src={generatedVideo}
                    controls
                    loop
                    playsInline
                    className="w-full rounded-xl border border-forge-border bg-black"
                    aria-label="Generated video preview"
                  />
                  <p className="mt-3 text-sm text-forge-textMuted">{prompt}</p>
                </div>
              </div>
            )}

            {videoHistory.length > 0 && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 slide-in">
                <h2 className="text-lg font-display font-semibold mb-4">RECENT GENERATIONS</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videoHistory.map((video, index) => (
                    <div
                      key={video.id}
                      className="relative group cursor-pointer scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => {
                        setGeneratedVideo(video.data)
                        setGeneratedVideoType(video.mimeType || 'video/mp4')
                      }}
                    >
                      <video
                        src={video.data}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-36 object-cover rounded-lg border border-forge-border group-hover:border-forge-primary transition-all group-hover:scale-105"
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
            {showSettings && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-lg font-display font-semibold mb-4">GENERATION SETTINGS</h2>

                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-2">
                    {aspectRatios.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => setAspectRatio(ratio.value)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all ${
                          aspectRatio === ratio.value
                            ? 'bg-forge-primary text-black'
                            : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                        }`}
                      >
                        <div className="font-medium">{ratio.label}</div>
                        <div className="text-xs opacity-70">{ratio.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Duration</label>
                  <div className="space-y-2">
                    {durationOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setDuration(option.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          duration === option.value
                            ? 'bg-forge-primary text-black'
                            : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-2xl p-6 relative overflow-hidden slide-in">
              <div className="absolute top-0 right-0 w-24 h-24 bg-forge-ai/10 rounded-full blur-2xl float-animation"></div>
              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                  <span className="wave-animation">💡</span> TIPS
                </h2>
                <ul className="space-y-2 text-sm text-forge-textMuted">
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Describe the motion, not just the scene</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Keep the camera path smooth and continuous</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Match the aspect ratio to the target platform</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Longer clips cost more generation time</span>
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
