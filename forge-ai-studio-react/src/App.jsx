import { useState, useEffect } from 'react'
import { Landing, Home, HomeController, Chat, Studio, Image, Object3D, Settings, Help, Username, Terms } from './pages'
import './index.css'

const PAGE_PATHS = {
  landing: '/',
  home: '/home',
  'home-controller': '/home-controller',
  chat: '/chat',
  studio: '/studio',
  image: '/image-generator',
  object3d: '/3d-object-generator',
  settings: '/settings',
  help: '/help',
  username: '/login',
  terms: '/terms',
}

const PATH_PAGES = {
  '/home': 'home',
  '/home-controller': 'home-controller',
  '/chat': 'chat',
  '/studio': 'studio',
  '/image-generator': 'image',
  '/image': 'image',
  '/3d-object-generator': 'object3d',
  '/object3d': 'object3d',
  '/settings': 'settings',
  '/help': 'help',
  '/login': 'username',
  '/terms': 'terms',
}

function pageFromPath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase() || '/'
  return PATH_PAGES[normalizedPath] || null
}

function App() {
  const [currentPage, setCurrentPageState] = useState(() => {
    const pathPage = pageFromPath(window.location.pathname)
    if (pathPage) return pathPage
    return localStorage.getItem('vux_onboarded') ? 'home' : 'landing'
  })
  const [username, _setUsername] = useState(localStorage.getItem('vux_username') || 'Developer')
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('vux_onboarded')
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const setCurrentPage = (page) => {
    setCurrentPageState(page)
    const path = PAGE_PATHS[page]
    if (path && window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      const pathPage = pageFromPath(window.location.pathname)
      setCurrentPageState(pathPage || (isAuthenticated ? 'home' : 'landing'))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isAuthenticated])

  const handleGetStarted = () => {
    setCurrentPage('username')
  }

  const handleTerms = () => {
    setCurrentPage('terms')
  }

  const handleUsernameContinue = (value, vibe) => {
    _setUsername(value)
    localStorage.setItem('vux_username', value)
    localStorage.setItem('vux_vibe', vibe)
    setIsAuthenticated(true)
    setCurrentPage('home')
    localStorage.setItem('vux_onboarded', 'true')
  }

  const renderPage = () => {
    if (!isAuthenticated) {
      if (currentPage === 'username') return <Username onContinue={handleUsernameContinue} />
      if (currentPage === 'terms') return <Terms onBack={() => setCurrentPage('landing')} />
      return <Landing onGetStarted={handleGetStarted} onTerms={handleTerms} />
    }

    switch(currentPage) {
      case 'home': return <Home setCurrentPage={setCurrentPage} username={username} />
      case 'home-controller': return <HomeController setCurrentPage={setCurrentPage} />
      case 'chat': return <Chat setCurrentPage={setCurrentPage} username={username} />
      case 'studio': return <Studio username={username} />
      case 'image': return <Image setCurrentPage={setCurrentPage} username={username} />
      case 'object3d': return <Object3D setCurrentPage={setCurrentPage} username={username} />
      case 'settings': return <Settings setCurrentPage={setCurrentPage} username={username} />
      case 'help': return <Help setCurrentPage={setCurrentPage} username={username} />
      case 'terms': return <Terms onBack={() => setCurrentPage('home')} />
      default: return <Home setCurrentPage={setCurrentPage} username={username} />
    }
  }

  if (!isAuthenticated) return renderPage()

  return (
    <div className="flex min-h-screen bg-forge-bg text-forge-text">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:sticky lg:top-0 lg:h-screen z-50 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${
          mobileMenuOpen ? 'h-screen' : 'lg:h-screen'
        } bg-forge-surface border-r border-forge-border`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-6 border-b border-forge-border">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-primary to-forge-primaryHover flex items-center justify-center flex-shrink-0">
            <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuALV_T9GseCK2UiieoqsTdT4B_LoAWLwWbgIDHwUmVlWfjZlT0tmTk_KW8WYmXmiWUmZB_57mHYoJLYXgPJYGSqPxHAXZnQ9uYlRvo8lrAhetPrH1LSV7vHNclUKFZ3NCahTLeBPyj_sQQQtm1-foEN-1Y0BvfaZcgXsUGxOuWgpJajnSE6GwKc-EYByMDIqtSqIwZBipW8CgOQnWmJY8tO0250A4XGDAFR8cHvvNzzsYLzJ2IkwHdI8p5jL9A_weVLWw" alt="Vux AI Studio logo" className="h-6 w-6 object-contain" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg text-forge-primary tracking-tight">VUX</span>
              <span className="text-xs text-forge-textMuted">AI STUDIO</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto p-4">
          <button
            onClick={() => { setCurrentPage('home'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'home' 
                ? 'bg-forge-primaryLight text-forge-primary border-l-2 border-forge-primary' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Home"
          >
            <span className="text-xl flex-shrink-0">🏠</span>
            {!sidebarCollapsed && <span className="font-medium">Home</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('chat'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'chat' 
                ? 'bg-forge-aiLight text-forge-ai border-l-2 border-forge-ai' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Chat"
          >
            <span className="text-xl flex-shrink-0">💬</span>
            {!sidebarCollapsed && <span className="font-medium">Chat</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('home-controller'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'home-controller'
                ? 'bg-forge-techLight text-forge-tech border-l-2 border-forge-tech'
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Home Controller"
          >
            <span className="text-xl flex-shrink-0">⌁</span>
            {!sidebarCollapsed && <span className="font-medium">Home Controller</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('studio'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'studio' 
                ? 'bg-forge-techLight text-forge-tech border-l-2 border-forge-tech' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Studio"
          >
            <span className="text-xl flex-shrink-0">💻</span>
            {!sidebarCollapsed && <span className="font-medium">Studio</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('image'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'image' 
                ? 'bg-forge-primaryLight text-forge-primary border-l-2 border-forge-primary' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Image Generator"
          >
            <span className="text-xl flex-shrink-0">🎨</span>
            {!sidebarCollapsed && <span className="font-medium">Image Generator</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('object3d'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'object3d' 
                ? 'bg-forge-techLight text-forge-tech border-l-2 border-forge-tech' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="3D Objects"
          >
            <span className="text-xl flex-shrink-0">🎲</span>
            {!sidebarCollapsed && <span className="font-medium">3D Objects</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('settings'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'settings' 
                ? 'bg-forge-surfaceHigh text-forge-text border-l-2 border-forge-borderActive' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Settings"
          >
            <span className="text-xl flex-shrink-0">⚙️</span>
            {!sidebarCollapsed && <span className="font-medium">Settings</span>}
          </button>
          <button
            onClick={() => { setCurrentPage('help'); setMobileMenuOpen(false); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentPage === 'help' 
                ? 'bg-forge-surfaceHigh text-forge-text border-l-2 border-forge-borderActive' 
                : 'text-forge-textMuted hover:bg-forge-surfaceLow'
            }`}
            title="Help"
          >
            <span className="text-xl flex-shrink-0">❓</span>
            {!sidebarCollapsed && <span className="font-medium">Help</span>}
          </button>
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-forge-border">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-forge-surfaceLow transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-forge-primary to-forge-primaryHover flex items-center justify-center text-white font-bold flex-shrink-0">
              {username.charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{username}</div>
                <div className="text-xs text-forge-textMuted">Developer</div>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full mt-2 px-4 py-2 text-xs text-forge-textMuted hover:text-forge-text hover:bg-forge-surfaceLow rounded-lg transition-all"
          >
            {sidebarCollapsed ? '→' : '← Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 w-10 h-10 rounded-lg bg-forge-surface border border-forge-border flex items-center justify-center"
      >
        ☰
      </button>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-hidden lg:ml-0">
        {renderPage()}
      </main>
    </div>
  )
}

export default App