import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/api.js'

const codeTokenPattern = /(\/\*[^]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|new|true|false|null|undefined|def|print|None|True|False|public|static|void|int|string|boolean)\b|\b\d+(?:\.\d+)?\b)/g

function renderCode(code) {
  return code.split(codeTokenPattern).map((token, index) => {
    let color = ''
    if (/^(\/\/|\/\*|#)/.test(token)) color = 'text-slate-500'
    else if (/^["'`]/.test(token)) color = 'text-emerald-300'
    else if (/^\d/.test(token)) color = 'text-amber-300'
    else if (/^(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|new|def|public|static|void|int|string|boolean)$/.test(token)) color = 'text-cyan-300'
    else if (/^(true|false|null|undefined|None|True|False)$/.test(token)) color = 'text-violet-300'
    return color ? <span className={color} key={index}>{token}</span> : token
  })
}

function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong className="font-semibold text-forge-primary" key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-emerald-200" key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    }
    return part
  })
}

function renderMessage(content) {
  if (Array.isArray(content)) {
    return content.map((part, index) => {
      if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
        return <img key={`image-${index}`} src={part.image_url.url} alt="Attached image" className="my-2 max-h-72 max-w-full rounded-lg border border-forge-border object-contain" />
      }
      if (part?.type === 'text') return <span key={`part-${index}`}>{renderMessage(part.text)}</span>
      return null
    })
  }

  return String(content).split(/(```[^\n]*\n[\s\S]*?```)/g).map((part, index) => {
    if (!part.startsWith('```')) return <span key={`text-${index}`}>{renderInline(part, `inline-${index}`)}</span>

    const firstNewline = part.indexOf('\n')
    const language = part.slice(3, firstNewline).trim() || 'code'
    const code = part.slice(firstNewline + 1, -3).replace(/\n$/, '')
    return (
      <div className="my-3 overflow-hidden rounded-lg border border-forge-border bg-[#080e13]" key={`code-${index}`}>
        <div className="border-b border-forge-border px-3 py-2 font-mono text-xs text-forge-textMuted">{language}</div>
        <pre className="max-w-full overflow-x-auto p-3 font-mono text-xs leading-6"><code>{renderCode(code)}</code></pre>
      </div>
    )
  })
}

export function Chat({ setCurrentPage: _setCurrentPage, username }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m Vux AI Studio. Your intelligent coding companion. How can I help you build amazing software today?' }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selectedContext, _setSelectedContext] = useState('general')
  const [contextPanelOpen, setContextPanelOpen] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  const conversations = [
    { id: 1, title: 'Build Python API', preview: 'Creating FastAPI backend...', time: '2h ago' },
    { id: 2, title: 'React Component Help', preview: 'Refactoring dashboard layout...', time: 'Yesterday' },
    { id: 3, title: 'Debug Session', preview: 'Fixing authentication error...', time: '3 days ago' },
  ]

  const contextFiles = [
    { name: 'main.py', size: '2.4KB' },
    { name: 'auth.py', size: '1.8KB' },
    { name: 'database.py', size: '3.2KB' },
    { name: 'routes.py', size: '4.1KB' },
  ]

  const aiCapabilities = [
    { icon: '💻', title: 'Code Generation', desc: 'Generate and modify code' },
    { icon: '🔍', title: 'Code Analysis', desc: 'Understand and explain code' },
    { icon: '📝', title: 'Documentation', desc: 'Generate docs and comments' },
    { icon: '🔧', title: 'Refactoring', desc: 'Improve code quality' },
    { icon: '🧪', title: 'Testing', desc: 'Write and optimize tests' },
  ]

  const vuxResponses = [
    "I can help you with that! Let me analyze your request and provide the best solution...",
    "Great question! I'm here to help you build better software faster. Here's my approach...",
    "I understand you need assistance with this. Let me break this down for you...",
    "That's a great challenge! I can help you tackle this efficiently. Here's what I suggest...",
    "I'm here to help you succeed! Let me assist you with this..."
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingMessage])

  const handleSend = async () => {
    const userText = input.trim()
    if ((!userText && attachedFiles.length === 0) || isTyping || isStreaming) return

    setIsTyping(true)
    setIsStreaming(false)
    setStreamingMessage('')

    try {
      const imageParts = await Promise.all(attachedFiles
        .filter((file) => file.type.startsWith('image/'))
        .map((file) => new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve({ type: 'image_url', image_url: { url: reader.result } })
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
          reader.readAsDataURL(file)
        })))
      const messageContent = imageParts.length
        ? [...(userText ? [{ type: 'text', text: userText }] : [{ type: 'text', text: 'Describe the attached image.' }]), ...imageParts]
        : userText
      const nextMessages = [...messages, { role: 'user', content: messageContent }]
      setMessages(nextMessages)
      setInput('')
      setAttachedFiles([])

      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const data = await response.json()
      const replyText = response.ok ? (data.text || 'No response received.') : (data.error || 'Chat request failed.')

      setIsTyping(false)
      setIsStreaming(true)
      const totalSteps = Math.min(replyText.length, 120)
      const chunkSize = Math.max(1, Math.ceil(replyText.length / Math.max(totalSteps, 1)))
      const delay = totalSteps ? Math.min(42, 5000 / totalSteps) : 0
      await new Promise((resolve) => {
        let cursor = 0
        const revealChunk = () => {
          cursor = Math.min(replyText.length, cursor + chunkSize)
          setStreamingMessage(replyText.slice(0, cursor))
          if (cursor < replyText.length) {
            window.setTimeout(revealChunk, delay)
          } else {
            setMessages((prev) => [...prev, { role: 'assistant', content: replyText }])
            setStreamingMessage('')
            setIsStreaming(false)
            resolve()
          }
        }
        revealChunk()
      })
    } catch (error) {
      console.error('Chat request failed:', error)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The assistant service could not be reached. Check your connection and try again.' }])
      setStreamingMessage('')
      setIsStreaming(false)
    } finally {
      setIsTyping(false)
    }
  }

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
    const oversized = files.find((file) => file.size > 6 * 1024 * 1024)
    if (oversized) {
      e.target.value = ''
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Images must be smaller than 6 MB to attach.' }])
      return
    }
    setAttachedFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center">
            ☰
          </button>
          <div>
            <h1 className="text-lg font-display font-semibold">Vux AI Chat</h1>
            <p className="text-xs text-forge-textMuted">Chat with Vux AI Studio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-forge-success animate-pulse"></div>
            <span className="text-xs text-forge-success">Online</span>
          </div>
          <button className="w-8 h-8 rounded-full bg-gradient-to-br from-forge-primary to-forge-primaryHover flex items-center justify-center text-white font-bold text-sm">
            {username.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Conversations Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r border-forge-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Conversations</h2>
          <button className="w-8 h-8 rounded-lg bg-forge-primaryLight flex items-center justify-center text-forge-primary hover:bg-forge-primary/20 transition-all">
            +
          </button>
        </div>
        
        <div className="space-y-1 mb-4">
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-forge-aiLight text-forge-ai">
            <span>💬</span>
            <span className="text-sm font-medium">New Chat</span>
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-forge-textMuted px-3 py-2">Today</div>
          {conversations.map((conv) => (
            <button key={conv.id} className="w-full text-left px-3 py-2 rounded-lg hover:bg-forge-surfaceLow transition-all">
              <div className="text-sm font-medium mb-1">{conv.title}</div>
              <div className="text-xs text-forge-textMuted truncate">{conv.preview}</div>
              <div className="text-xs text-forge-textDim mt-1">{conv.time}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Chat Header - Desktop */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm">
          <div>
            <h1 className="text-xl font-display font-semibold">Vux AI Chat</h1>
            <p className="text-sm text-forge-textMuted">Powered by Vux AI Studio - Your intelligent coding companion</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-forge-success animate-pulse"></div>
              <span className="text-sm text-forge-success">Vux AI Online</span>
            </div>
            <button className="w-8 h-8 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh transition-all">
              ✨
            </button>
            <button className="px-4 py-2 bg-forge-aiLight text-forge-ai rounded-lg hover:bg-forge-ai/20 transition-all">
              New Chat
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-full lg:max-w-2xl ${
                message.role === 'user' 
                  ? 'bg-forge-surfaceHigh border border-forge-border rounded-2xl rounded-tr-sm' 
                  : 'bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm'
              } p-4`}>
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                    <span className="text-xs text-forge-primary font-medium">Vux AI Studio</span>
                  </div>
                )}
                <div className={`text-sm whitespace-pre-wrap ${message.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user'}`}>{renderMessage(message.content)}</div>
              </div>
            </div>
          ))}
          
          {/* Streaming Message */}
          {isStreaming && streamingMessage && (
            <div className="flex justify-start">
              <div className="bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                  <span className="text-xs text-forge-primary font-medium">Vux AI Studio</span>
                </div>
                <div className="text-sm whitespace-pre-wrap chat-message-assistant">
                  {renderMessage(streamingMessage)}
                  {isStreaming && <span className="typing-cursor"></span>}
                </div>
              </div>
            </div>
          )}
          
          {isTyping && !isStreaming && (
            <div className="flex justify-start">
              <div className="bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                  <span className="text-xs text-forge-primary font-medium">Vux AI Studio</span>
                </div>
                <div className="flex items-center gap-2" role="status" aria-label="Vux is thinking">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-forge-primary animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-forge-primary animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-forge-primary animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="chat-thinking-particles" aria-hidden="true"><i /><i /><i /></span>
                  <span className="text-xs text-forge-textMuted">Thinking</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-6 border-t border-forge-border bg-forge-surface/50 backdrop-blur-sm">
          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-forge-surfaceLow border border-forge-border rounded-lg px-3 py-2">
                  <span className="text-sm">📄 {file.name}</span>
                  <button 
                    onClick={() => removeFile(index)}
                    className="text-forge-textMuted hover:text-forge-text transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2 lg:gap-3 mb-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-forge-surfaceLow border border-forge-border flex items-center justify-center hover:bg-forge-surfaceHigh transition-all"
              title="Add files to review"
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex-1"></div>
            <button 
              onClick={() => setContextPanelOpen(!contextPanelOpen)}
              className="lg:hidden text-xs text-forge-textMuted hover:text-forge-text transition-colors"
            >
              Context
            </button>
            <button className="hidden lg:block text-xs text-forge-textMuted hover:text-forge-text transition-colors">
              Context: {selectedContext === 'general' ? 'General' : 'Task Manager API'}
            </button>
          </div>
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              disabled={isTyping || isStreaming}
              placeholder="Ask anything..."
              className="w-full bg-forge-surfaceLow border border-forge-border rounded-xl px-4 py-3 pr-12 text-sm text-forge-text focus:outline-none focus:border-forge-primary transition-all resize-none placeholder-forge-textDim"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={isTyping || isStreaming || !input.trim()}
              className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-forge-primary text-black flex items-center justify-center hover:bg-forge-primaryHover transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      </main>

      {/* Context Panel - Desktop */}
      <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-forge-border p-4 space-y-4">
        {/* Current Context */}
        <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
          <h3 className="font-display font-semibold mb-3">CURRENT CONTEXT</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-forge-textMuted">Active Project</span>
              <span className="text-forge-primary">Task Manager API</span>
            </div>
            <div className="text-xs text-forge-textMuted">
              8 files • Python • FastAPI
            </div>
          </div>
        </div>

        {/* Related Files */}
        <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
          <h3 className="font-display font-semibold mb-3">RELATED FILES</h3>
          <div className="space-y-2">
            {contextFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-sm hover:bg-forge-surfaceLow rounded-lg p-2 cursor-pointer transition-all">
                <span className="text-forge-tech">📄</span>
                <span className="flex-1">{file.name}</span>
                <span className="text-xs text-forge-textDim">{file.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Capabilities */}
        <div className="bg-forge-surface border border-forge-border rounded-xl p-4">
          <h3 className="font-display font-semibold mb-3">VUX AI CAPABILITIES</h3>
          <div className="space-y-2">
            {aiCapabilities.map((capability, index) => (
              <div key={index} className="flex items-center gap-3 p-2 hover:bg-forge-surfaceLow rounded-lg cursor-pointer transition-all">
                <span className="text-lg">{capability.icon}</span>
                <div>
                  <div className="text-sm font-medium">{capability.title}</div>
                  <div className="text-xs text-forge-textMuted">{capability.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vux Pro */}
        <div className="bg-gradient-to-br from-forge-primary/20 to-forge-ai/20 border border-forge-primary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-forge-primary font-semibold">Vux AI Studio Pro</span>
          </div>
          <ul className="text-xs text-forge-textMuted space-y-1 mb-3">
            <li>• Unlimited AI chats</li>
            <li>• Advanced AI models</li>
            <li>• Priority support</li>
            <li>• More context</li>
          </ul>
          <button className="w-full px-4 py-2 bg-forge-primary text-black font-medium rounded-lg hover:bg-forge-primaryHover transition-all text-sm">
            Upgrade Now
          </button>
        </div>
      </aside>

      {/* Mobile Context Panel */}
      {contextPanelOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setContextPanelOpen(false)}></div>
          <div className="absolute right-0 top-0 h-full w-80 bg-forge-surface border-l border-forge-border p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Context</h3>
              <button onClick={() => setContextPanelOpen(false)} className="w-8 h-8 rounded-lg bg-forge-surfaceHigh flex items-center justify-center">✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-forge-surfaceHigh border border-forge-border rounded-xl p-4">
                <h4 className="font-medium text-sm mb-2">Current Project</h4>
                <div className="text-forge-primary text-sm">Task Manager API</div>
              </div>
              <div className="bg-forge-surfaceHigh border border-forge-border rounded-xl p-4">
                <h4 className="font-medium text-sm mb-2">Related Files</h4>
                {contextFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm py-1">
                    <span>📄</span>
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}