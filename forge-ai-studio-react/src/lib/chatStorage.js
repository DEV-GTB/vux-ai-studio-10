// Browser-side chat history for signed-in users.
//
// VUX AI keeps the conversation with the assistant in localStorage so a
// refresh or an accidental reload does not lose the thread. Anonymous visitors
// (no completed sign-in) never get a history written.

const STORAGE_KEY = 'vux_chat_history'
const MAX_STORED_MESSAGES = 200
const WELCOME_CONTENT = "Hello! I'm VUX AI. Your intelligent coding companion. How can I help you build amazing software today?"

function isValidMessage(message) {
  return Boolean(message) && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
}

function hasConversation(messages) {
  return messages.some((message) => message.role === 'user')
}

export function loadChatHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const messages = parsed.filter(isValidMessage).slice(-MAX_STORED_MESSAGES)
    if (!hasConversation(messages)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }

    if (messages[0]?.role !== 'assistant') {
      messages.unshift({ role: 'assistant', content: WELCOME_CONTENT })
    }

    return messages
  } catch {
    return null
  }
}

export function saveChatHistory(messages) {
  try {
    const clean = messages.filter(isValidMessage).slice(-MAX_STORED_MESSAGES)
    if (!hasConversation(clean)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
  } catch {
    // Storage can be unavailable (private mode, quota); the chat just will not persist.
  }
}

export function clearChatHistory() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
