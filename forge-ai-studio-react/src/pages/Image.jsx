import { useState, useRef, useEffect } from 'react'
import { apiUrl } from '../lib/api.js'

export function Image({ setCurrentPage: _setCurrentPage, username: _username }) {
  const [prompt, setPrompt] = useState('')
  const [generatedImage, setGeneratedImage] = useState(null)
  const [generatedImageType, setGeneratedImageType] = useState('image/png')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [imageHistory, setImageHistory] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [imageZoom, setImageZoom] = useState(1)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [quality, setQuality] = useState('high')
  const [stylePreset, setStylePreset] = useState('photorealistic')
  const [showSettings, setShowSettings] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [visionImageUrl, setVisionImageUrl] = useState('')
  const [visionQuestion, setVisionQuestion] = useState('What objects are visible in this image?')
  const [visionReply, setVisionReply] = useState('')
  const [visionError, setVisionError] = useState('')
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)
  const imageObjectUrls = useRef(new Set())

  useEffect(() => () => {
    imageObjectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    imageObjectUrls.current.clear()
  }, [])

  useEffect(() => {
    const retainedUrls = new Set([
      generatedImage,
      selectedImage,
      ...imageHistory.map((image) => image.data),
    ].filter((value) => typeof value === 'string' && value.startsWith('blob:')))

    imageObjectUrls.current.forEach((url) => {
      if (!retainedUrls.has(url)) {
        URL.revokeObjectURL(url)
        imageObjectUrls.current.delete(url)
      }
    })
  }, [generatedImage, selectedImage, imageHistory])

  useEffect(() => {
    if (!lightboxOpen) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [lightboxOpen])

  // Generate particle effects
  const particles = isGenerating ? Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 2 + 1
  })) : []

  const aspectRatios = [
    { label: '1:1', value: '1:1', width: 1024, height: 1024, description: 'Square' },
    { label: '16:9', value: '16:9', width: 1536, height: 864, description: 'Landscape' },
    { label: '9:16', value: '9:16', width: 864, height: 1536, description: 'Portrait' },
    { label: '4:3', value: '4:3', width: 1365, height: 1024, description: 'Standard' },
    { label: '3:2', value: '3:2', width: 1216, height: 816, description: 'Classic' },
    { label: '21:9', value: '21:9', width: 1536, height: 640, description: 'Cinematic' },
  ]

  const qualityOptions = [
    { label: 'Fast', value: 'fast', description: 'Quick generation, good quality' },
    { label: 'Standard', value: 'standard', description: 'Balanced speed and quality' },
    { label: 'High', value: 'high', description: 'Enhanced details and clarity' },
    { label: 'Ultra', value: 'ultra', description: 'Maximum quality, slower generation' },
  ]

  const stylePresets = [
    { label: 'Photorealistic', value: 'photorealistic', description: 'Realistic photos' },
    { label: 'Digital Art', value: 'digital-art', description: 'Illustration style' },
    { label: 'Anime', value: 'anime', description: 'Japanese animation' },
    { label: '3D Render', value: '3d-render', description: 'CGI style' },
    { label: 'Oil Painting', value: 'oil-painting', description: 'Classic art style' },
  ]

  const samplePrompts = [
    'A futuristic AI development studio with holographic displays and dark glass',
    'Cinematic cyberpunk cityscape at night with neon lights',
    'Serene Japanese garden with cherry blossoms and misty mountains',
    'Abstract geometric art with vibrant colors and dynamic shapes',
    'Underwater scene with bioluminescent creatures and coral reefs',
  ]

  const createLocalPreview = () => {
    const safePrompt = prompt.trim().replace(/[<&>"']/g, (character) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    })[character])
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101d3a"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="1200" height="800" fill="url(#bg)"/><circle cx="950" cy="150" r="180" fill="#4cd7f6" fill-opacity=".22"/><circle cx="180" cy="720" r="260" fill="#8b5cf6" fill-opacity=".24"/><text x="80" y="130" fill="#dae2fd" font-family="sans-serif" font-size="28" letter-spacing="5">VUX LOCAL PREVIEW</text><text x="80" y="390" fill="white" font-family="sans-serif" font-size="48" font-weight="700">${safePrompt.slice(0, 48)}</text><text x="80" y="450" fill="#dae2fd" font-family="sans-serif" font-size="24">No external generation request was sent.</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const generateImage = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setProgress(0)
    setGeneratedImage(null)
    setErrorMessage('')

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      const response = await fetch(apiUrl('/api/image'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          aspectRatio,
          quality,
          stylePreset,
        }),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Image generation error:', errorData)
        throw new Error(errorData.error || 'Failed to generate image')
      }

      const imageBlob = await response.blob()
      if (!imageBlob.type.startsWith('image/')) {
        throw new Error('The image service returned an unsupported file.')
      }
      const imageUrl = URL.createObjectURL(imageBlob)
      imageObjectUrls.current.add(imageUrl)
      setProgress(100)
      setGeneratedImage(imageUrl)
      setGeneratedImageType(imageBlob.type)

      const newImage = {
        id: Date.now(),
        data: imageUrl,
        mimeType: imageBlob.type,
        prompt,
        timestamp: new Date().toLocaleString(),
        aspectRatio,
        quality,
        stylePreset,
      }

      setImageHistory(prev => [newImage, ...prev.slice(0, 9)])
    } catch (error) {
      console.error('Error generating image:', error)
      setErrorMessage(error.message || 'Failed to generate image. Please try again.')
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const analyzeImage = async () => {
    if (!visionImageUrl.trim() || !visionQuestion.trim() || isAnalyzingImage) return
    setIsAnalyzingImage(true)
    setVisionError('')
    setVisionReply('')

    try {
      const response = await fetch(apiUrl('/api/vision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: visionImageUrl.trim(), message: visionQuestion.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Image understanding could not complete.')
      setVisionReply(data.reply || 'No response received.')
    } catch (error) {
      setVisionError(error.message || 'Image understanding could not complete.')
    } finally {
      setIsAnalyzingImage(false)
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setSelectedImage(event.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const downloadImage = (imageData, mimeType = 'image/png') => {
    try {
      const link = document.createElement('a')
      link.href = imageData
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
      link.download = `generated-image.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error downloading image:', error)
      alert('Failed to download image. Please try again.')
    }
  }

  const clearImage = () => {
    setSelectedImage(null)
  }

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10 slide-in">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center glow-pulse">
            <span className="text-xl wave-animation">🎨</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            AI Image Generator
          </h1>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh hover:border-forge-primary transition-all magnetic-button"
          >
            ⚙️
          </button>
          <button className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh hover:border-forge-primary transition-all magnetic-button">
            🌙
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-4 lg:p-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Generation Area - 2 cols */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
            {/* Prompt Input Section */}
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
              {/* Animated Background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-forge-primary/10 rounded-full blur-3xl float-animation"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-ai/10 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-forge-tech/5 rounded-full blur-3xl float-animation" style={{ animationDelay: '2s' }}></div>
                
                {/* Particle Effects */}
                {isGenerating && particles.map((particle) => (
                  <div
                    key={particle.id}
                    className="absolute rounded-full bg-forge-primary/30 particle"
                    style={{
                      left: `${particle.x}%`,
                      top: `${particle.y}%`,
                      width: `${particle.size}px`,
                      height: `${particle.size}px`,
                      animationDuration: `${particle.duration}s`
                    }}
                  />
                ))}
              </div>

              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-4">CREATE YOUR IMAGE</h2>
                
                {/* Image Upload/Preview */}
                {selectedImage && (
                  <div className="mb-4 relative inline-block">
                    <img 
                      src={selectedImage} 
                      alt="Reference" 
                      className="max-h-32 rounded-lg border border-forge-border"
                    />
                    <button
                      onClick={clearImage}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-all"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Prompt Input */}
                <div className="relative mb-4">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to create..."
                    className="w-full bg-forge-surfaceLow border border-forge-border rounded-xl px-4 py-3 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none h-32 placeholder-forge-textDim"
                    disabled={isGenerating}
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-8 h-8 rounded-lg bg-forge-surfaceHigh border border-forge-border flex items-center justify-center hover:bg-forge-primary hover:text-black transition-all"
                      title="Upload reference image"
                    >
                      📎
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Sample Prompts */}
                <div className="mb-4">
                  <p className="text-xs text-forge-textMuted mb-2">Try these prompts:</p>
                  <div className="flex flex-wrap gap-2">
                    {samplePrompts.map((sample, index) => (
                      <button
                        key={index}
                        onClick={() => setPrompt(sample)}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-xs hover:border-forge-primary hover:bg-forge-primary/10 transition-all magnetic-button scale-in"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        {sample.substring(0, 30)}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateImage}
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
                      <span className="wave-animation">✨</span> Generate Image
                    </>
                  )}
                </button>

                {errorMessage && (
                  <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
                    {errorMessage}
                  </p>
                )}

                {/* Progress Bar */}
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

            {/* Local preview display */}
                        <section className="bg-forge-surface border border-forge-border rounded-2xl p-6 space-y-4">
                          <div>
                            <h2 className="text-lg font-display font-semibold">ASK ABOUT AN IMAGE</h2>
                            <p className="mt-1 text-sm text-forge-textMuted">Use a public HTTPS image URL to ask a question about its contents.</p>
                          </div>
                          <label className="block text-xs font-medium text-forge-textMuted" htmlFor="vision-image-url">Image URL</label>
                          <input
                            id="vision-image-url"
                            type="url"
                            value={visionImageUrl}
                            onChange={(event) => setVisionImageUrl(event.target.value)}
                            placeholder="https://example.com/image.jpg"
                            className="w-full rounded-lg border border-forge-border bg-forge-surfaceLow px-3 py-2 text-sm text-forge-text placeholder-forge-textDim focus:border-forge-primary focus:outline-none"
                            disabled={isAnalyzingImage}
                          />
                          <label className="block text-xs font-medium text-forge-textMuted" htmlFor="vision-image-question">Question</label>
                          <textarea
                            id="vision-image-question"
                            value={visionQuestion}
                            onChange={(event) => setVisionQuestion(event.target.value)}
                            rows={2}
                            className="w-full resize-y rounded-lg border border-forge-border bg-forge-surfaceLow px-3 py-2 text-sm text-forge-text focus:border-forge-primary focus:outline-none"
                            disabled={isAnalyzingImage}
                          />
                          <button
                            onClick={analyzeImage}
                            disabled={isAnalyzingImage || !visionImageUrl.trim() || !visionQuestion.trim()}
                            className="px-4 py-2 bg-forge-primary text-black text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isAnalyzingImage ? 'Analyzing image...' : 'Ask about image'}
                          </button>
                          {visionError && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{visionError}</p>}
                          {visionReply && <p className="whitespace-pre-wrap rounded-lg border border-forge-border bg-forge-surfaceLow p-3 text-sm leading-6 text-forge-text" aria-live="polite">{visionReply}</p>}
                        </section>

                        {/* Local preview display */}
            {generatedImage && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-forge-success/10 rounded-full blur-3xl float-animation"></div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-display font-semibold">GENERATED IMAGE</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadImage(generatedImage, generatedImageType)}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                      >
                        📥 Download
                      </button>
                      <button
                        onClick={() => setSelectedImage(generatedImage)}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                      >
                        🔄 Use as Reference
                      </button>
                    </div>
                  </div>

                  <div className="relative rounded-xl overflow-hidden border border-forge-border group">
                    <img 
                      src={generatedImage} 
                      alt="Generated" 
                      onClick={() => { setImageZoom(1); setLightboxOpen(true) }}
                      className="w-full h-auto cursor-zoom-in image-reveal hover:scale-[1.01] transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                      <p className="text-white text-sm">{prompt}</p>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button
                        onClick={() => downloadImage(generatedImage, generatedImageType)}
                        className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-black/70 transition-all"
                      >
                        📥
                      </button>
                      <button
                        onClick={() => setSelectedImage(generatedImage)}
                        className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-black/70 transition-all"
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Image History */}
            {imageHistory.length > 0 && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 slide-in">
                <h2 className="text-lg font-display font-semibold mb-4">RECENT GENERATIONS</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {imageHistory.map((image, index) => (
                    <div 
                      key={image.id}
                      className="relative group cursor-pointer scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => { setGeneratedImage(image.data); setGeneratedImageType(image.mimeType || 'image/png') }}
                    >
                      <img 
                        src={image.data} 
                        alt={image.prompt}
                        className="w-full h-32 object-cover rounded-lg border border-forge-border group-hover:border-forge-primary transition-all group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs bounce-in">View</span>
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        {image.aspectRatio}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settings Sidebar - 1 col */}
          <div className="space-y-6">
            {/* Settings Panel */}
            {showSettings && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-lg font-display font-semibold mb-4">GENERATION SETTINGS</h2>
                
                {/* Aspect Ratio */}
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-2">
                    {aspectRatios.map((ratio) => (
                      <button
                        key={ratio.value}
                        onClick={() => setAspectRatio(ratio.value)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all aspect-select ${
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

                {/* Quality */}
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Quality</label>
                  <div className="space-y-2">
                    {qualityOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setQuality(option.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          quality === option.value
                            ? 'bg-forge-primary text-black'
                            : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs opacity-70">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style Presets */}
                <div className="mb-6">
                  <label className="text-sm font-medium mb-2 block">Style Preset</label>
                  <div className="space-y-2">
                    {stylePresets.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => setStylePreset(preset.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          stylePreset === preset.value
                            ? 'bg-forge-primary text-black'
                            : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                        }`}
                      >
                        <div className="font-medium">{preset.label}</div>
                        <div className="text-xs opacity-70">{preset.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced Settings */}
                <div className="border-t border-forge-border pt-4">
                  <h3 className="text-sm font-medium mb-3">Advanced</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-forge-textMuted mb-1 block">Seed (optional)</label>
                      <input
                        type="number"
                        placeholder="Random seed"
                        className="w-full bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all placeholder-forge-textDim"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-forge-textMuted mb-1 block">Negative Prompt (optional)</label>
                      <textarea
                        placeholder="What to avoid in the image..."
                        className="w-full bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none h-20 placeholder-forge-textDim"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tips Panel */}
            <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-2xl p-6 relative overflow-hidden slide-in">
              <div className="absolute top-0 right-0 w-24 h-24 bg-forge-ai/10 rounded-full blur-2xl float-animation"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-forge-primary/10 rounded-full blur-2xl float-animation" style={{ animationDelay: '1s' }}></div>
              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                  <span className="wave-animation">💡</span> TIPS
                </h2>
                <ul className="space-y-2 text-sm text-forge-textMuted">
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Be specific with details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Mention style and mood</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Include lighting preferences</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Use reference images for consistency</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-forge-primary">✓</span>
                    <span>Experiment with different aspect ratios</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Stats Panel */}
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6">
              <h2 className="text-lg font-display font-semibold mb-4">GENERATION INFO</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-forge-textMuted">Images Generated</span>
                  <span className="font-semibold">{imageHistory.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-forge-textMuted">Quality</span>
                  <span className="font-semibold text-xs capitalize">{quality}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-forge-textMuted">Style</span>
                  <span className="font-semibold text-xs capitalize">{stylePreset.replace('-', ' ')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-forge-textMuted">Resolution</span>
                  <span className="font-semibold text-xs">{quality === 'ultra' ? '2K' : quality === 'high' ? '1K' : '512'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Canvas for Image Processing */}
      {lightboxOpen && generatedImage && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Image preview">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <span className="truncate text-sm text-white">{prompt || 'Generated image'}</span>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setImageZoom((zoom) => Math.max(0.5, +(zoom - 0.25).toFixed(2)))} className="h-9 w-9 border border-white/15 text-white hover:bg-white/10" title="Zoom out" aria-label="Zoom out">-</button>
              <button onClick={() => setImageZoom(1)} className="h-9 min-w-12 border border-white/15 px-2 text-xs text-white hover:bg-white/10" title="Reset zoom">{Math.round(imageZoom * 100)}%</button>
              <button onClick={() => setImageZoom((zoom) => Math.min(3, +(zoom + 0.25).toFixed(2)))} className="h-9 w-9 border border-white/15 text-white hover:bg-white/10" title="Zoom in" aria-label="Zoom in">+</button>
              <button onClick={() => downloadImage(generatedImage, generatedImageType)} className="h-9 border border-white/15 px-3 text-sm text-white hover:bg-white/10" title="Download image">Download</button>
              <button onClick={() => setLightboxOpen(false)} className="h-9 w-9 border border-white/15 text-white hover:bg-white/10" title="Close preview" aria-label="Close preview">×</button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto py-4">
            <img src={generatedImage} alt="Full-size generated image" className="max-h-full max-w-full object-contain transition-transform duration-200" style={{ transform: `scale(${imageZoom})` }} />
          </div>
        </div>
      )}

      {/* Custom Canvas for Image Processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}