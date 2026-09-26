import { useEffect, useMemo, useState, useRef } from 'react'
import Editor from '@monaco-editor/react'

// Custom Monaco theme to match our dark color scheme
const forgeDarkTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', background: '0b1326', foreground: 'dae2fd' },
    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c084fc' },
    { token: 'string', foreground: '34d399' },
    { token: 'number', foreground: 'f472b6' },
    { token: 'type', foreground: '60a5fa' },
    { token: 'function', foreground: 'fbbf24' },
    { token: 'variable', foreground: 'dae2fd' },
  ],
  colors: {
    'editor.background': '#0b1326',
    'editor.foreground': '#dae2fd',
    'editor.lineHighlightBackground': '#1a1f2e',
    'editorCursor.foreground': '#60a5fa',
    'editor.selectionBackground': '#374151',
    'editor.inactiveSelectionBackground': '#1f2937',
    'editorLineNumber.foreground': '#6b7280',
    'editorLineNumber.activeForeground': '#dae2fd',
    'editorIndentGuide.background': '#1f2937',
    'editorIndentGuide.activeBackground': '#374151',
  }
}

const starterFiles = {
  'index.html': '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>New Vux Project</title>\n  </head>\n  <body>\n    <main>\n      <h1>Build something remarkable.</h1>\n      <p>Edit this file, then open Preview.</p>\n    </main>\n  </body>\n</html>',
  'style.css': 'body {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  font-family: system-ui, sans-serif;\n  background: #0b1326;\n  color: #dae2fd;\n}\nmain { max-width: 42rem; padding: 3rem; }',
  'app.js': 'console.log("Vux AI Studio initialized");\n\nfunction init() {\n  console.log("App started");\n}\n\ninit();',
}

function fileLanguage(name) {
  if (name.endsWith('.html')) return 'HTML'
  if (name.endsWith('.css')) return 'CSS'
  if (name.endsWith('.js') || name.endsWith('.jsx')) return 'JavaScript'
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'TypeScript'
  if (name.endsWith('.py')) return 'Python'
  if (name.endsWith('.json')) return 'JSON'
  if (name.endsWith('.md')) return 'Markdown'
  if (name.endsWith('.xml')) return 'XML'
  if (name.endsWith('.svg')) return 'SVG'
  return 'Plain Text'
}

function getMonacoLanguage(name) {
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html'
  if (name.endsWith('.css')) return 'css'
  if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript'
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript'
  if (name.endsWith('.py')) return 'python'
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.md')) return 'markdown'
  if (name.endsWith('.xml')) return 'xml'
  if (name.endsWith('.svg')) return 'xml'
  if (name.endsWith('.sql')) return 'sql'
  if (name.endsWith('.java')) return 'java'
  if (name.endsWith('.c') || name.endsWith('.cpp') || name.endsWith('.cc') || name.endsWith('.cxx') || name.endsWith('.h') || name.endsWith('.hpp')) return 'cpp'
  if (name.endsWith('.cs')) return 'csharp'
  if (name.endsWith('.php')) return 'php'
  if (name.endsWith('.rb')) return 'ruby'
  if (name.endsWith('.go')) return 'go'
  if (name.endsWith('.rs')) return 'rust'
  if (name.endsWith('.swift')) return 'swift'
  if (name.endsWith('.kt') || name.endsWith('.kts')) return 'kotlin'
  if (name.endsWith('.scala')) return 'scala'
  if (name.endsWith('.sh') || name.endsWith('.bash')) return 'shell'
  if (name.endsWith('.ps1')) return 'powershell'
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml'
  if (name.endsWith('.toml')) return 'toml'
  if (name.endsWith('.ini')) return 'ini'
  if (name.endsWith('.dockerfile')) return 'dockerfile'
  if (name.endsWith('.vue')) return 'vue'
  if (name.endsWith('.svelte')) return 'svelte'
  return 'plaintext'
}

function getFileIcon(name) {
  if (name.endsWith('.html')) return '🌐'
  if (name.endsWith('.css')) return '🎨'
  if (name.endsWith('.js') || name.endsWith('.jsx')) return '📜'
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return '📘'
  if (name.endsWith('.py')) return '🐍'
  if (name.endsWith('.json')) return '📋'
  if (name.endsWith('.md')) return '📝'
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return '🖼️'
  return '📄'
}

function extractCode(text) {
  const match = String(text || '').match(/```(?:[\w#+.-]+)?\s*([\s\S]*?)```/)
  return match ? match[1].trim() : String(text || '').trim()
}

// Activity bar items
const activityBarItems = [
  { id: 'explorer', icon: '📁', label: 'Explorer' },
  { id: 'search', icon: '🔎', label: 'Search' },
  { id: 'git', icon: '🌿', label: 'Source Control' },
  { id: 'debug', icon: '▶️', label: 'Run & Debug' },
  { id: 'deploy', icon: '🚀', label: 'Deploy' },
  { id: 'extensions', icon: '🧩', label: 'Extensions' },
  { id: 'ai', icon: '🤖', label: 'AI Assistant' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

// Bottom panel tabs
const bottomPanelTabs = [
  { id: 'terminal', icon: '💻', label: 'Terminal' },
  { id: 'output', icon: '📤', label: 'Output' },
  { id: 'problems', icon: '⚠️', label: 'Problems' },
  { id: 'test', icon: '🧪', label: 'Test' },
  { id: 'debug', icon: '🐛', label: 'Debug Console' },
]

export function Studio({ username }) {
  // Layout state
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [activeActivity, setActiveActivity] = useState('explorer')
  const [bottomPanelVisible, setBottomPanelVisible] = useState(true)
  const [activeBottomPanel, setActiveBottomPanel] = useState('terminal')
  const [previewVisible, setPreviewVisible] = useState(false)
  const [aiPanelVisible, setAiPanelVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Project state
  const [projects, setProjects] = useState([{ name: 'Untitled project', files: starterFiles }])
  const [projectIndex, setProjectIndex] = useState(0)
  const [projectName, setProjectName] = useState('')

  // File state
  const [openTabs, setOpenTabs] = useState(['index.html'])
  const [activeTab, setActiveTab] = useState('index.html')
  const [draft, setDraft] = useState(starterFiles['index.html'])
  const [newFileName, setNewFileName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFileInput, setShowNewFileInput] = useState(false)
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)

  // AI state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [isAiWorking, setIsAiWorking] = useState(false)

  // Terminal state
  const [terminalHistory, setTerminalHistory] = useState([
    { type: 'info', text: 'Vux AI Studio Terminal' },
    { type: 'info', text: 'Type "help" for available commands' },
  ])
  const [terminalInput, setTerminalInput] = useState('')
  const terminalRef = useRef(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Test state
  const [testResults, setTestResults] = useState([])
  const [isRunningTests, setIsRunningTests] = useState(false)

  // Deployment state
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [deployPlatform, setDeployPlatform] = useState('')
  const [isDeploying, setIsDeploying] = useState(false)

  // Command Palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('')
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0)

  // Enhanced Search state
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchReplaceQuery, setSearchReplaceQuery] = useState({ search: '', replace: '', useRegex: false, caseSensitive: false })
  const [searchReplaceResults, setSearchReplaceResults] = useState([])

  // Advanced Tab Management state
  const [pinnedTabs, setPinnedTabs] = useState([])
  const [tabContextMenu, setTabContextMenu] = useState(null)

  // Preview state
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewDevice, setPreviewDevice] = useState('desktop')

  // Editor settings
  const [editorTheme, setEditorTheme] = useState('forge-dark')
  const [editorFontSize, setEditorFontSize] = useState(14)
  const [editorTabSize, setEditorTabSize] = useState(2)
  const [editorWordWrap, setEditorWordWrap] = useState('off')
  const [editorMinimap, setEditorMinimap] = useState(true)
  const [monaco, setMonaco] = useState(null)

  // Register custom theme and configure Monaco when it loads
  const handleEditorDidMount = (editor, monaco) => {
    setMonaco(monaco)
    monaco.editor.defineTheme('forge-dark', forgeDarkTheme)
    monaco.editor.setTheme('forge-dark')

    // Configure JavaScript autocomplete
    monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = [
          {
            label: 'console.log',
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: 'Log output to console',
            insertText: 'console.log(${1:message})',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'function',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a function',
            insertText: [
              'function ${1:functionName}(${2:params}) {',
              '\t${3:// body}',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'const',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a constant',
            insertText: 'const ${1:name} = ${2:value}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'let',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a variable',
            insertText: 'let ${1:name} = ${2:value}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'if',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create an if statement',
            insertText: [
              'if (${1:condition}) {',
              '\t${2:// code}',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'for',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a for loop',
            insertText: [
              'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {',
              '\t${3:// code}',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'async/await',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create async function',
            insertText: [
              'async function ${1:functionName}(${2:params}) {',
              '\tconst result = await ${3:promise}',
              '\treturn result',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'try/catch',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create try-catch block',
            insertText: [
              'try {',
              '\t${1:// code}',
              '} catch (${2:error}) {',
              '\t${3:// handle error}',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          }
        ]

        return { suggestions }
      }
    })

    // Configure HTML autocomplete
    monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = [
          {
            label: 'div',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a div element',
            insertText: '<div class="${1:className}">${2:content}</div>',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'button',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a button element',
            insertText: '<button type="${1:button}" class="${2:className}">${3:Click me}</button>',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'input',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create an input element',
            insertText: '<input type="${1:text}" name="${2:name}" placeholder="${3:placeholder}" />',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'script',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a script tag',
            insertText: '<script src="${1:script.js}"></script>',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'link',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a link tag',
            insertText: '<link rel="stylesheet" href="${1:style.css}" />',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          }
        ]

        return { suggestions }
      }
    })

    // Configure CSS autocomplete
    monaco.languages.registerCompletionItemProvider('css', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = [
          {
            label: 'display',
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: 'Controls the display type',
            insertText: 'display: ${1:flex}',
            range: range
          },
          {
            label: 'flex',
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: 'Flexbox container',
            insertText: [
              'display: flex;',
              'flex-direction: ${1:row};',
              'justify-content: ${2:center};',
              'align-items: ${3:center};'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'grid',
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: 'Grid container',
            insertText: [
              'display: grid;',
              'grid-template-columns: ${1:repeat(auto-fit, minmax(200px, 1fr))};',
              'gap: ${2:1rem};'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'margin',
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: 'Set margins',
            insertText: 'margin: ${1:0};',
            range: range
          },
          {
            label: 'padding',
            kind: monaco.languages.CompletionItemKind.Property,
            documentation: 'Set padding',
            insertText: 'padding: ${1:0};',
            range: range
          },
          {
            label: 'media query',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Responsive media query',
            insertText: [
              '@media (max-width: ${1:768px}) {',
              '\t${2:// styles}',
              '}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          }
        ]

        return { suggestions }
      }
    })

    // Configure Python autocomplete
    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = [
          {
            label: 'def',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a function',
            insertText: [
              'def ${1:function_name}(${2:params}):',
              '\t${3:# docstring}',
              '\t${4:pass}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'class',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a class',
            insertText: [
              'class ${1:ClassName}:',
              '\tdef __init__(self, ${2:params}):',
              '\t\t${3:pass}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'if',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create an if statement',
            insertText: [
              'if ${1:condition}:',
              '\t${2:pass}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'for',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create a for loop',
            insertText: [
              'for ${1:item} in ${2:iterable}:',
              '\t${3:pass}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'try/except',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Create try-except block',
            insertText: [
              'try:',
              '\t${1:pass}',
              'except ${2:Exception} as e:',
              '\t${3:pass}'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          {
            label: 'import',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Import module',
            insertText: 'import ${1:module}',
            range: range
          }
        ]

        return { suggestions }
      }
    })

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Save functionality
      console.log('Save triggered')
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      // Find functionality
      console.log('Find triggered')
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Shift | monaco.KeyCode.KeyP, () => {
      // Command palette
      console.log('Command palette triggered')
    })
  }

  // Project intelligence state
  const [projectInfo, setProjectInfo] = useState(null)
  const [projectHealth, setProjectHealth] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [aiPlanMode, setAiPlanMode] = useState(false)
  const [aiPlan, setAiPlan] = useState([])
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const project = projects[projectIndex]
  const fileNames = Object.keys(project.files)
  const canPreview = activeTab.endsWith('.html')

  // Responsive design
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Update draft when active tab changes
  useEffect(() => {
    setDraft(project.files[activeTab] || '')
  }, [activeTab, projectIndex, project.files])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalHistory])

  // Load project intelligence on mount
  useEffect(() => {
    const loadProjectInfo = async () => {
      try {
        const response = await fetch('/api/project/info')
        const data = await response.json()
        setProjectInfo(data)
        setProjectHealth(data.health)
      } catch (error) {
        console.error('Failed to load project info:', error)
      }
    }
    loadProjectInfo()
  }, [])

  // Save history for undo/redo
  const saveToHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({
      files: JSON.parse(JSON.stringify(project.files)),
      timestamp: new Date().toISOString()
    })
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const updateDraft = (value) => {
    setDraft(value)
    setProjects((current) => current.map((item, index) => (
      index === projectIndex ? { ...item, files: { ...item.files, [activeTab]: value } } : item
    )))
  }

  const undo = () => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1]
      setProjects((current) => current.map((item, index) => (
        index === projectIndex ? { ...item, files: JSON.parse(JSON.stringify(previousState.files)) } : item
      )))
      setHistoryIndex(historyIndex - 1)
      setDraft(project.files[activeTab] || '')
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1]
      setProjects((current) => current.map((item, index) => (
        index === projectIndex ? { ...item, files: JSON.parse(JSON.stringify(nextState.files)) } : item
      )))
      setHistoryIndex(historyIndex + 1)
      setDraft(project.files[activeTab] || '')
    }
  }

  const runProject = async () => {
    if (!projectInfo?.runCommand) {
      setTerminalHistory(prev => [...prev, { type: 'error', text: 'No run command detected for this project type' }])
      return
    }

    try {
      setIsRunning(true)
      setTerminalHistory(prev => [...prev, { type: 'info', text: `Starting project with: ${projectInfo.runCommand}` }])
      
      const response = await fetch('/api/project/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: projectInfo.runCommand }),
      })

      const data = await response.json()
      if (response.ok) {
        setTerminalHistory(prev => [...prev, { type: 'success', text: data.message || 'Project started successfully' }])
      } else {
        setTerminalHistory(prev => [...prev, { type: 'error', text: data.error || 'Failed to start project' }])
      }
    } catch (error) {
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Error: ${error.message}` }])
    } finally {
      setIsRunning(false)
    }
  }

  const fixProject = async () => {
    if (!projectHealth?.issues?.length && !projectHealth?.warnings?.length) {
      setTerminalHistory(prev => [...prev, { type: 'info', text: 'No issues detected to fix' }])
      return
    }

    try {
      const allIssues = [...projectHealth.issues, ...projectHealth.warnings]
      const response = await fetch('/api/project/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues: allIssues }),
      })

      const data = await response.json()
      if (response.ok) {
        setTerminalHistory(prev => [...prev, { type: 'success', text: data.message || 'Issues fixed successfully' }])
        // Reload project health
        const healthResponse = await fetch('/api/project/info')
        const healthData = await healthResponse.json()
        setProjectHealth(healthData.health)
      } else {
        setTerminalHistory(prev => [...prev, { type: 'error', text: data.error || 'Failed to fix issues' }])
      }
    } catch (error) {
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Error: ${error.message}` }])
    }
  }

  const generateAiPlan = async () => {
    if (!aiPrompt.trim()) return

    setIsAiWorking(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { 
              role: 'user', 
              content: `I need to: ${aiPrompt}\n\nCurrent project context:\n- Files: ${fileNames.join(', ')}\n- Active file: ${activeTab}\n- Project type: ${projectInfo?.type || 'unknown'}\n\nPlease create a step-by-step plan to accomplish this. Return the plan as a numbered list of specific, actionable steps. Each step should indicate which file to modify and what to do.`
            }
          ],
        }),
      })

      const data = await response.json()
      if (response.ok) {
        // Parse the plan into steps
        const planText = data.text || ''
        const steps = planText.split(/\n\d+\.|\n-|\n\*/).filter(step => step.trim()).map((step, index) => ({
          id: index + 1,
          text: step.trim(),
          completed: false
        }))
        setAiPlan(steps)
        setAiPlanMode(true)
      } else {
        setAiReply(`Error: ${data.error || 'Failed to generate plan'}`)
      }
    } catch (error) {
      setAiReply(`Error: ${error.message}`)
    } finally {
      setIsAiWorking(false)
    }
  }

  const executeAiPlan = async () => {
    for (const step of aiPlan) {
      if (step.completed) continue

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { 
                role: 'user', 
                content: `Execute this step: ${step.text}\n\nCurrent file content:\n${draft}\n\nReturn only the complete updated file content in a code block. No explanation.`
              }
            ],
          }),
        })

        const data = await response.json()
        if (response.ok) {
          const code = extractCode(data.text)
          updateDraft(code)
          setAiPlan(prev => prev.map(s => s.id === step.id ? { ...s, completed: true } : s))
        } else {
          setTerminalHistory(prev => [...prev, { type: 'error', text: `Step ${step.id} failed: ${data.error}` }])
        }
      } catch (error) {
        setTerminalHistory(prev => [...prev, { type: 'error', text: `Step ${step.id} error: ${error.message}` }])
      }
    }
    setAiPlanMode(false)
    setAiPlan([])
  }

  const runTests = async () => {
    if (!projectInfo?.testCommand) {
      setTestResults([{ name: 'No tests configured', status: 'skipped', output: 'No test command found for this project type' }])
      return
    }

    setIsRunningTests(true)
    setTestResults([])

    try {
      setTerminalHistory(prev => [...prev, { type: 'info', text: `Running tests with: ${projectInfo.testCommand}` }])
      
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: projectInfo.testCommand, projectPath: project.name }),
      })

      const data = await response.json()
      if (response.ok) {
        // Parse test results from output
        const output = data.output || ''
        const tests = []
        
        // Simple parsing for common test formats
        if (output.includes('PASS') || output.includes('FAIL') || output.includes('✓') || output.includes('✕')) {
          const lines = output.split('\n')
          lines.forEach(line => {
            if (line.includes('PASS') || line.includes('✓')) {
              tests.push({ name: line.replace(/PASS|✓/g, '').trim(), status: 'passed', output: line })
            } else if (line.includes('FAIL') || line.includes('✕')) {
              tests.push({ name: line.replace(/FAIL|✕/g, '').trim(), status: 'failed', output: line })
            }
          })
        }
        
        if (tests.length === 0) {
          tests.push({ name: 'Test execution', status: output.includes('error') ? 'failed' : 'passed', output: output || 'Tests completed' })
        }
        
        setTestResults(tests)
        setTerminalHistory(prev => [...prev, { type: 'success', text: `Tests completed: ${tests.filter(t => t.status === 'passed').length}/${tests.length} passed` }])
      } else {
        setTestResults([{ name: 'Test execution', status: 'failed', output: data.error || 'Failed to run tests' }])
        setTerminalHistory(prev => [...prev, { type: 'error', text: data.error || 'Failed to run tests' }])
      }
    } catch (error) {
      setTestResults([{ name: 'Test execution', status: 'failed', output: error.message }])
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Error: ${error.message}` }])
    } finally {
      setIsRunningTests(false)
    }
  }

  const createProject = () => {
    const name = projectName.trim() || `Untitled project ${projects.length + 1}`
    setProjects((current) => [...current, { name, files: {} }])
    setProjectIndex(projects.length)
    setActiveTab('')
    setDraft('')
    setOpenTabs([])
    setProjectName('')
  }

  const openFile = (fileName) => {
    if (!openTabs.includes(fileName)) {
      setOpenTabs([...openTabs, fileName])
    }
    setActiveTab(fileName)
  }

  const closeTab = (fileName, event) => {
    event.stopPropagation()
    const newTabs = openTabs.filter(tab => tab !== fileName)
    setOpenTabs(newTabs)
    if (activeTab === fileName) {
      setActiveTab(newTabs[newTabs.length - 1] || '')
    }
  }

  const addFile = () => {
    const name = newFileName.trim()
    if (!name || project.files[name] !== undefined) return
    setProjects((current) => current.map((item, index) => (
      index === projectIndex ? { ...item, files: { ...item.files, [name]: '' } } : item
    )))
    openFile(name)
    setNewFileName('')
    setShowNewFileInput(false)
  }

  const deleteFile = (fileName) => {
    if (confirm(`Delete ${fileName}?`)) {
      setProjects((current) => current.map((item, index) => (
        index === projectIndex ? { ...item, files: Object.fromEntries(Object.entries(item.files).filter(([key]) => key !== fileName)) } : item
      )))
      closeTab(fileName, { stopPropagation: () => {} })
    }
  }

  const renameFile = (oldName) => {
    const newName = prompt('Enter new name:', oldName)
    if (newName && newName !== oldName && !project.files[newName]) {
      setProjects((current) => current.map((item, index) => {
        if (index !== projectIndex) return item
        const { [oldName]: value, ...rest } = item.files
        return { ...item, files: { ...rest, [newName]: value } }
      }))
      if (activeTab === oldName) {
        setActiveTab(newName)
      }
      setOpenTabs(openTabs.map(tab => tab === oldName ? newName : tab))
    }
  }

  const openPreview = () => {
    if (!canPreview) return
    const html = draft.includes('<link') ? draft : draft.replace('</head>', `<style>${project.files['style.css'] || ''}</style></head>`)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setPreviewVisible(true)
  }

  const askAi = async (event) => {
    event.preventDefault()
    if (!aiPrompt.trim() || isAiWorking) return
    setIsAiWorking(true)
    setAiReply('')
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [
          { role: 'user', content: `You are editing ${activeTab || 'a new file'} in project ${project.name}. Current code:\n\n${draft}\n\nRequest: ${aiPrompt}\nReturn the complete updated file in one code block and no explanation.` },
        ] }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI request failed')
      setAiReply(data.text || '')
      setAiPrompt('')
    } catch (error) {
      setAiReply(`AI error: ${error.message}`)
    } finally {
      setIsAiWorking(false)
    }
  }

  const applyAiReply = () => {
    if (!aiReply || aiReply.startsWith('AI error:')) return
    updateDraft(extractCode(aiReply))
  }

  const handleTerminalCommand = async (event) => {
    event.preventDefault()
    if (!terminalInput.trim()) return
    
    const command = terminalInput.trim()
    setTerminalHistory(prev => [...prev, { type: 'command', text: `$ ${command}` }])
    
    // Built-in commands
    if (command === 'help') {
      setTerminalHistory(prev => [...prev, { type: 'info', text: 'Available commands: help, clear, ls, pwd, echo, date, npm, git, node, python, pip' }])
    } else if (command === 'clear') {
      setTerminalHistory([{ type: 'info', text: 'Vux AI Studio Terminal' }])
    } else if (command === 'ls') {
      setTerminalHistory(prev => [...prev, { type: 'info', text: fileNames.join('  ') }])
    } else if (command === 'pwd') {
      setTerminalHistory(prev => [...prev, { type: 'info', text: `/projects/${project.name}` }])
    } else if (command.startsWith('echo ')) {
      setTerminalHistory(prev => [...prev, { type: 'info', text: command.substring(5) }])
    } else if (command === 'date') {
      setTerminalHistory(prev => [...prev, { type: 'info', text: new Date().toString() }])
    } else if (command.startsWith('npm ') || command === 'npm' || command.startsWith('git ') || command === 'git' || 
               command.startsWith('node ') || command === 'node' || command.startsWith('python ') || command === 'python' ||
               command.startsWith('pip ') || command === 'pip' || command.startsWith('npx ') || command.startsWith('yarn ') ||
               command.startsWith('npm run ') || command.startsWith('npm install ') || command.startsWith('npm build ')) {
      // Execute real commands via backend
      try {
        setTerminalHistory(prev => [...prev, { type: 'info', text: 'Executing command...' }])
        const response = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, projectPath: project.name }),
        })
        const data = await response.json()
        if (response.ok) {
          setTerminalHistory(prev => [...prev, { type: 'success', text: data.output || 'Command executed successfully' }])
        } else {
          setTerminalHistory(prev => [...prev, { type: 'error', text: data.error || 'Command failed' }])
        }
      } catch (error) {
        setTerminalHistory(prev => [...prev, { type: 'error', text: `Error: ${error.message}` }])
      }
    } else {
      setTerminalHistory(prev => [...prev, { type: 'error', text: `Command not found: ${command}. Type 'help' for available commands.` }])
    }
    
    setTerminalInput('')
  }

  const handleSearch = (query) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    
    const results = []
    fileNames.forEach(fileName => {
      const content = project.files[fileName] || ''
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            file: fileName,
            line: index + 1,
            content: line.trim(),
          })
        }
      })
    })
    setSearchResults(results)
  }

  const projectSummary = useMemo(() => `${fileNames.length} file${fileNames.length === 1 ? '' : 's'}`, [fileNames])

  // Command Palette commands
  const commands = [
    { id: 'newFile', label: 'New File', shortcut: 'Ctrl+N', action: () => setShowNewFileInput(true) },
    { id: 'newFolder', label: 'New Folder', shortcut: 'Ctrl+Shift+N', action: () => setShowNewFolderInput(true) },
    { id: 'save', label: 'Save File', shortcut: 'Ctrl+S', action: () => console.log('Save') },
    { id: 'saveAll', label: 'Save All Files', shortcut: 'Ctrl+Shift+S', action: () => console.log('Save All') },
    { id: 'closeTab', label: 'Close Editor', shortcut: 'Ctrl+W', action: () => activeTab && closeTab(activeTab, { stopPropagation: () => {} }) },
    { id: 'closeAllTabs', label: 'Close All Editors', shortcut: 'Ctrl+K Ctrl+W', action: () => { setOpenTabs([]); setActiveTab(''); } },
    { id: 'formatDocument', label: 'Format Document', shortcut: 'Shift+Alt+F', action: () => console.log('Format') },
    { id: 'find', label: 'Find', shortcut: 'Ctrl+F', action: () => setShowSearchPanel(true) },
    { id: 'replace', label: 'Find and Replace', shortcut: 'Ctrl+H', action: () => setShowSearchPanel(true) },
    { id: 'toggleSidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => setSidebarVisible(!sidebarVisible) },
    { id: 'toggleTerminal', label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: () => setBottomPanelVisible(!bottomPanelVisible) },
    { id: 'togglePreview', label: 'Toggle Preview', shortcut: 'Ctrl+Shift+V', action: () => setPreviewVisible(!previewVisible) },
    { id: 'runProject', label: 'Run Project', shortcut: 'F5', action: () => runProject() },
    { id: 'debugProject', label: 'Debug Project', shortcut: 'Ctrl+Shift+F5', action: () => console.log('Debug') },
    { id: 'openSettings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => console.log('Settings') },
    { id: 'themeToggle', label: 'Toggle Theme', shortcut: 'Ctrl+Shift+T', action: () => {
      const newTheme = editorTheme === 'forge-dark' ? 'light' : 'forge-dark'
      setEditorTheme(newTheme)
      if (monaco) monaco.editor.setTheme(newTheme)
    }},
    { id: 'fontSizeToggle', label: 'Toggle Font Size', shortcut: 'Ctrl+Shift++', action: () => setEditorFontSize(editorFontSize === 14 ? 16 : 14) },
    { id: 'minimapToggle', label: 'Toggle Minimap', shortcut: 'Ctrl+Shift+M', action: () => setEditorMinimap(!editorMinimap) },
    { id: 'wordWrapToggle', label: 'Toggle Word Wrap', shortcut: 'Alt+Z', action: () => setEditorWordWrap(editorWordWrap === 'off' ? 'on' : 'off') },
  ]

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(commandPaletteQuery.toLowerCase())
  )

  // Execute command palette command
  const executeCommand = (command) => {
    command.action()
    setShowCommandPalette(false)
    setCommandPaletteQuery('')
    setCommandPaletteIndex(0)
  }

  // Enhanced search and replace
  const performSearchReplace = () => {
    const results = []
    const { search, replace, useRegex, caseSensitive } = searchReplaceQuery

    if (!search.trim()) {
      setSearchReplaceResults([])
      return
    }

    fileNames.forEach(fileName => {
      const content = project.files[fileName] || ''
      const lines = content.split('\n')
      const searchRegex = useRegex
        ? new RegExp(search, caseSensitive ? 'g' : 'gi')
        : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')

      lines.forEach((line, index) => {
        if (searchRegex.test(line)) {
          results.push({
            file: fileName,
            line: index + 1,
            content: line.trim(),
            matches: line.match(searchRegex)?.length || 1
          })
        }
      })
    })

    setSearchReplaceResults(results)
  }

  const replaceAll = () => {
    const { search, replace, useRegex, caseSensitive } = searchReplaceQuery

    if (!search.trim()) return

    const updatedFiles = { ...project.files }
    let totalReplacements = 0

    Object.keys(updatedFiles).forEach(fileName => {
      const content = updatedFiles[fileName]
      const searchRegex = useRegex
        ? new RegExp(search, caseSensitive ? 'g' : 'gi')
        : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')

      const matches = content.match(searchRegex)
      if (matches) {
        totalReplacements += matches.length
        updatedFiles[fileName] = content.replace(searchRegex, replace)
      }
    })

    setProjects((current) => current.map((item, index) =>
      index === projectIndex ? { ...item, files: updatedFiles } : item
    ))

    setTerminalHistory(prev => [...prev, { type: 'success', text: `Replaced ${totalReplacements} occurrences` }])
    performSearchReplace()
  }

  // Advanced tab management
  const pinTab = (fileName) => {
    if (pinnedTabs.includes(fileName)) {
      setPinnedTabs(pinnedTabs.filter(tab => tab !== fileName))
    } else {
      setPinnedTabs([...pinnedTabs, fileName])
    }
  }

  const closeOtherTabs = (fileName) => {
    setOpenTabs([fileName])
    setActiveTab(fileName)
  }

  const closeAllTabs = () => {
    setOpenTabs([])
    setActiveTab('')
  }

  // Handle keyboard shortcuts for command palette
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+Shift+P for command palette
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
        event.preventDefault()
        setShowCommandPalette(true)
      }
      // Escape to close command palette
      if (event.key === 'Escape') {
        setShowCommandPalette(false)
        setShowSearchPanel(false)
        setCommandPaletteQuery('')
      }
      // Arrow keys for command palette navigation
      if (showCommandPalette) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setCommandPaletteIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setCommandPaletteIndex(prev => Math.max(prev - 1, 0))
        } else if (event.key === 'Enter') {
          event.preventDefault()
          if (filteredCommands[commandPaletteIndex]) {
            executeCommand(filteredCommands[commandPaletteIndex])
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCommandPalette, commandPaletteIndex, filteredCommands])

  // Mobile menu toggle
  const toggleMobileMenu = () => {
    if (isMobile) {
      setSidebarVisible(!sidebarVisible)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-forge-bg text-forge-text overflow-hidden">
      {/* Top Menu Bar */}
      <header className="flex items-center justify-between px-2 py-1 border-b border-forge-border bg-forge-surface text-xs">
        <div className="flex items-center gap-2">
          <button onClick={toggleMobileMenu} className="lg:hidden p-1 hover:bg-forge-surfaceLow rounded">
            ☰
          </button>
          <span className="font-display font-bold text-forge-primary text-sm">VUX</span>
          <nav className="hidden md:flex items-center gap-1">
            {['File', 'Edit', 'View', 'Go', 'Run', 'Terminal', 'Help'].map(item => (
              <button key={item} className="px-2 py-1 hover:bg-forge-surfaceLow rounded">
                {item}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <select 
            value={projectIndex} 
            onChange={(event) => { 
              const next = Number(event.target.value)
              setProjectIndex(next)
              const firstFile = Object.keys(projects[next].files)[0]
              if (firstFile) {
                setActiveTab(firstFile)
                setOpenTabs([firstFile])
              }
            }} 
            className="bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs"
          >
            {projects.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}
          </select>
          <button onClick={createProject} className="rounded bg-forge-primary px-2 py-1 text-xs font-semibold text-black">+ Project</button>
        </div>
      </header>

      {/* Main IDE Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <div className="flex flex-col items-center py-2 bg-forge-surface border-r border-forge-border w-12 flex-shrink-0">
          {activityBarItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveActivity(item.id)
                if (isMobile) setSidebarVisible(true)
              }}
              className={`p-2 rounded-lg mb-1 text-lg ${activeActivity === item.id ? 'bg-forge-primaryLight text-forge-primary' : 'hover:bg-forge-surfaceLow'}`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setBottomPanelVisible(!bottomPanelVisible)}
            className={`p-2 rounded-lg text-lg ${bottomPanelVisible ? 'bg-forge-techLight text-forge-tech' : 'hover:bg-forge-surfaceLow'}`}
            title="Toggle Bottom Panel"
          >
            {bottomPanelVisible ? '▽' : '△'}
          </button>
        </div>

        {/* Sidebar */}
        {sidebarVisible && (
          <aside className="w-64 bg-forge-surface border-r border-forge-border flex flex-col flex-shrink-0 overflow-hidden">
            {activeActivity === 'explorer' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border">
                  <h2 className="text-xs font-semibold tracking-widest">EXPLORER</h2>
                  <div className="flex gap-1">
                    <button onClick={() => setShowNewFileInput(!showNewFileInput)} className="p-1 hover:bg-forge-surfaceLow rounded text-xs" title="New File">📄</button>
                    <button onClick={() => setShowNewFolderInput(!showNewFolderInput)} className="p-1 hover:bg-forge-surfaceLow rounded text-xs" title="New Folder">📁</button>
                  </div>
                </div>
                
                {showNewFileInput && (
                  <div className="px-3 py-2 border-b border-forge-border">
                    <input
                      value={newFileName}
                      onChange={(event) => setNewFileName(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && addFile()}
                      placeholder="filename.ext"
                      className="w-full bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs"
                      autoFocus
                    />
                  </div>
                )}

                <div className="flex-1 overflow-auto p-2">
                  <div className="mb-2">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-forge-textMuted">
                      <span>📁</span>
                      <span>{project.name}</span>
                    </div>
                  </div>
                  
                  {fileNames.length === 0 && (
                    <p className="text-xs text-forge-textMuted px-2">Empty project. Add a file to begin.</p>
                  )}
                  
                  {fileNames.map(name => (
                    <div
                      key={name}
                      className="flex items-center justify-between px-2 py-1 rounded hover:bg-forge-surfaceLow group"
                    >
                      <button
                        onClick={() => openFile(name)}
                        className={`flex items-center gap-2 text-sm flex-1 text-left ${activeTab === name ? 'bg-forge-primaryLight text-forge-primary' : ''}`}
                      >
                        <span>{getFileIcon(name)}</span>
                        <span className="truncate">{name}</span>
                      </button>
                      <div className="hidden group-hover:flex gap-1">
                        <button onClick={() => renameFile(name)} className="p-1 hover:bg-forge-surfaceLow rounded text-xs" title="Rename">✏️</button>
                        <button onClick={() => deleteFile(name)} className="p-1 hover:bg-forge-surfaceLow rounded text-xs" title="Delete">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeActivity === 'search' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">SEARCH</h2>
                <input
                  value={searchQuery}
                  onChange={(event) => handleSearch(event.target.value)}
                  placeholder="Search in files..."
                  className="w-full bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs mb-3"
                />
                <div className="flex-1 overflow-auto">
                  {searchResults.length === 0 && searchQuery && (
                    <p className="text-xs text-forge-textMuted">No results found</p>
                  )}
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => openFile(result.file)}
                      className="p-2 hover:bg-forge-surfaceLow rounded cursor-pointer mb-1"
                    >
                      <div className="text-xs font-semibold">{result.file}:{result.line}</div>
                      <div className="text-xs text-forge-textMuted truncate">{result.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeActivity === 'git' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">SOURCE CONTROL</h2>
                <p className="text-xs text-forge-textMuted">No git repository found.</p>
                <button className="mt-2 w-full bg-forge-primary text-black px-3 py-2 rounded text-xs font-semibold">
                  Initialize Repository
                </button>
              </div>
            )}

            {activeActivity === 'debug' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">RUN AND DEBUG</h2>
                <button 
                  onClick={runProject}
                  disabled={isRunning || !projectInfo?.runCommand}
                  className="w-full bg-forge-success text-black px-3 py-2 rounded text-xs font-semibold mb-2 disabled:opacity-40"
                >
                  {isRunning ? 'Running...' : '▶ Run Project'}
                </button>
                <button 
                  onClick={fixProject}
                  disabled={!projectHealth?.issues?.length && !projectHealth?.warnings?.length}
                  className="w-full bg-forge-primary text-black px-3 py-2 rounded text-xs font-semibold mb-2 disabled:opacity-40"
                >
                  🔧 Fix Project
                </button>
                <button className="w-full bg-forge-tech text-black px-3 py-2 rounded text-xs font-semibold">
                  🐛 Debug Project
                </button>
                
                {projectHealth && (
                  <div className="mt-4 p-2 bg-forge-surfaceLow rounded">
                    <div className="text-xs font-semibold mb-2">PROJECT HEALTH</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={projectHealth.checks.dependencies ? 'text-green-400' : 'text-red-400'}>
                          {projectHealth.checks.dependencies ? '✓' : '✕'}
                        </span>
                        <span>Dependencies</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={projectHealth.checks.build ? 'text-green-400' : 'text-red-400'}>
                          {projectHealth.checks.build ? '✓' : '✕'}
                        </span>
                        <span>Build Config</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={projectHealth.checks.git ? 'text-green-400' : 'text-yellow-400'}>
                          {projectHealth.checks.git ? '✓' : '⚠'}
                        </span>
                        <span>Git Repository</span>
                      </div>
                    </div>
                    {projectHealth.issues.length > 0 && (
                      <div className="mt-2 text-xs text-red-400">
                        {projectHealth.issues.length} issue(s) detected
                      </div>
                    )}
                    {projectHealth.warnings.length > 0 && (
                      <div className="mt-2 text-xs text-yellow-400">
                        {projectHealth.warnings.length} warning(s)
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeActivity === 'deploy' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">DEPLOYMENT</h2>
                <button 
                  onClick={() => setShowDeployModal(true)}
                  className="w-full bg-forge-primary text-black px-3 py-2 rounded text-xs font-semibold mb-2"
                >
                  🚀 Deploy Project
                </button>
                
                <div className="space-y-2 mt-4">
                  <div className="text-xs font-semibold mb-2">QUICK DEPLOY</div>
                  
                  <button className="w-full p-2 bg-forge-surfaceLow border border-forge-border rounded text-left hover:border-forge-primary/50 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🌐</span>
                      <span className="text-xs font-medium">Vercel</span>
                    </div>
                    <div className="text-xs text-forge-textMuted">Deploy to Vercel platform</div>
                  </button>
                  
                  <button className="w-full p-2 bg-forge-surfaceLow border border-forge-border rounded text-left hover:border-forge-primary/50 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">☁️</span>
                      <span className="text-xs font-medium">Netlify</span>
                    </div>
                    <div className="text-xs text-forge-textMuted">Deploy to Netlify</div>
                  </button>
                  
                  <button className="w-full p-2 bg-forge-surfaceLow border border-forge-border rounded text-left hover:border-forge-primary/50 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🔥</span>
                      <span className="text-xs font-medium">Firebase</span>
                    </div>
                    <div className="text-xs text-forge-textMuted">Deploy to Firebase Hosting</div>
                  </button>
                  
                  <button className="w-full p-2 bg-forge-surfaceLow border border-forge-border rounded text-left hover:border-forge-primary/50 transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🐳</span>
                      <span className="text-xs font-medium">Docker</span>
                    </div>
                    <div className="text-xs text-forge-textMuted">Containerize and deploy</div>
                  </button>
                </div>
                
                <div className="mt-4 p-2 bg-forge-surfaceLow rounded">
                  <div className="text-xs font-semibold mb-2">DEPLOYMENT STATUS</div>
                  <div className="text-xs text-forge-textMuted">No active deployments</div>
                </div>
              </div>
            )}

            {activeActivity === 'extensions' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">EXTENSIONS</h2>
                <input
                  placeholder="Search extensions..."
                  className="w-full bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs mb-3"
                />
                
                <div className="space-y-2">
                  <div className="text-xs font-semibold mb-2">LANGUAGE SUPPORT</div>
                  
                  {[
                    { name: 'Python', icon: '🐍', description: 'Python language support', installed: true },
                    { name: 'TypeScript', icon: '📘', description: 'TypeScript support', installed: true },
                    { name: 'JavaScript', icon: '📜', description: 'JavaScript support', installed: true },
                    { name: 'HTML/CSS', icon: '🌐', description: 'Web technologies', installed: true },
                    { name: 'Rust', icon: '🦀', description: 'Rust language support', installed: false },
                    { name: 'Go', icon: '🔵', description: 'Go language support', installed: false },
                    { name: 'Java', icon: '☕', description: 'Java language support', installed: false },
                    { name: 'C++', icon: '⚙️', description: 'C++ language support', installed: false },
                  ].map((ext, index) => (
                    <div key={index} className="p-2 bg-forge-surfaceLow rounded hover:bg-forge-surfaceHigh transition-all cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{ext.icon}</span>
                          <div>
                            <div className="text-xs font-semibold">{ext.name}</div>
                            <div className="text-xs text-forge-textMuted">{ext.description}</div>
                          </div>
                        </div>
                        <button className={`text-xs px-2 py-1 rounded ${ext.installed ? 'bg-green-500/20 text-green-400' : 'bg-forge-primary text-black'}`}>
                          {ext.installed ? '✓' : '+'}
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="text-xs font-semibold mb-2 mt-4">TOOLS</div>
                  
                  {[
                    { name: 'Prettier', icon: '✨', description: 'Code formatter', installed: true },
                    { name: 'ESLint', icon: '📋', description: 'JavaScript linter', installed: true },
                    { name: 'GitLens', icon: '🔍', description: 'Git supercharged', installed: false },
                    { name: 'Docker', icon: '🐳', description: 'Docker support', installed: false },
                  ].map((ext, index) => (
                    <div key={index} className="p-2 bg-forge-surfaceLow rounded hover:bg-forge-surfaceHigh transition-all cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{ext.icon}</span>
                          <div>
                            <div className="text-xs font-semibold">{ext.name}</div>
                            <div className="text-xs text-forge-textMuted">{ext.description}</div>
                          </div>
                        </div>
                        <button className={`text-xs px-2 py-1 rounded ${ext.installed ? 'bg-green-500/20 text-green-400' : 'bg-forge-primary text-black'}`}>
                          {ext.installed ? '✓' : '+'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeActivity === 'ai' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">AI ASSISTANT</h2>
                <button onClick={() => setAiPanelVisible(!aiPanelVisible)} className="w-full bg-forge-ai text-black px-3 py-2 rounded text-xs font-semibold">
                  {aiPanelVisible ? 'Hide AI Panel' : 'Show AI Panel'}
                </button>
              </div>
            )}

            {activeActivity === 'settings' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3">
                <h2 className="text-xs font-semibold tracking-widest mb-3">SETTINGS</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs block mb-1">Theme</label>
                    <select className="w-full bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs">
                      <option>Dark</option>
                      <option>Dark+</option>
                      <option>Light</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1">Font Size</label>
                    <select className="w-full bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs">
                      <option>12px</option>
                      <option>14px</option>
                      <option>16px</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center bg-forge-surface border-b border-forge-border overflow-x-auto">
            {/* Pinned tabs */}
            {pinnedTabs.map(tab => (
              <div
                key={`pinned-${tab}`}
                onClick={() => setActiveTab(tab)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTabContextMenu({ tab, x: e.clientX, y: e.clientY })
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs border-r border-forge-border cursor-pointer whitespace-nowrap ${
                  activeTab === tab ? 'bg-forge-surfaceLow text-forge-primary' : 'hover:bg-forge-surfaceLow'
                }`}
              >
                <span className="text-xs">📌</span>
                <span>{getFileIcon(tab)}</span>
                <span className="truncate">{tab}</span>
              </div>
            ))}
            {/* Regular tabs */}
            {openTabs.filter(tab => !pinnedTabs.includes(tab)).map(tab => (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTabContextMenu({ tab, x: e.clientX, y: e.clientY })
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs border-r border-forge-border cursor-pointer whitespace-nowrap ${
                  activeTab === tab ? 'bg-forge-surfaceLow text-forge-primary' : 'hover:bg-forge-surfaceLow'
                }`}
              >
                <span>{getFileIcon(tab)}</span>
                <span className="truncate">{tab}</span>
                <button
                  onClick={(e) => closeTab(tab, e)}
                  className="ml-1 hover:bg-forge-border rounded p-0.5"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowNewFileInput(true)}
              className="px-3 py-2 text-xs hover:bg-forge-surfaceLow border-l border-forge-border"
            >
              +
            </button>
          </div>

          {/* Editor and Preview Split */}
          <div className="flex-1 flex overflow-hidden">
            {/* Code Editor */}
            <div className={`flex-1 flex flex-col min-w-0 ${previewVisible ? 'w-1/2' : 'w-full'}`}>
              <div className="flex items-center justify-between px-3 py-1 border-b border-forge-border bg-forge-surfaceLow text-xs">
                <span>{activeTab || 'No file selected'}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCommandPalette(true)}
                    className="hover:bg-forge-surfaceLow px-2 py-1 rounded"
                    title="Command Palette (Ctrl+Shift+P)"
                  >
                    ⌘
                  </button>
                  <button
                    onClick={() => setShowSearchPanel(true)}
                    className="hover:bg-forge-surfaceLow px-2 py-1 rounded"
                    title="Search (Ctrl+F)"
                  >
                    🔍
                  </button>
                  <button onClick={() => setPreviewVisible(!previewVisible)} className="hover:bg-forge-surfaceLow px-2 py-1 rounded">
                    {previewVisible ? 'Close Preview' : 'Open Preview'}
                  </button>
                </div>
              </div>
              <Editor
                height="100%"
                language={getMonacoLanguage(activeTab)}
                value={draft}
                onChange={(value) => updateDraft(value || '')}
                theme={editorTheme}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: editorFontSize,
                  tabSize: editorTabSize,
                  wordWrap: editorWordWrap,
                  minimap: { enabled: editorMinimap },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  readOnly: !activeTab,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  smoothScrolling: true,
                  folding: true,
                  foldingStrategy: 'auto',
                  showFoldingControls: 'always',
                  matchBrackets: 'always',
                  autoIndent: 'full',
                  formatOnPaste: true,
                  formatOnType: true,
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'on',
                  tabCompletion: 'on',
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false
                  },
                  parameterHints: {
                    enabled: true
                  },
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace",
                }}
                loading={<div className="flex items-center justify-center h-full text-forge-textMuted">Loading editor...</div>}
              />
              <div className="flex items-center justify-between px-3 py-1 border-t border-forge-border bg-forge-surfaceLow text-xs text-forge-textMuted">
                <div className="flex items-center gap-4">
                  <span>{activeTab ? `${draft.split('\n').length} lines` : 'No file selected'}</span>
                  <span>UTF-8</span>
                  <span>{fileLanguage(activeTab)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      const newTheme = editorTheme === 'forge-dark' ? 'light' : 'forge-dark'
                      setEditorTheme(newTheme)
                      if (monaco) {
                        monaco.editor.setTheme(newTheme)
                      }
                    }}
                    className="hover:bg-forge-surfaceHigh px-2 py-1 rounded"
                    title="Toggle theme"
                  >
                    {editorTheme === 'forge-dark' ? '🌙' : '☀️'}
                  </button>
                  <button 
                    onClick={() => setEditorFontSize(editorFontSize === 14 ? 16 : 14)}
                    className="hover:bg-forge-surfaceHigh px-2 py-1 rounded"
                    title="Toggle font size"
                  >
                    {editorFontSize === 14 ? 'A' : 'A+'}
                  </button>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            {previewVisible && (
              <div className="w-1/2 border-l border-forge-border flex flex-col bg-forge-surface">
                <div className="flex items-center justify-between px-3 py-1 border-b border-forge-border">
                  <span className="text-xs font-semibold">PREVIEW</span>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-forge-surfaceLow rounded border border-forge-border">
                      {['desktop', 'tablet', 'mobile'].map(device => (
                        <button
                          key={device}
                          onClick={() => setPreviewDevice(device)}
                          className={`px-2 py-1 text-xs rounded ${previewDevice === device ? 'bg-forge-primary text-black' : 'hover:bg-forge-surfaceHigh'}`}
                        >
                          {device === 'desktop' ? '🖥️' : device === 'tablet' ? '📱' : '📲'}
                        </button>
                      ))}
                    </div>
                    <button onClick={openPreview} className="hover:bg-forge-surfaceLow px-2 py-1 rounded text-xs">
                      ↻ Refresh
                    </button>
                    <button onClick={() => setPreviewVisible(false)} className="hover:bg-forge-surfaceLow px-2 py-1 rounded text-xs">
                      ×
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-white flex items-center justify-center p-4">
                  {previewUrl ? (
                    <div className={`
                      border-2 border-gray-300 rounded-lg overflow-hidden shadow-lg
                      ${previewDevice === 'desktop' ? 'w-full h-full' : 
                        previewDevice === 'tablet' ? 'w-[768px] h-[1024px]' : 
                        'w-[375px] h-[667px]'}
                    `}>
                      <iframe
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title="Preview"
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
                      <div className="text-4xl mb-2">🖥️</div>
                      <div>Click "Open Preview" to see your website</div>
                      <div className="text-xs mt-2 text-gray-400">Supports desktop, tablet, and mobile views</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel */}
          {bottomPanelVisible && (
            <div className="h-48 border-t border-forge-border flex flex-col bg-forge-surface">
              {/* Panel Tabs */}
              <div className="flex items-center border-b border-forge-border bg-forge-surfaceLow">
                {bottomPanelTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveBottomPanel(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1 text-xs ${
                      activeBottomPanel === tab.id ? 'bg-forge-surface text-forge-primary border-t-2 border-forge-primary' : 'hover:bg-forge-surface'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => setBottomPanelVisible(false)}
                  className="px-3 py-1 text-xs hover:bg-forge-surface"
                >
                  ×
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden">
                {activeBottomPanel === 'terminal' && (
                  <div className="h-full flex flex-col p-2">
                    <div
                      ref={terminalRef}
                      className="flex-1 overflow-auto font-mono text-xs space-y-1"
                    >
                      {terminalHistory.map((entry, index) => (
                        <div
                          key={index}
                          className={`${
                            entry.type === 'error' ? 'text-red-400' :
                            entry.type === 'command' ? 'text-green-400' :
                            'text-forge-text'
                          }`}
                        >
                          {entry.text}
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleTerminalCommand} className="mt-2 flex gap-2">
                      <span className="text-green-400 font-mono text-xs">$</span>
                      <input
                        value={terminalInput}
                        onChange={(event) => setTerminalInput(event.target.value)}
                        className="flex-1 bg-forge-surfaceLow border border-forge-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-forge-primary"
                        placeholder="Type a command..."
                      />
                    </form>
                  </div>
                )}

                {activeBottomPanel === 'output' && (
                  <div className="h-full p-3 overflow-auto">
                    <h3 className="text-xs font-semibold mb-2">OUTPUT</h3>
                    <p className="text-xs text-forge-textMuted">No output yet. Run your project to see output here.</p>
                  </div>
                )}

                {activeBottomPanel === 'problems' && (
                  <div className="h-full p-3 overflow-auto">
                    <h3 className="text-xs font-semibold mb-2">PROBLEMS</h3>
                    <p className="text-xs text-forge-textMuted">No problems detected in your workspace.</p>
                  </div>
                )}

                {activeBottomPanel === 'test' && (
                  <div className="h-full p-3 overflow-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold">TESTS</h3>
                      <button 
                        onClick={runTests}
                        disabled={isRunningTests}
                        className="px-3 py-1 bg-forge-primary text-black rounded text-xs font-semibold disabled:opacity-40"
                      >
                        {isRunningTests ? 'Running...' : '▶ Run Tests'}
                      </button>
                    </div>
                    
                    {testResults.length === 0 ? (
                      <p className="text-xs text-forge-textMuted">No tests run yet. Click "Run Tests" to execute your test suite.</p>
                    ) : (
                      <div className="space-y-2">
                        {testResults.map((test, index) => (
                          <div 
                            key={index}
                            className={`p-2 rounded border cursor-pointer ${
                              test.status === 'passed' ? 'bg-green-500/10 border-green-500' :
                              test.status === 'failed' ? 'bg-red-500/10 border-red-500' :
                              'bg-yellow-500/10 border-yellow-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={test.status === 'passed' ? 'text-green-400' : test.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                                {test.status === 'passed' ? '✓' : test.status === 'failed' ? '✕' : '○'}
                              </span>
                              <span className="text-xs font-medium">{test.name}</span>
                            </div>
                            {test.output && (
                              <div className="mt-1 text-xs text-forge-textMuted font-mono truncate">
                                {test.output}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeBottomPanel === 'debug' && (
                  <div className="h-full p-3 overflow-auto">
                    <h3 className="text-xs font-semibold mb-2">DEBUG CONSOLE</h3>
                    <p className="text-xs text-forge-textMuted">Debug console will appear when debugging is active.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Panel */}
        {aiPanelVisible && !isMobile && (
          <aside className="w-80 border-l border-forge-border bg-forge-surface flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border">
              <h2 className="text-xs font-semibold tracking-widest">AI ASSISTANT</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setAiPlanMode(!aiPlanMode)}
                  className={`text-xs px-2 py-1 rounded ${aiPlanMode ? 'bg-forge-primary text-black' : 'hover:bg-forge-surfaceLow'}`}
                >
                  {aiPlanMode ? 'Exit Plan' : 'Plan Mode'}
                </button>
                <button onClick={() => setAiPanelVisible(false)} className="hover:bg-forge-surfaceLow px-2 py-1 rounded text-xs">
                  ×
                </button>
              </div>
            </div>
            
            {aiPlanMode ? (
              <div className="flex-1 overflow-auto p-3">
                <div className="mb-3">
                  <p className="text-xs text-forge-textMuted mb-2">AI will create a step-by-step plan before making changes.</p>
                </div>
                
                {aiPlan.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold mb-2">EXECUTION PLAN</div>
                    {aiPlan.map((step) => (
                      <div key={step.id} className={`p-2 rounded border ${step.completed ? 'bg-green-500/10 border-green-500' : 'bg-forge-surfaceLow border-forge-border'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-xs ${step.completed ? 'text-green-400' : 'text-forge-textMuted'}`}>
                            {step.completed ? '✓' : `${step.id}.`}
                          </span>
                          <span className="text-xs flex-1">{step.text}</span>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={executeAiPlan}
                      disabled={aiPlan.every(step => step.completed)}
                      className="w-full mt-3 bg-forge-primary text-black px-3 py-2 rounded text-xs font-semibold disabled:opacity-40"
                    >
                      Execute Plan
                    </button>
                    <button
                      onClick={() => { setAiPlanMode(false); setAiPlan([]) }}
                      className="w-full mt-2 border border-forge-border px-3 py-2 rounded text-xs"
                    >
                      Cancel Plan
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); generateAiPlan(); }} className="space-y-2">
                    <textarea
                      value={aiPrompt}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      rows={4}
                      placeholder="Describe what you want to accomplish..."
                      className="w-full resize-none rounded-lg border border-forge-border bg-forge-surfaceLow px-3 py-2 text-sm focus:outline-none focus:border-forge-primary"
                    />
                    <button
                      type="submit"
                      disabled={isAiWorking || !aiPrompt.trim()}
                      className="w-full rounded-lg bg-forge-ai text-black px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      {isAiWorking ? 'Creating Plan...' : '🧠 Generate Plan'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-3">
                <div className="mb-3">
                  <p className="text-xs text-forge-textMuted mb-2">Ask for edits, files, or explanations.</p>
                </div>
                <div className="rounded-lg border border-forge-border bg-forge-surfaceLow p-3 text-sm whitespace-pre-wrap min-h-[200px]">
                  {aiReply || 'AI suggestions will appear here. Ask it to update the selected file or create a complete file.'}
                </div>
              </div>
            )}
            
            {!aiPlanMode && (
              <form onSubmit={askAi} className="p-3 border-t border-forge-border space-y-2">
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  rows={4}
                  placeholder="Edit this file to..."
                  className="w-full resize-none rounded-lg border border-forge-border bg-forge-surfaceLow px-3 py-2 text-sm focus:outline-none focus:border-forge-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isAiWorking || !aiPrompt.trim()}
                    className="flex-1 rounded-lg bg-forge-primary px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {isAiWorking ? 'Thinking...' : 'Ask AI'}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyAiReply()}
                    disabled={!aiReply || aiReply.startsWith('AI error:')}
                    className="rounded-lg border border-forge-border px-3 py-2 text-sm disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </form>
            )}
          </aside>
        )}
      </div>

      {/* Deployment Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-forge-surface border border-forge-border rounded-2xl p-6 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold">🚀 Deploy Project</h2>
              <button 
                onClick={() => setShowDeployModal(false)}
                className="w-8 h-8 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs block mb-2">Select Platform</label>
                <select 
                  value={deployPlatform}
                  onChange={(e) => setDeployPlatform(e.target.value)}
                  className="w-full bg-forge-surfaceLow border border-forge-border rounded px-3 py-2 text-sm"
                >
                  <option value="">Choose a platform...</option>
                  <option value="vercel">Vercel</option>
                  <option value="netlify">Netlify</option>
                  <option value="firebase">Firebase Hosting</option>
                  <option value="docker">Docker</option>
                  <option value="github">GitHub Pages</option>
                </select>
              </div>

              {deployPlatform && (
                <div className="p-4 bg-forge-surfaceLow rounded-lg">
                  <div className="text-xs font-semibold mb-2">Deployment Steps</div>
                  <div className="space-y-2 text-xs text-forge-textMuted">
                    {deployPlatform === 'vercel' && (
                      <>
                        <div>1. Install Vercel CLI: npm i -g vercel</div>
                        <div>2. Login: vercel login</div>
                        <div>3. Deploy: vercel --prod</div>
                      </>
                    )}
                    {deployPlatform === 'netlify' && (
                      <>
                        <div>1. Install Netlify CLI: npm i -g netlify-cli</div>
                        <div>2. Login: netlify login</div>
                        <div>3. Deploy: netlify deploy --prod</div>
                      </>
                    )}
                    {deployPlatform === 'firebase' && (
                      <>
                        <div>1. Install Firebase CLI: npm i -g firebase-tools</div>
                        <div>2. Login: firebase login</div>
                        <div>3. Initialize: firebase init</div>
                        <div>4. Deploy: firebase deploy</div>
                      </>
                    )}
                    {deployPlatform === 'docker' && (
                      <>
                        <div>1. Create Dockerfile in project root</div>
                        <div>2. Build image: docker build -t myapp .</div>
                        <div>3. Run container: docker run -p 80:80 myapp</div>
                      </>
                    )}
                    {deployPlatform === 'github' && (
                      <>
                        <div>1. Initialize git repository</div>
                        <div>2. Create GitHub repository</div>
                        <div>3. Push code: git push origin main</div>
                        <div>4. Enable GitHub Pages in settings</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsDeploying(true)
                    setTimeout(() => {
                      setIsDeploying(false)
                      setShowDeployModal(false)
                      setTerminalHistory(prev => [...prev, { type: 'success', text: `Deployment initiated for ${deployPlatform}. Check terminal for progress.` }])
                    }, 2000)
                  }}
                  disabled={!deployPlatform || isDeploying}
                  className="flex-1 bg-forge-primary text-black px-4 py-2 rounded-lg font-semibold disabled:opacity-40"
                >
                  {isDeploying ? 'Initializing...' : 'Start Deployment'}
                </button>
                <button
                  onClick={() => setShowDeployModal(false)}
                  className="px-4 py-2 border border-forge-border rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <footer className="flex items-center justify-between px-3 py-1 border-t border-forge-border bg-forge-surface text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${projectHealth?.status === 'healthy' ? 'bg-green-500' : projectHealth?.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
            {projectHealth?.status === 'healthy' ? 'Project Healthy' : projectHealth?.status === 'warning' ? `${projectHealth?.warnings?.length || 0} warnings` : `${projectHealth?.issues?.length || 0} errors`}
          </span>
          <span>{username}</span>
          <span>{projectSummary}</span>
          {projectInfo?.framework && <span className="text-forge-primary">{projectInfo.framework}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={undo} disabled={historyIndex <= 0} className="hover:bg-forge-surfaceLow px-2 py-1 rounded disabled:opacity-40" title="Undo">↶</button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="hover:bg-forge-surfaceLow px-2 py-1 rounded disabled:opacity-40" title="Redo">↷</button>
          <span>{activeTab ? `Ln ${draft.split('\n').length}, Col 1` : ''}</span>
          <span>UTF-8</span>
          <span>{fileLanguage(activeTab)}</span>
        </div>
      </footer>

      {/* Command Palette */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
          <div className="w-full max-w-2xl bg-forge-surface border border-forge-border rounded-lg shadow-2xl overflow-hidden">
            <div className="flex items-center border-b border-forge-border">
              <span className="px-4 py-3 text-forge-textMuted">{'>'}</span>
              <input
                autoFocus
                type="text"
                value={commandPaletteQuery}
                onChange={(e) => {
                  setCommandPaletteQuery(e.target.value)
                  setCommandPaletteIndex(0)
                }}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent border-none outline-none py-3 text-sm"
              />
              <button
                onClick={() => setShowCommandPalette(false)}
                className="px-4 py-3 hover:bg-forge-surfaceLow"
              >
                ×
              </button>
            </div>
            <div className="max-h-96 overflow-auto">
              {filteredCommands.length === 0 ? (
                <div className="p-4 text-center text-forge-textMuted text-sm">No commands found</div>
              ) : (
                filteredCommands.map((command, index) => (
                  <button
                    key={command.id}
                    onClick={() => executeCommand(command)}
                    className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-forge-surfaceLow ${
                      index === commandPaletteIndex ? 'bg-forge-primaryLight text-forge-primary' : ''
                    }`}
                  >
                    <span>{command.label}</span>
                    <span className="text-xs text-forge-textMuted">{command.shortcut}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Search & Replace Panel */}
      {showSearchPanel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
          <div className="w-full max-w-3xl bg-forge-surface border border-forge-border rounded-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-forge-border px-4 py-3">
              <h3 className="font-semibold text-sm">Search & Replace</h3>
              <button
                onClick={() => setShowSearchPanel(false)}
                className="hover:bg-forge-surfaceLow px-2 py-1 rounded"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchReplaceQuery.search}
                  onChange={(e) => setSearchReplaceQuery(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Search..."
                  className="flex-1 bg-forge-surfaceLow border border-forge-border rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={performSearchReplace}
                  className="bg-forge-primary text-black px-4 py-2 rounded text-sm font-semibold"
                >
                  Search
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchReplaceQuery.replace}
                  onChange={(e) => setSearchReplaceQuery(prev => ({ ...prev, replace: e.target.value }))}
                  placeholder="Replace with..."
                  className="flex-1 bg-forge-surfaceLow border border-forge-border rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={replaceAll}
                  className="bg-forge-tech text-black px-4 py-2 rounded text-sm font-semibold"
                >
                  Replace All
                </button>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={searchReplaceQuery.useRegex}
                    onChange={(e) => setSearchReplaceQuery(prev => ({ ...prev, useRegex: e.target.checked }))}
                  />
                  Use Regex
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={searchReplaceQuery.caseSensitive}
                    onChange={(e) => setSearchReplaceQuery(prev => ({ ...prev, caseSensitive: e.target.checked }))}
                  />
                  Case Sensitive
                </label>
              </div>
              {searchReplaceResults.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-forge-textMuted mb-2">
                    {searchReplaceResults.length} result{searchReplaceResults.length === 1 ? '' : 's'} found
                  </div>
                  <div className="max-h-64 overflow-auto space-y-1">
                    {searchReplaceResults.map((result, index) => (
                      <div
                        key={index}
                        onClick={() => {
                          openFile(result.file)
                          setActiveTab(result.file)
                          setShowSearchPanel(false)
                        }}
                        className="p-2 hover:bg-forge-surfaceLow rounded cursor-pointer"
                      >
                        <div className="text-xs font-semibold">{result.file}:{result.line}</div>
                        <div className="text-xs text-forge-textMuted truncate">{result.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <div
          className="fixed bg-forge-surface border border-forge-border rounded-lg shadow-xl z-50 min-w-48"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
          onClick={() => setTabContextMenu(null)}
        >
          <button
            onClick={() => {
              pinTab(tabContextMenu.tab)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-forge-surfaceLow"
          >
            {pinnedTabs.includes(tabContextMenu.tab) ? '📌 Unpin Tab' : '📌 Pin Tab'}
          </button>
          <button
            onClick={() => {
              closeOtherTabs(tabContextMenu.tab)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-forge-surfaceLow"
          >
            Close Other Tabs
          </button>
          <button
            onClick={() => {
              closeAllTabs()
              setTabContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-forge-surfaceLow"
          >
            Close All Tabs
          </button>
          <div className="border-t border-forge-border my-1" />
          <button
            onClick={() => {
              const newName = prompt('Enter new name:', tabContextMenu.tab)
              if (newName && newName !== tabContextMenu.tab) {
                renameFile(tabContextMenu.tab)
              }
              setTabContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-forge-surfaceLow"
          >
            Rename
          </button>
          <button
            onClick={() => {
              deleteFile(tabContextMenu.tab)
              setTabContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-forge-surfaceLow text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}