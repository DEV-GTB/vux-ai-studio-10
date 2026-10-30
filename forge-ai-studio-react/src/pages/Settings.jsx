import { useState, useEffect } from 'react'

export function Settings({ setCurrentPage: _setCurrentPage, username }) {
  const [activeCategory, setActiveCategory] = useState('appearance')
  const [theme, setTheme] = useState('obsidian')
  const [density, setDensity] = useState('comfortable')
  const [animations, setAnimations] = useState(true)
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [autoSave, setAutoSave] = useState(true)
  const [fontSize, setFontSize] = useState(14)

  // Apply theme to document
  useEffect(() => {
    document.body.className = theme === 'light' ? 'theme-light' : theme === 'cyber' ? 'theme-cyber' : theme === 'aurora' ? 'theme-aurora' : ''
  }, [theme])

  const categories = [
    { id: 'appearance', icon: '🎨', title: 'Appearance', desc: 'Theme, colors, fonts' },
    { id: 'editor', icon: '💻', title: 'Editor', desc: 'Font, tab size, behavior' },
    { id: 'ai', icon: '🤖', title: 'AI Behavior', desc: 'Suggestions, context, permissions' },
    { id: 'projects', icon: '📁', title: 'Projects', desc: 'Location, defaults, AI rules' },
    { id: 'terminal', icon: '⌨️', title: 'Terminal', desc: 'Shell, font, behavior' },
    { id: 'account', icon: '👤', title: 'Account', desc: 'Profile, security, sessions' },
  ]

  const themes = [
    { id: 'obsidian', name: 'Obsidian', desc: 'Deep dark with orange accents' },
    { id: 'cyber', name: 'Cyber', desc: 'Dark purple with AI energy' },
    { id: 'aurora', name: 'Aurora', desc: 'Dark blue with cyan highlights' },
    { id: 'light', name: 'Light', desc: 'Clean light theme' },
  ]

  const densities = ['Compact', 'Comfortable', 'Spacious']

  return (
    <div className={`h-[100dvh] flex flex-col lg:flex-row overflow-hidden ${theme === 'light' ? 'theme-light' : theme === 'cyber' ? 'theme-cyber' : theme === 'aurora' ? 'theme-aurora' : ''}`}>
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center">
            ☰
          </button>
          <div>
            <h1 className="text-lg font-display font-semibold">Settings</h1>
            <p className="text-xs text-forge-textMuted">Customize your experience</p>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-forge-primary to-forge-primaryHover flex items-center justify-center text-white font-bold text-sm">
          {username.charAt(0).toUpperCase()}
        </div>
      </header>

      {/* Settings Category Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-forge-border p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold mb-1">SETTINGS</h1>
          <p className="text-sm text-forge-textMuted">Customize your VUX AI experience</p>
        </div>

        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                activeCategory === category.id 
                  ? 'bg-forge-primaryLight text-forge-primary border-l-2 border-forge-primary' 
                  : 'text-forge-textMuted hover:bg-forge-surfaceLow'
              }`}
            >
              <span className="text-xl">{category.icon}</span>
              <div className="text-left">
                <div className="font-medium text-sm">{category.title}</div>
                <div className="text-xs text-forge-textDim">{category.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Mobile Category Selector */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-forge-border bg-forge-surface">
        <button 
          onClick={() => setCategoryPanelOpen(!categoryPanelOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg"
        >
          <span className="text-lg">{categories.find(c => c.id === activeCategory)?.icon}</span>
          <span className="text-sm font-medium">{categories.find(c => c.id === activeCategory)?.title}</span>
          <span>▼</span>
        </button>
      </div>

      {/* Mobile Category Panel */}
      {categoryPanelOpen && (
        <div className="lg:hidden absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCategoryPanelOpen(false)}></div>
          <div className="absolute left-0 top-0 h-full w-64 bg-forge-surface border-r border-forge-border p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Categories</h3>
              <button onClick={() => setCategoryPanelOpen(false)} className="w-8 h-8 rounded-lg bg-forge-surfaceHigh flex items-center justify-center">✕</button>
            </div>
            <div className="space-y-1">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => { setActiveCategory(category.id); setCategoryPanelOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeCategory === category.id 
                      ? 'bg-forge-primaryLight text-forge-primary' 
                      : 'text-forge-textMuted hover:bg-forge-surfaceLow'
                  }`}
                >
                  <span className="text-xl">{category.icon}</span>
                  <div className="font-medium text-sm">{category.title}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Content */}
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {activeCategory === 'appearance' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">Appearance</h2>
            
            {/* Theme Selection */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Theme</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {themes.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`bg-forge-surface border rounded-xl p-4 cursor-pointer transition-all hover:transform hover:-translate-y-1 ${
                      theme === t.id ? 'border-forge-primary ring-2 ring-forge-primary/20' : 'border-forge-border'
                    }`}
                  >
                    <div className={`w-full h-20 rounded-lg mb-3 ${
                      t.id === 'obsidian' ? 'bg-gradient-to-br from-forge-bg to-forge-surfaceHigh' :
                      t.id === 'cyber' ? 'bg-gradient-to-br from-purple-900 to-indigo-900' :
                      t.id === 'aurora' ? 'bg-gradient-to-br from-blue-900 to-cyan-900' :
                      'bg-gradient-to-br from-gray-100 to-gray-200'
                    }`}></div>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-forge-textMuted">{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Accent Color */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Accent Color</h3>
              <div className="flex gap-3">
                {['#FF6A00', '#9B59B6', '#00D4FF', '#27AE60', '#E74C3C'].map((color, index) => (
                  <button
                    key={index}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      color === '#FF6A00' ? 'border-white ring-2 ring-forge-primary/50' : 'border-forge-border'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* UI Density */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">UI Density</h3>
              <div className="flex gap-2">
                {densities.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDensity(d.toLowerCase())}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      density === d.toLowerCase() 
                        ? 'bg-forge-primary text-black font-medium' 
                        : 'bg-forge-surface border border-forge-border text-forge-textMuted hover:bg-forge-surfaceHigh'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Animations */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Animations</h3>
              <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                <div>
                  <div className="font-medium text-sm">Enable animations</div>
                  <div className="text-xs text-forge-textMuted">Animate transitions and effects</div>
                </div>
                <button
                  onClick={() => setAnimations(!animations)}
                  className={`w-12 h-6 rounded-full transition-all ${
                    animations ? 'bg-forge-primary' : 'bg-forge-surfaceHigh'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    animations ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Notifications</h3>
              <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                <div>
                  <div className="font-medium text-sm">Enable notifications</div>
                  <div className="text-xs text-forge-textMuted">Get updates and alerts</div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`w-12 h-6 rounded-full transition-all ${
                    notifications ? 'bg-forge-primary' : 'bg-forge-surfaceHigh'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    notifications ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Auto Save */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Auto Save</h3>
              <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                <div>
                  <div className="font-medium text-sm">Auto save changes</div>
                  <div className="text-xs text-forge-textMuted">Automatically save your work</div>
                </div>
                <button
                  onClick={() => setAutoSave(!autoSave)}
                  className={`w-12 h-6 rounded-full transition-all ${
                    autoSave ? 'bg-forge-primary' : 'bg-forge-surfaceHigh'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    autoSave ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="mb-8">
              <h3 className="font-medium mb-4">Font Size</h3>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="12"
                  max="20"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-8">{fontSize}px</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setTheme('obsidian')
                  setDensity('comfortable')
                  setAnimations(true)
                  setNotifications(true)
                  setAutoSave(true)
                  setFontSize(14)
                }}
                className="px-4 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
              >
                Reset All Settings
              </button>
              <button 
                onClick={() => alert('Settings exported successfully!')}
                className="px-4 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
              >
                Export Settings
              </button>
            </div>
          </div>
        )}

        {activeCategory === 'editor' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">Editor Settings</h2>
            
            <div className="mb-8">
              <h3 className="font-medium mb-4">Font Family</h3>
              <div className="grid grid-cols-2 gap-4">
                {['Inter', 'JetBrains Mono', 'Fira Code', 'Roboto Mono'].map((font) => (
                  <button
                    key={font}
                    className="px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">Tab Size</h3>
              <div className="flex gap-2">
                {[2, 4, 8].map((size) => (
                  <button
                    key={size}
                    className="px-4 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                  >
                    {size} spaces
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">Editor Behavior</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                  <div>
                    <div className="font-medium text-sm">Word Wrap</div>
                    <div className="text-xs text-forge-textMuted">Wrap long lines</div>
                  </div>
                  <button className="w-12 h-6 rounded-full bg-forge-primary transition-all">
                    <div className="w-5 h-5 rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                  <div>
                    <div className="font-medium text-sm">Line Numbers</div>
                    <div className="text-xs text-forge-textMuted">Show line numbers</div>
                  </div>
                  <button className="w-12 h-6 rounded-full bg-forge-primary transition-all">
                    <div className="w-5 h-5 rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'ai' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">AI Behavior Settings</h2>
            
            <div className="mb-8">
              <h3 className="font-medium mb-4">Response Style</h3>
              <div className="grid grid-cols-2 gap-4">
                {['Concise', 'Detailed', 'Creative', 'Technical'].map((style) => (
                  <button
                    key={style}
                    className="px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">AI Features</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                  <div>
                    <div className="font-medium text-sm">Code Suggestions</div>
                    <div className="text-xs text-forge-textMuted">Get intelligent code completions</div>
                  </div>
                  <button className="w-12 h-6 rounded-full bg-forge-primary transition-all">
                    <div className="w-5 h-5 rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                  <div>
                    <div className="font-medium text-sm">Error Detection</div>
                    <div className="text-xs text-forge-textMuted">Automatically detect and fix errors</div>
                  </div>
                  <button className="w-12 h-6 rounded-full bg-forge-primary transition-all">
                    <div className="w-5 h-5 rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'projects' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">Project Settings</h2>
            
            <div className="mb-8">
              <h3 className="font-medium mb-4">Default Project Location</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value="C:/Users/Projects"
                  className="flex-1 bg-forge-surfaceLow border border-forge-border rounded-lg px-4 py-2 text-sm"
                  readOnly
                />
                <button className="px-4 py-2 bg-forge-primary text-black rounded-lg text-sm">
                  Browse
                </button>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">Project Templates</h3>
              <div className="grid grid-cols-2 gap-4">
                {['React', 'Python', 'Node.js', 'TypeScript'].map((template) => (
                  <button
                    key={template}
                    className="px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'terminal' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">Terminal Settings</h2>
            
            <div className="mb-8">
              <h3 className="font-medium mb-4">Shell</h3>
              <div className="grid grid-cols-2 gap-4">
                {['PowerShell', 'CMD', 'Git Bash', 'WSL'].map((shell) => (
                  <button
                    key={shell}
                    className="px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all"
                  >
                    {shell}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">Terminal Behavior</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-forge-surface border border-forge-border rounded-lg p-4">
                  <div>
                    <div className="font-medium text-sm">Auto-scroll</div>
                    <div className="text-xs text-forge-textMuted">Scroll to bottom on output</div>
                  </div>
                  <button className="w-12 h-6 rounded-full bg-forge-primary transition-all">
                    <div className="w-5 h-5 rounded-full bg-white transition-transform translate-x-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeCategory === 'account' && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-display font-semibold mb-6">Account Settings</h2>
            
            <div className="mb-8">
              <h3 className="font-medium mb-4">Profile</h3>
              <div className="bg-forge-surface border border-forge-border rounded-xl p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-white font-bold text-2xl">
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-lg">{username}</div>
                    <div className="text-sm text-forge-textMuted">Developer</div>
                  </div>
                </div>
                <button className="px-4 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all">
                  Edit Profile
                </button>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-medium mb-4">Security</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all text-left">
                  Change Password
                </button>
                <button className="w-full px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all text-left">
                  Two-Factor Authentication
                </button>
                <button className="w-full px-4 py-3 bg-forge-surface border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all text-left">
                  Active Sessions
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Preview Panel - Desktop */}
      <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-forge-border p-4">
        <h3 className="font-display font-semibold mb-4">PREVIEW</h3>
        
        <div className="bg-forge-surface border border-forge-border rounded-xl overflow-hidden mb-4">
          <div className="h-40 bg-gradient-to-br from-forge-bg to-forge-surfaceHigh flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-2 rounded-lg bg-forge-primary/20 flex items-center justify-center">
                <span className="text-3xl">⚡</span>
              </div>
              <div className="text-sm font-medium">VUX AI</div>
            </div>
          </div>
          <div className="p-4">
            <div className="text-sm font-medium mb-1">{themes.find(t => t.id === theme)?.name}</div>
            <div className="text-xs text-forge-textMuted mb-3">{themes.find(t => t.id === theme)?.desc}</div>
            <button className="w-full px-4 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all">
              Preview in Studio
            </button>
          </div>
        </div>

        <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">ABOUT VUX AI</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-forge-textMuted">Version</span>
              <span>2.4.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-forge-textMuted">Build</span>
              <span>2024.08.27</span>
            </div>
            <div className="flex justify-between">
              <span className="text-forge-textMuted">Engine</span>
              <span>VUX AI</span>
            </div>
            <div className="flex justify-between">
              <span className="text-forge-textMuted">License</span>
              <span>MIT</span>
            </div>
          </div>
          <button className="w-full mt-4 px-4 py-2 bg-forge-surfaceLow border border-forge-border rounded-lg text-sm hover:bg-forge-surfaceHigh transition-all">
            Check for Updates
          </button>
        </div>

        <div className="mt-4 bg-gradient-to-r from-forge-primary/20 to-forge-ai/20 border border-forge-primary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-forge-primary">✓</span>
            <span className="text-sm font-medium">Settings synced</span>
          </div>
          <p className="text-xs text-forge-textMuted">
            Changes are saved automatically and synced across your devices.
          </p>
        </div>
      </aside>
    </div>
  )
}