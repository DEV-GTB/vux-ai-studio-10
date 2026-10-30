import { useState, useEffect, useRef, useCallback } from 'react'
import { apiUrl } from '../lib/api.js'
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../lib/chatStorage.js'

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
        return <img key={`image-${index}`} src={part.image_url.url} alt="Generated image" className="image-reveal my-2 max-h-72 max-w-full rounded-lg border border-forge-border object-contain" />
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

const WELCOME_MESSAGE = 'Hello! I\'m VUX AI. Your intelligent coding companion. How can I help you build amazing software today?'

// Signed-in users get their chat thread restored from browser storage so a
// refresh or accidental reload does not drop the conversation.
function readStoredMessages() {
  try {
    if (window.localStorage.getItem('vux_onboarded') !== 'true') return null
    return loadChatHistory()
  } catch {
    return null
  }
}

const contextFiles = [
  { name: 'main.py', size: '2.4KB' },
  { name: 'auth.py', size: '1.8KB' },
  { name: 'database.py', size: '3.2KB' },
  { name: 'routes.py', size: '4.1KB' },
]

// The memory menu shows what VUX AI was asked to remember. It sits in the chat
// header, so the count is always visible without opening anything.
function MemoryMenu({ memories, onForget }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className={`memory-chip ${memories.length ? 'memory-chip-active' : ''}`}
        title="What Vux was asked to remember"
        aria-expanded={open}
      >
        <span aria-hidden="true">🧠</span>
        <span>{memories.length}</span>
      </button>
      {open && (
        <div className="memory-popover">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Remembered</h4>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-md text-forge-textMuted hover:text-forge-text hover:bg-forge-surfaceHigh transition-colors"
              aria-label="Close memory list"
            >✕</button>
          </div>
          {memories.length ? (
            <>
              <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {memories.map((memory) => (
                  <li key={memory.id} className="text-xs text-forge-textMuted rounded-md px-2 py-1 bg-forge-surfaceLow">
                    {memory.text}
                  </li>
                ))}
              </ul>
              <button
                onClick={onForget}
                className="mt-2 w-full px-3 py-1.5 text-xs rounded-lg bg-forge-surfaceLow border border-forge-border hover:bg-forge-surfaceHigh transition-colors"
              >
                Forget everything
              </button>
            </>
          ) : (
            <p className="text-xs text-forge-textDim">
              Nothing yet. Say “remember these words: …” and Vux will keep them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const aiCapabilities = [
  { icon: '💻', title: 'Code Generation', desc: 'Generate and modify code' },
  { icon: '🔍', title: 'Code Analysis', desc: 'Understand and explain code' },
  { icon: '📝', title: 'Documentation', desc: 'Generate docs and comments' },
  { icon: '🔧', title: 'Refactoring', desc: 'Improve code quality' },
  { icon: '🧪', title: 'Testing', desc: 'Write and optimize tests' },
]

export function Chat({ setCurrentPage: _setCurrentPage, username }) {
  const [messages, setMessages] = useState(() => readStoredMessages() || [{ role: 'assistant', content: WELCOME_MESSAGE }])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [selectedContext, _setSelectedContext] = useState('general')
  const [contextPanelOpen, setContextPanelOpen] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [attachedFileList, setAttachedFileList] = useState([])
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [memories, setMemories] = useState([])

  const fileInputRef = useRef(null)
  const scrollRef = useRef(null)
  const stickToBottomRef = useRef(true)

  // ---------------------------------------------------------------- memory

  const loadMemories = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/memory'))
      if (!response.ok) return
      const data = await response.json().catch(() => ({}))
      setMemories(Array.isArray(data.memories) ? data.memories : [])
    } catch {
      setMemories([])
    }
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  // Persist the thread while the user is signed in, so refreshes keep the chat.
  useEffect(() => {
    try {
      if (window.localStorage.getItem('vux_onboarded') === 'true') saveChatHistory(messages)
      else clearChatHistory()
    } catch {
      /* storage unavailable; the session simply will not persist */
    }
  }, [messages])

  const forgetMemories = async () => {
    try {
      await fetch(apiUrl('/api/memory'), { method: 'DELETE' })
    } catch {
      /* the list is refreshed below either way */
    }
    loadMemories()
  }

  // --------------------------------------------------------------- scroll
  //
  // The view only follows the answer while the reader is already at the
  // bottom. Scroll up to read something and the page stays where it is.

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickToBottomRef.current = distance <= 80
    setIsNearBottom(distance <= 80)
  }

  const scrollToLatest = (behavior = 'smooth') => {
    const element = scrollRef.current
    if (!element) return
    stickToBottomRef.current = true
    setIsNearBottom(true)
    element.scrollTo({ top: element.scrollHeight, behavior })
  }

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !stickToBottomRef.current) return
    // Set the position directly. A smooth scroll here would queue an
    // animation per streamed chunk and the view would keep chasing itself.
    element.scrollTop = element.scrollHeight
  }, [messages, streamingMessage, isTyping, isStreaming])

  // -------------------------------------------------------------- sending

  const streamReply = (text) => new Promise((resolve) => {
    const total = text.length
    if (!total) {
      setMessages((prev) => [...prev, { role: 'assistant', content: text }])
      setIsStreaming(false)
      resolve()
      return
    }

    const frames = Math.min(140, Math.max(24, Math.round(total / 4)))
    const step = Math.max(1, Math.ceil(total / frames))
    let cursor = 0

    const reveal = () => {
      cursor = Math.min(total, cursor + step)
      setStreamingMessage(text.slice(0, cursor))
      if (cursor < total) {
        requestAnimationFrame(reveal)
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: text }])
      setStreamingMessage('')
      setIsStreaming(false)
      resolve()
    }

    requestAnimationFrame(reveal)
  })

  const handleSend = async () => {
    const userText = input.trim()
    if ((!userText && attachedFileList.length === 0) || isTyping || isStreaming) return

    setIsTyping(true)
    setIsStreaming(false)
    setStreamingMessage('')
    stickToBottomRef.current = true

    try {
      const imageParts = await Promise.all(attachedFileList
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
      setAttachedFileList([])

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
      if (data.image) {
        // The chat image tool answered with a generated / edited image.
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: [
            { type: 'text', text: replyText },
            { type: 'image_url', image_url: { url: data.image } },
          ],
        }])
        setIsStreaming(false)
      } else {
        await streamReply(replyText)
      }
      loadMemories()
    } catch (error) {
      console.error('Chat request failed:', error)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The assistant service could not be reached. Check your connection and try again.' }])
      setStreamingMessage('')
      setIsStreaming(false)
    } finally {
      setIsTyping(false)
    }
  }

  const startNewChat = () => {
    clearChatHistory()
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }])
    setStreamingMessage('')
    setIsStreaming(false)
    setIsTyping(false)
    setInput('')
    setAttachedFileList([])
    stickToBottomRef.current = true
    requestAnimationFrame(() => scrollToLatest('auto'))
  }

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
    const oversized = files.find((file) => file.size > 6 * 1024 * 1024)
    if (oversized) {
      e.target.value = ''
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Images must be smaller than 6 MB to attach.' }])
      return
    }
    setAttachedFileList((prev) => [...prev, ...files])
    e.target.value = ''
  }

  const removeFile = (index) => {
    setAttachedFileList(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row overflow-hidden bg-forge-bg">
      {/* Mobile Header */}
      {/* The room on the left is the app's own menu button, so the header
          starts after it. */}
      <header className="lg:hidden flex items-center justify-between pl-16 pr-4 py-3 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-display font-semibold">VUX AI Chat</h1>
            <p className="text-xs text-forge-textMuted">Chat with VUX AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MemoryMenu memories={memories} onForget={forgetMemories} />
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-forge-success animate-pulse"></div>
            <span className="text-xs text-forge-success">Online</span>
          </div>
          <button className="w-8 h-8 rounded-full bg-gradient-to-br from-forge-primary to-forge-primaryHover flex items-center justify-center text-white font-bold text-sm">
            {username.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Chat Header - Desktop */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-forge-border bg-forge-surface/50 backdrop-blur-sm shrink-0 relative z-20">
          <div>
            <h1 className="text-xl font-display font-semibold">VUX AI Chat</h1>
            <p className="text-sm text-forge-textMuted">Powered by VUX AI - Your intelligent coding companion</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-forge-success animate-pulse"></div>
              <span className="text-sm text-forge-success">VUX AI Online</span>
            </div>

            {/* Memory: what Vux was told to remember */}
            <MemoryMenu memories={memories} onForget={forgetMemories} />

            <button
              onClick={startNewChat}
              className="px-4 py-2 bg-forge-aiLight text-forge-ai rounded-lg hover:bg-forge-ai/20 transition-all"
            >
              New Chat
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overscroll-contain p-4 lg:p-6 space-y-4"
          >
          {messages.map((message, index) => (
            <div key={index} className={`chat-bubble-enter flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-full lg:max-w-2xl ${
                message.role === 'user'
                  ? 'bg-forge-surfaceHigh border border-forge-border rounded-2xl rounded-tr-sm'
                  : 'bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm'
              } p-4`}>
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                    <span className="text-xs text-forge-primary font-medium">VUX AI</span>
                  </div>
                )}
                <div className={`text-sm whitespace-pre-wrap ${message.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user'}`}>{renderMessage(message.content)}</div>
              </div>
            </div>
          ))}

          {/* Streaming Message */}
          {isStreaming && streamingMessage && (
            <div className="chat-bubble-enter flex justify-start">
              <div className="bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                  <span className="text-xs text-forge-primary font-medium">VUX AI</span>
                </div>
                <div className="text-sm whitespace-pre-wrap chat-message-assistant">
                  {renderMessage(streamingMessage)}
                  {isStreaming && <span className="typing-cursor"></span>}
                </div>
              </div>
            </div>
          )}

          {isTyping && !isStreaming && (
            <div className="chat-bubble-enter flex justify-start">
              <div className="bg-forge-surface border border-forge-border rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-forge-primary to-forge-ai flex items-center justify-center text-xs">✨</div>
                  <span className="text-xs text-forge-primary font-medium">VUX AI</span>
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
          </div>

          {/* Jump to the latest message */}
          {!isNearBottom && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <button
                onClick={() => scrollToLatest('smooth')}
                className="jump-to-latest pointer-events-auto"
                aria-label="Jump to the latest message"
              >
                <span aria-hidden="true">↓</span>
                <span>Latest</span>
              </button>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-6 border-t border-forge-border bg-forge-surface/50 backdrop-blur-sm shrink-0">
          {/* Attached Files */}
          {attachedFileList.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachedFileList.map((file, index) => (
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
      <aside className="hidden lg:block w-80 flex-shrink-0 border-l border-forge-border p-4 space-y-4 overflow-y-auto">
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
            <span className="text-forge-primary font-semibold">VUX AI Pro</span>
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
          <div className="panel-slide-in absolute right-0 top-0 h-full w-80 bg-forge-surface border-l border-forge-border p-4 overflow-auto">
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
