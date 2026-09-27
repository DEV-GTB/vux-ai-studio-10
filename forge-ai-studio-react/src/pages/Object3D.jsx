import { useState, useRef, useEffect, Suspense } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, useGLTF, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { apiUrl } from '../lib/api.js'

// 3D Model Viewer Component
function ModelViewer({ url }) {
  const gltf = useGLTF(url)
  return <primitive object={gltf.scene} />
}

// Fallback 3D Object (when no model is loaded)
function PlaceholderObject() {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#06b6d4" wireframe />
    </mesh>
  )
}

// 3D Scene Component
function Scene3D({ modelUrl, isPreview }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} />
      
      {modelUrl && !isPreview ? (
        <Suspense fallback={<PlaceholderObject />}>
          <ModelViewer url={modelUrl} />
        </Suspense>
      ) : (
        <PlaceholderObject />
      )}
      
      <ContactShadows position={[0, -2, 0]} opacity={0.5} scale={10} blur={2} />
      <Environment preset="city" />
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={10}
      />
    </>
  )
}

export function Object3D({ setCurrentPage: _setCurrentPage, username: _username }) {
  const [mode, setMode] = useState('text') // 'text' or 'image'
  const [prompt, setPrompt] = useState('')
  const [uploadedImage, setUploadedImage] = useState(null)
  const [generatedModel, setGeneratedModel] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [modelHistory, setModelHistory] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)

  const samplePrompts = [
    'A futuristic robot arm with articulated joints',
    'A medieval castle tower with detailed architecture',
    'A sleek sports car with aerodynamic design',
    'A fantasy sword with ornate decorations',
    'A modern office chair with ergonomic design',
  ]

  const generate3DModel = async () => {
    if (mode === 'text' && !prompt.trim()) return
    if (mode === 'image' && !uploadedImage) return

    setIsGenerating(true)
    setProgress(0)
    setGeneratedModel(null)
    setErrorMessage('')

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 300)

      const response = await fetch(apiUrl('/api/3d'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: mode === 'text' ? prompt : '',
          image: mode === 'image' ? uploadedImage : null,
          mode,
        }),
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('3D generation error:', errorData)
        throw new Error(errorData.error || errorData.details || 'Failed to generate 3D model')
      }

      const data = await response.json()
      setProgress(100)
      setGeneratedModel(data.model)

      const newModel = {
        id: Date.now(),
        data: data.model,
        prompt: mode === 'text' ? prompt : 'Image to 3D',
        timestamp: new Date().toLocaleString(),
        mode,
        format: data.format,
        preview: data.preview,
      }

      setModelHistory(prev => [newModel, ...prev.slice(0, 9)])
    } catch (error) {
      console.error('Error generating 3D model:', error)
      setErrorMessage(error.message || 'Failed to generate 3D model. Please try again.')
    } finally {
      setIsGenerating(false)
      setProgress(0)
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setUploadedImage(event.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    setUploadedImage(null)
  }

  const downloadModel = () => {
    if (!generatedModel) return
    try {
      const link = document.createElement('a')
      link.href = generatedModel
      link.download = '3d-model.glb'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error downloading model:', error)
      alert('Failed to download 3D model. Please try again.')
    }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return

    const newMessage = {
      role: 'user',
      content: chatInput,
      image: uploadedImage,
    }

    setChatMessages(prev => [...prev, newMessage])
    setChatInput('')

    // Simulate AI response (in production, this would call your chat API)
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `I understand you want to create: "${chatInput}". ${mode === 'text' ? 'I can help you generate a 3D model from this description.' : 'I can help you convert this image to a 3D model.'} Please click the Generate button to proceed.`,
      }])
    }, 1000)
  }

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10 slide-in">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center glow-pulse">
            <span className="text-xl wave-animation">🎲</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            3D Object Generator
          </h1>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg border flex items-center justify-center transition-all magnetic-button ${
              showChat 
                ? 'bg-forge-primary text-black border-forge-primary' 
                : 'bg-forge-surfaceLow border-forge-border hover:bg-forge-surfaceHigh hover:border-forge-primary'
            }`}
          >
            💬
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh hover:border-forge-primary transition-all magnetic-button"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-4 lg:p-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Generation Area - 2 cols */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
            {/* Mode Selection */}
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 scale-in">
              <h2 className="text-lg font-display font-semibold mb-4">GENERATION MODE</h2>
              <div className="flex gap-4">
                <button
                  onClick={() => setMode('text')}
                  className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                    mode === 'text'
                      ? 'bg-forge-primary text-black'
                      : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                  }`}
                >
                  📝 Text to 3D
                </button>
                <button
                  onClick={() => setMode('image')}
                  className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                    mode === 'image'
                      ? 'bg-forge-primary text-black'
                      : 'bg-forge-surfaceLow border border-forge-border hover:border-forge-primary'
                  }`}
                >
                  🖼️ Image to 3D
                </button>
              </div>
            </div>

            {/* Input Section */}
            <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-forge-primary/10 rounded-full blur-3xl float-animation"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-ai/10 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }}></div>
              </div>

              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-4">
                  {mode === 'text' ? 'DESCRIBE YOUR 3D OBJECT' : 'UPLOAD REFERENCE IMAGE'}
                </h2>

                {/* Image Upload for Image-to-3D */}
                {mode === 'image' && (
                  <div className="mb-4">
                    {uploadedImage ? (
                      <div className="relative inline-block">
                        <img 
                          src={uploadedImage} 
                          alt="Reference" 
                          className="max-h-48 rounded-lg border border-forge-border"
                        />
                        <button
                          onClick={clearImage}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-all"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 border-2 border-dashed border-forge-border rounded-xl flex flex-col items-center justify-center hover:border-forge-primary hover:bg-forge-primary/5 transition-all"
                      >
                        <span className="text-3xl mb-2">📤</span>
                        <span className="text-sm text-forge-textMuted">Click to upload image</span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                )}

                {/* Text Input for Text-to-3D */}
                {mode === 'text' && (
                  <div className="mb-4">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the 3D object you want to create..."
                      className="w-full bg-forge-surfaceLow border border-forge-border rounded-xl px-4 py-3 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none h-32 placeholder-forge-textDim"
                      disabled={isGenerating}
                    />
                  </div>
                )}

                {/* Sample Prompts */}
                {mode === 'text' && (
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
                          {sample.substring(0, 25)}...
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={generate3DModel}
                  disabled={isGenerating || (mode === 'text' && !prompt.trim()) || (mode === 'image' && !uploadedImage)}
                  className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 magnetic-button ${
                    isGenerating || (mode === 'text' && !prompt.trim()) || (mode === 'image' && !uploadedImage)
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
                      <span className="wave-animation">✨</span> Generate 3D Model
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
                      <span className={progress >= 30 ? 'text-forge-primary' : ''}>Processing input</span>
                      <span className={progress >= 60 ? 'text-forge-primary' : ''}>Generating mesh</span>
                      <span className={progress >= 90 ? 'text-forge-primary' : ''}>Finalizing</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3D Viewer */}
            {generatedModel && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 relative overflow-hidden scale-in">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-forge-success/10 rounded-full blur-3xl float-animation"></div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-display font-semibold">3D PREVIEW</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={downloadModel}
                        className="px-3 py-1.5 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                      >
                        📥 Download GLB
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden border border-forge-border bg-black/20" style={{ height: '400px' }}>
                    <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                      <Scene3D 
                        modelUrl={generatedModel} 
                        isPreview={modelHistory.find(m => m.data === generatedModel)?.preview || false}
                      />
                    </Canvas>
                  </div>

                  {modelHistory.find(m => m.data === generatedModel)?.preview && (
                    <p className="mt-2 text-xs text-forge-textMuted text-center">
                      Preview mode - Full 3D model support coming soon
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Model History */}
            {modelHistory.length > 0 && (
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 slide-in">
                <h2 className="text-lg font-display font-semibold mb-4">RECENT MODELS</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {modelHistory.map((model, index) => (
                    <div 
                      key={model.id}
                      className="relative group cursor-pointer scale-in"
                      style={{ animationDelay: `${index * 0.1}s` }}
                      onClick={() => setGeneratedModel(model.data)}
                    >
                      <div className="rounded-lg border border-forge-border group-hover:border-forge-primary transition-all overflow-hidden bg-black/20 aspect-square flex items-center justify-center">
                        {model.preview ? (
                          <img 
                            src={model.data} 
                            alt={model.prompt}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-4xl">🎲</span>
                        )}
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs bounce-in">View</span>
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        {model.mode}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat Sidebar */}
          {showChat && (
            <div className="space-y-6">
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
                  <span className="wave-animation">💬</span> AI Assistant
                </h2>
                
                <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-forge-textMuted text-center py-8">
                      Ask me anything about 3D modeling!
                    </p>
                  )}
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-forge-primary/20 text-forge-text'
                          : 'bg-forge-surfaceLow text-forge-text'
                      }`}
                    >
                      {msg.image && (
                        <img 
                          src={msg.image} 
                          alt="Reference" 
                          className="max-h-20 rounded mb-2"
                        />
                      )}
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Describe what you want to create..."
                    className="flex-1 bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all placeholder-forge-textDim"
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <button
                    onClick={sendChatMessage}
                    className="px-3 py-2 bg-forge-primary text-black rounded-lg hover:bg-forge-primaryHover transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Sidebar */}
          {showSettings && (
            <div className="space-y-6">
              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 animate-fadeIn">
                <h2 className="text-lg font-display font-semibold mb-4">3D SETTINGS</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Output Format</label>
                    <select className="w-full bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary">
                      <option value="glb">GLB (Recommended)</option>
                      <option value="obj">OBJ</option>
                      <option value="stl">STL</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Quality</label>
                    <select className="w-full bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary">
                      <option value="standard">Standard</option>
                      <option value="high">High</option>
                      <option value="ultra">Ultra</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Detail Level</label>
                    <select className="w-full bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-primary">
                      <option value="low">Low (Faster)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High (Slower)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-2xl p-6 relative overflow-hidden slide-in">
                <div className="absolute top-0 right-0 w-24 h-24 bg-forge-ai/10 rounded-full blur-2xl float-animation"></div>
                <div className="relative z-10">
                  <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
                    <span className="wave-animation">💡</span> TIPS
                  </h2>
                  <ul className="space-y-2 text-sm text-forge-textMuted">
                    <li className="flex items-start gap-2">
                      <span className="text-forge-primary">✓</span>
                      <span>Be specific about shapes and proportions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-forge-primary">✓</span>
                      <span>Mention materials and textures</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-forge-primary">✓</span>
                      <span>Describe the viewing angle</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-forge-primary">✓</span>
                      <span>Use reference images for accuracy</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-forge-surface border border-forge-border rounded-2xl p-6">
                <h2 className="text-lg font-display font-semibold mb-4">GENERATION INFO</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-forge-textMuted">Models Generated</span>
                    <span className="font-semibold">{modelHistory.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-forge-textMuted">Current Mode</span>
                    <span className="font-semibold text-xs capitalize">{mode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-forge-textMuted">Format</span>
                    <span className="font-semibold text-xs">GLB</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
