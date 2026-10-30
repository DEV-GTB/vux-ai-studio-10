function normalizeUsername(value = 'Guest') {
  const cleaned = String(value || 'Guest').trim();
  return cleaned || 'Guest';
}

function userKeySuffix(value = 'Guest') {
  return normalizeUsername(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'guest';
}

function getScopedStorageKey(key) {
  return `${key}_${userKeySuffix(localStorage.getItem('vux_username'))}`;
}

const state = {
  chatHistory: JSON.parse(localStorage.getItem(getScopedStorageKey('vux_chat')) || '[]'),
  log: JSON.parse(localStorage.getItem(getScopedStorageKey('vux_log')) || '[]'),
  username: normalizeUsername(localStorage.getItem('vux_username')),
  firstMessage: localStorage.getItem(getScopedStorageKey('vux_first_message')) || '',
};

// ---------- Access gate ----------
// Wraps fetch to attach the stored access code (if any) to every /api call.
// If the server ever rejects it, clear the stored code and show the gate
// again rather than silently failing.
function forgeFetch(url, options = {}) {
  const code = localStorage.getItem('vux_access_code');
  const headers = { ...(options.headers || {}) };
  if (code) headers['x-vux-access-code'] = code;
  return fetch(url, { ...options, headers }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem('vux_access_code');
      showAccessGate(true);
    }
    return res;
  });
}

function showAccessGate(showError = false) {
  document.getElementById('access-gate').classList.remove('hidden');
  document.getElementById('access-error').classList.toggle('hidden', !showError);
}

function hideAccessGate() {
  document.getElementById('access-gate').classList.add('hidden');
}

async function initAccessGate() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (!config.requiresAccessCode) return; // gate disabled on the server
    if (localStorage.getItem('vux_access_code')) return; // already have one; fetch will re-prompt if it's wrong
    showAccessGate(false);
  } catch {
    // If /api/config itself fails, don't block the whole app on it.
  }
}

document.getElementById('access-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('access-input');
  localStorage.setItem('vux_access_code', input.value);
  input.value = '';
  hideAccessGate();
});

initAccessGate();

// ---------- User Info ----------
document.getElementById('username-display').textContent = state.username;

// Add first message to chat if it exists
if (state.firstMessage) {
  setTimeout(() => {
    state.chatHistory.push({ role: 'user', content: state.firstMessage });
    renderChat();
    
    const thinking = { role: 'assistant', content: '_thinking..._' };
    state.chatHistory.push(thinking);
    renderChat();

    // Trigger AI response
    sendFirstMessage();
  }, 500);
  
  // Clear the first message after using it
  localStorage.removeItem(getScopedStorageKey('vux_first_message'));
}

async function sendFirstMessage() {
  try {
    const res = await forgeFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chatHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json();
    const thinkingIndex = state.chatHistory.findIndex(m => m.content === '_thinking..._');
    if (thinkingIndex !== -1) {
      const finalText = res.ok ? data.text : `**Error:** ${data.error}`;
      animateAssistantReply(thinkingIndex, finalText);
    }
  } catch (err) {
    const thinkingIndex = state.chatHistory.findIndex(m => m.content === '_thinking..._');
    if (thinkingIndex !== -1) {
      animateAssistantReply(thinkingIndex, `**Error:** ${err.message}`);
    }
  }

  persistUserState();
  renderChat();
  addLogEntry('chat', state.firstMessage.slice(0, 40));
}

// ---------- About modal ----------
const aboutModal = document.getElementById('about-modal');
document.getElementById('about-toggle').addEventListener('click', () => aboutModal.classList.remove('hidden'));
document.getElementById('about-close').addEventListener('click', () => aboutModal.classList.add('hidden'));
aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) aboutModal.classList.add('hidden');
});

const els = {
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  logList: document.getElementById('log-list'),
  clearChat: document.getElementById('clear-chat'),
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function persistUserState() {
  localStorage.setItem(getScopedStorageKey('vux_chat'), JSON.stringify(state.chatHistory));
  localStorage.setItem(getScopedStorageKey('vux_log'), JSON.stringify(state.log));
}

function addLogEntry(type, label) {
  state.log.unshift({ type, label, time: new Date().toLocaleTimeString() });
  state.log = state.log.slice(0, 30);
  persistUserState();
  renderLog();
}

function renderLog() {
  const icons = { chat: '\u2726' };
  els.logList.innerHTML = state.log
    .map(
      (e) =>
        `<div class="log-item"><span class="log-icon">${icons[e.type]}</span><span class="log-label">${escapeHtml(
          e.label
        )}</span><span class="log-time">${e.time}</span></div>`
    )
    .join('');
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

els.chatInput.addEventListener('input', () => autoGrow(els.chatInput));
els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    els.chatForm.requestSubmit();
  }
});

// Clear chat functionality
els.clearChat.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the chat history?')) {
    state.chatHistory = [];
    localStorage.setItem(getScopedStorageKey('vux_chat'), JSON.stringify(state.chatHistory));
    renderChat();
  }
});

// ---------- Chat ----------
function buildTypingChunks(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return [''];

  const sentenceChunks = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentenceChunks.length > 1) {
    return sentenceChunks;
  }

  const words = normalized.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += 6) {
    chunks.push(words.slice(i, i + 6).join(' '));
  }
  return chunks;
}

function animateAssistantReply(messageIndex, fullText) {
  const message = state.chatHistory[messageIndex];
  if (!message) return;

  const chunks = buildTypingChunks(fullText);
  let currentText = '';
  let idx = 0;

  function step() {
    if (idx >= chunks.length) {
      message.content = fullText;
      persistUserState();
      renderChat();
      return;
    }

    currentText += (currentText ? ' ' : '') + chunks[idx];
    idx += 1;
    message.content = currentText;
    renderChat();

    const delay = idx >= chunks.length ? 10 : 20;
    setTimeout(step, delay);
  }

  message.content = '';
  renderChat();
  setTimeout(step, 30);
}

function renderChat() {
  if (state.chatHistory.length === 0) {
    els.chatMessages.innerHTML = `
      <div class="empty-state">
        <div class="empty-badge"><span class="material-symbols-outlined">auto_awesome</span></div>
        <h2>What are we building?</h2>
        <p>Your intelligent workspace for turning ideas into code, solving complex problems, and shipping faster.</p>
        <div class="quick-actions">
          <div class="quick-action"><span class="material-symbols-outlined">code</span>Generate Code</div>
          <div class="quick-action"><span class="material-symbols-outlined">dashboard_customize</span>Build UI</div>
          <div class="quick-action"><span class="material-symbols-outlined">bug_report</span>Debug Code</div>
          <div class="quick-action"><span class="material-symbols-outlined">rocket</span>Launch App</div>
          <div class="quick-action"><span class="material-symbols-outlined">palette</span>Design System</div>
        </div>
      </div>
    `;
    return;
  }

  els.chatMessages.innerHTML = state.chatHistory
    .map(
      (m) =>
        `<div class="msg msg-${m.role}">${
          m.role === 'assistant' ? marked.parse(m.content) : escapeHtml(m.content)
        }</div>`
    )
    .join('');
  
  // Highlight code blocks with better language detection
  els.chatMessages.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
  
  // Add copy button to code blocks
  els.chatMessages.querySelectorAll('pre').forEach((pre) => {
    if (!pre.querySelector('.copy-btn')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        const code = pre.querySelector('code').textContent;
        navigator.clipboard.writeText(code);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
      });
      pre.appendChild(copyBtn);
    }
  });
  
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

els.chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = '';
  autoGrow(els.chatInput);

  state.chatHistory.push({ role: 'user', content: text });
  renderChat();

  const thinking = { role: 'assistant', content: '_thinking..._' };
  state.chatHistory.push(thinking);
  renderChat();

  try {
    const res = await forgeFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.chatHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json();
    const finalText = res.ok ? data.text : `**Error:** ${data.error}`;
    animateAssistantReply(state.chatHistory.length - 1, finalText);
  } catch (err) {
    animateAssistantReply(state.chatHistory.length - 1, `**Error:** ${err.message}`);
  }

  persistUserState();
  renderChat();
  addLogEntry('chat', text.slice(0, 40));
});

renderChat();
renderLog();