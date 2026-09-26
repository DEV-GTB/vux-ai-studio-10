import { useState, useEffect, useRef } from 'react'

const dailyInsights = [
  "AI gives you the speed, Your Imagination gives it direction.",
  "AI can generate the code, Only you can decide what's worth building.",
  "The developer of tomorrow won't fear AI, They'll build with it.",
  "AI can generate possibilities, Humans give those possibilities purpose.",
  "VUX is where vision meets intelligence, and intelligence becomes creation.",
  "Forge your vision, Shape your experience, Build beyond limits.",
  "AI is not here to replace developers, but to empower them to create beyond limits."
]

export function Home({ setCurrentPage, username }) {
  const [projects] = useState([
    { name: 'Game Theory Building Engine', type: 'Python Project', icon: '🐍', status: 'Active', edited: '2 hours ago', color: 'primary', health: 'healthy' },
    { name: 'AI Assistant', type: 'TypeScript Project', icon: '🤖', status: 'Building', edited: 'Yesterday', color: 'ai', health: 'warning' },
    { name: 'Skyfall Game', type: 'C++ Project', icon: '🎮', status: 'Active', edited: '3 days ago', color: 'success', health: 'healthy' },
    { name: 'Portfolio Site', type: 'Web Project', icon: '🌐', status: 'Active', edited: '1 week ago', color: 'tech', health: 'healthy' },
  ])

  const [showNewProjectModal, setShowNewProjectModal] = useState(false)

  const getNextSteps = (project) => {
    const steps = []
    
    if (project.health === 'warning') {
      steps.push({ text: 'Fix detected warnings', priority: 'high', icon: '🔧' })
    }
    
    if (project.status === 'Building') {
      steps.push({ text: 'Complete build process', priority: 'high', icon: '🔨' })
    }
    
    if (project.type.includes('React') || project.type.includes('Web')) {
      steps.push({ text: 'Add responsive design', priority: 'medium', icon: '📱' })
      steps.push({ text: 'Optimize performance', priority: 'medium', icon: '⚡' })
    }
    
    if (project.type.includes('Python')) {
      steps.push({ text: 'Add unit tests', priority: 'medium', icon: '🧪' })
      steps.push({ text: 'Set up virtual environment', priority: 'low', icon: '🐍' })
    }
    
    steps.push({ text: 'Create production build', priority: 'low', icon: '🚀' })
    steps.push({ text: 'Deploy to hosting', priority: 'low', icon: '🌐' })
    
    return steps.slice(0, 4) // Show top 4 suggestions
  }

  const projectTemplates = [
    { name: 'Website', icon: '🌐', description: 'Modern website with HTML, CSS, JS', type: 'web' },
    { name: 'React', icon: '⚛️', description: 'React application with Vite', type: 'react' },
    { name: 'Web App', icon: '📱', description: 'Progressive web application', type: 'pwa' },
    { name: 'Python', icon: '🐍', description: 'Python backend or script', type: 'python' },
    { name: 'Node.js', icon: '💚', description: 'Node.js server application', type: 'node' },
    { name: 'AI Project', icon: '🤖', description: 'AI-powered application', type: 'ai' },
    { name: 'Game', icon: '🎮', description: 'Game development project', type: 'game' },
    { name: 'Empty Project', icon: '📦', description: 'Start from scratch', type: 'empty' },
  ]

  const [currentInsightIndex, setCurrentInsightIndex] = useState(0)
  const [displayedInsight, setDisplayedInsight] = useState('')
  const [isTyping, setIsTyping] = useState(true)
  const typingIntervalRef = useRef(null)
  const currentIndexRef = useRef(0)

  const [aiActivities] = useState([
    { icon: '🔍', task: 'Analyzing project structure', time: '2m ago', status: 'processing' },
    { icon: '✨', task: 'Generating code suggestion', time: '5m ago', status: 'complete' },
    { icon: '⚡', task: 'Optimizing performance', time: '15m ago', status: 'complete' },
    { icon: '✓', task: 'Scan complete', time: '1h ago', status: 'complete' },
  ])

  const shortcuts = [
    { key: 'AI Chat', shortcut: 'CTRL + L', icon: '💬' },
    { key: 'New Project', shortcut: 'CTRL + N', icon: '📁' },
    { key: 'Settings', shortcut: 'CTRL + ,', icon: '⚙️' },
    { key: 'Search', shortcut: 'CTRL + K', icon: '🔍' },
  ]

  const [activeFeature, setActiveFeature] = useState(0)
  const features = [
    {
      title: 'AI-Powered Coding',
      description: 'Generate, refactor, and optimize code with intelligent suggestions',
      icon: '💻',
      color: 'primary',
      code: `function optimizeAlgorithm(data) {
  // AI-optimized implementation
  return data.map(item => 
    item.value * 2
  ).filter(Boolean);
}`
    },
    {
      title: 'Intelligent Chat',
      description: 'Natural conversations that understand context and intent',
      icon: '💬',
      color: 'ai',
      code: `User: "How do I optimize this?" 
AI: "I can help with that! 
     Here are 3 approaches..."`
    },
    {
      title: 'Creative Image Generation',
      description: 'Transform ideas into stunning visuals with AI',
      icon: '🎨',
      color: 'tech',
      code: `// Generating masterpiece...
prompt: "Futuristic cyberpunk 
       city at sunset"
status: "Creating magic..."`
    }
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [features.length])

  // Daily insight typing animation
  useEffect(() => {
    const insightInterval = setInterval(() => {
      setCurrentInsightIndex(prev => (prev + 1) % dailyInsights.length)
    }, 10000) // Change every 10 seconds
    return () => clearInterval(insightInterval)
  }, [dailyInsights.length])

  useEffect(() => {
    currentIndexRef.current = 0
    setDisplayedInsight('')
    setIsTyping(true)
    
    const currentInsight = dailyInsights[currentInsightIndex] || ''
    
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
    }
    
    typingIntervalRef.current = setInterval(() => {
      if (currentIndexRef.current < currentInsight.length) {
        setDisplayedInsight(currentInsight.substring(0, currentIndexRef.current + 1))
        currentIndexRef.current++
      } else {
        setIsTyping(false)
        clearInterval(typingIntervalRef.current)
      }
    }, 50) // Typing speed
    
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current)
      }
    }
  }, [currentInsightIndex])

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <input
              type="text"
              placeholder="Search anything in Vux AI Studio..."
              className="w-64 lg:w-96 bg-forge-surfaceLow border border-forge-border rounded-lg px-4 py-2.5 pl-10 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all placeholder-forge-textDim"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-forge-textMuted">🔍</span>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-forge-textDim border border-forge-border px-1.5 py-0.5 rounded">CTRL K</span>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-4">
          <button className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh transition-all">
            🔔
          </button>
          <button className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh transition-all">
            🌙
          </button>
          <button className="px-3 lg:px-4 py-2 bg-forge-primary text-black font-medium rounded-lg hover:bg-forge-primaryHover transition-all text-sm">
            + New Project
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-4 lg:p-8 pb-24">
        {/* Hero Section with Background Artwork */}
        <div className="relative bg-gradient-to-br from-forge-surface to-forge-surfaceHigh rounded-2xl p-6 lg:p-8 mb-6 lg:mb-8 overflow-hidden">
          {/* Background Artwork */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-forge-primary/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-ai/10 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-forge-tech/5 rounded-full blur-3xl"></div>
          </div>
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-forge-bg/80 via-transparent to-transparent"></div>
          
          <div className="relative z-10">
            <div className="text-forge-primary text-xs lg:text-sm font-semibold tracking-wider mb-2">
              Welcome back,
            </div>
            <h1 className="text-3xl lg:text-5xl font-display font-bold text-white mb-2">
              {username}<span className="text-forge-primary">.</span>
            </h1>
            <p className="text-base lg:text-lg text-forge-textMuted mb-6 max-w-lg">
              Build, iterate and ship extraordinary with the power of Vux AI Studio.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-6">
              <button 
                onClick={() => setShowNewProjectModal(true)}
                className="px-6 py-3 bg-forge-primary text-black font-semibold rounded-lg hover:bg-forge-primaryHover transition-all"
              >
                New Project
              </button>
              <button className="px-6 py-3 bg-forge-surfaceLow border border-forge-border text-white rounded-lg hover:bg-forge-surfaceHigh transition-all">
                Open Project
              </button>
            </div>
          </div>
        </div>

        {/* Feature Showcase */}
        <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-2xl p-6 lg:p-8 mb-6 lg:mb-8 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-forge-primary/5 rounded-full blur-3xl float-animation"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-forge-ai/5 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }}></div>
          </div>
          
          <div className="relative z-10">
            <h2 className="text-xl lg:text-2xl font-display font-bold text-white mb-6">Vux AI Studio Features</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Feature Description */}
              <div className="space-y-4">
                {features.map((feature, index) => (
                  <div 
                    key={index}
                    onClick={() => setActiveFeature(index)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      activeFeature === index 
                        ? 'bg-forge-primary/20 border-forge-primary' 
                        : 'bg-forge-surfaceLow border-forge-border hover:border-forge-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{feature.icon}</span>
                      <h3 className="font-semibold text-white">{feature.title}</h3>
                    </div>
                    <p className="text-sm text-forge-textMuted">{feature.description}</p>
                  </div>
                ))}
              </div>

              {/* Animated Code Display */}
              <div className="bg-forge-surfaceLow border border-forge-border rounded-xl p-4 font-mono text-sm overflow-hidden">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-forge-border">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-xs text-forge-textMuted ml-2">{features[activeFeature].title}</span>
                </div>
                <div className="relative">
                  <pre className="text-forge-textMuted whitespace-pre-wrap">
                    <code className="stream-animation">
                      {features[activeFeature].code}
                    </code>
                  </pre>
                  <div className="typing-cursor"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - 2 cols */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
            {/* Recent Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold">RECENT PROJECTS</h2>
                <button className="text-forge-primary text-sm font-medium hover:underline">View all →</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {projects.map((project, index) => (
                  <div key={index} className="bg-forge-surface border border-forge-border rounded-xl p-4 hover:border-forge-primary/50 transition-all cursor-pointer hover:transform hover:-translate-y-1 group feature-card" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg bg-forge-${project.color}Light flex items-center justify-center text-xl`}>
                        {project.icon}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${project.health === 'healthy' ? 'bg-green-500' : project.health === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                        <button className="opacity-0 group-hover:opacity-100 transition-opacity text-forge-textMuted hover:text-forge-text">
                          ⋯
                        </button>
                      </div>
                    </div>
                    <div className="font-semibold text-sm mb-1">{project.name}</div>
                    <div className="text-xs text-forge-textMuted mb-2">{project.type}</div>
                    <div className="h-1 bg-forge-surfaceLow rounded-full overflow-hidden">
                      <div className={`h-full bg-forge-${project.color} rounded-full progress-grow`} style={{ width: project.status === 'Active' ? '100%' : '60%' }}></div>
                    </div>
                    <div className="text-xs text-forge-textMuted mt-2">Edited {project.edited}</div>
                    
                    {/* Next Steps Suggestions */}
                    <div className="mt-3 pt-3 border-t border-forge-border">
                      <div className="text-xs text-forge-textMuted mb-2">Suggested next steps:</div>
                      <div className="space-y-1">
                        {getNextSteps(project).slice(0, 2).map((step, stepIndex) => (
                          <div key={stepIndex} className="flex items-center gap-1 text-xs text-forge-textMuted">
                            <span>{step.icon}</span>
                            <span className="truncate">{step.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="text-lg font-display font-semibold mb-4">QUICK ACTIONS</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div 
                  onClick={() => setCurrentPage('chat')}
                  className="bg-forge-surface border border-forge-border rounded-xl p-4 hover:border-forge-primary/50 transition-all cursor-pointer group feature-card"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-forge-aiLight flex items-center justify-center text-xl group-hover:scale-110 transition-transform">💬</div>
                    <div className="font-semibold text-sm">AI Chat</div>
                  </div>
                  <div className="text-xs text-forge-textMuted">Ask questions, brainstorm, get help</div>
                </div>
                <div 
                  onClick={() => setCurrentPage('studio')}
                  className="bg-forge-surface border border-forge-border rounded-xl p-4 hover:border-forge-primary/50 transition-all cursor-pointer group feature-card"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-forge-techLight flex items-center justify-center text-xl group-hover:scale-110 transition-transform">💻</div>
                    <div className="font-semibold text-sm">New Studio</div>
                  </div>
                  <div className="text-xs text-forge-textMuted">Build with live preview and files</div>
                </div>
                <div 
                  onClick={() => setCurrentPage('image')}
                  className="bg-forge-surface border border-forge-border rounded-xl p-4 hover:border-forge-primary/50 transition-all cursor-pointer group feature-card"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-forge-primaryLight flex items-center justify-center text-xl group-hover:scale-110 transition-transform">🎨</div>
                    <div className="font-semibold text-sm">Image Generator</div>
                  </div>
                  <div className="text-xs text-forge-textMuted">Create stunning AI images</div>
                </div>
                <div className="bg-forge-surface border border-forge-border rounded-xl p-4 hover:border-forge-primary/50 transition-all cursor-pointer group feature-card">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-forge-successLight flex items-center justify-center text-xl group-hover:scale-110 transition-transform">📋</div>
                    <div className="font-semibold text-sm">Templates</div>
                  </div>
                  <div className="text-xs text-forge-textMuted">Start from ready-made templates</div>
                </div>
              </div>
            </div>

            {/* Promotional Banner */}
            <div className="bg-gradient-to-r from-forge-primary/20 to-forge-ai/20 border border-forge-primary/30 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-forge-primary/20 rounded-full blur-2xl"></div>
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display font-semibold text-lg mb-1">AI + Human Imagination</h3>
                  <p className="text-sm text-forge-textMuted">Combine your creativity with Vux AI Studio assistance to build extraordinary software</p>
                </div>
                <button className="px-4 py-2 bg-forge-primary text-black font-medium rounded-lg hover:bg-forge-primaryHover transition-all whitespace-nowrap">
                  Learn More
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar - 1 col */}
          <div className="space-y-6">
            {/* AI Activity */}
            <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold">AI ACTIVITY</h2>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-forge-success animate-pulse"></div>
                  <span className="text-xs text-forge-success">Live</span>
                </div>
              </div>
              <div className="space-y-3">
                {aiActivities.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3 pb-3 border-b border-forge-border last:border-0 last:pb-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                      activity.status === 'processing' ? 'bg-forge-primaryLight text-forge-primary animate-pulse' : 
                      activity.status === 'complete' ? 'bg-forge-successLight text-forge-success' : 'bg-forge-surfaceLow text-forge-textDim'
                    }`}>
                      {activity.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">{activity.task}</div>
                      <div className="text-xs text-forge-textMuted">{activity.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily Insight */}
            <div className="bg-gradient-to-br from-forge-surface to-forge-surfaceHigh border border-forge-border rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-forge-ai/10 rounded-full blur-2xl"></div>
              <div className="relative z-10">
                <h2 className="text-lg font-display font-semibold mb-3">DAILY INSIGHT</h2>
                <p className="text-sm text-forge-textMuted italic mb-3 min-h-[60px]">
                  "{displayedInsight}{isTyping && <span className="daily-insight-cursor"></span>}"
                </p>
                <div className="text-xs text-forge-textMuted">— Vux AI Studio Philosophy</div>
              </div>
            </div>

            {/* Shortcuts */}
            <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
              <h2 className="text-lg font-display font-semibold mb-3">SHORTCUTS</h2>
              <div className="space-y-2">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{shortcut.icon}</span>
                      <span className="text-forge-textMuted">{shortcut.key}</span>
                    </div>
                    <span className="text-xs text-forge-textDim border border-forge-border px-2 py-1 rounded">{shortcut.shortcut}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold">Create New Project</h2>
              <button 
                onClick={() => setShowNewProjectModal(false)}
                className="w-8 h-8 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {projectTemplates.map((template) => (
                <button
                  key={template.type}
                  onClick={() => {
                    setShowNewProjectModal(false)
                    setCurrentPage('studio')
                  }}
                  className="p-4 bg-forge-surfaceLow border border-forge-border rounded-xl hover:border-forge-primary/50 transition-all group"
                >
                  <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{template.icon}</div>
                  <div className="font-semibold text-sm mb-1">{template.name}</div>
                  <div className="text-xs text-forge-textMuted">{template.description}</div>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-forge-border">
              <div className="text-sm text-forge-textMuted mb-4">Or choose from your recent templates</div>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh">
                  Import from GitHub
                </button>
                <button className="px-4 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh">
                  Open Local Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status Bar */}
      <footer className="hidden lg:flex fixed bottom-0 left-0 lg:left-64 right-0 bg-forge-surface border-t border-forge-border px-4 lg:px-8 py-3 items-center justify-between text-xs text-forge-textMuted">
        <div className="flex items-center gap-4 lg:gap-6">
          <span>CPU: 12%</span>
          <span>RAM: 4.2GB</span>
          <span>AI Model: Vux AI Studio</span>
          <span>Storage: 45GB</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-forge-success"></div>
            <span>Connected</span>
          </div>
          <span>v2.4.0</span>
        </div>
      </footer>
    </div>
  )
}