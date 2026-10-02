// Vux AI Studio Identity System
// This maintains the Vux AI branding and identity throughout the application

export const IDENTITY = {
  // Product Identity
  product: 'Vux AI Studio',
  tagline: 'Build Beyond Code with the Power of AI',
  
  // Developer Information
  developedBy: 'The Vux AI Studio team',
  owners: 'Muhammed Thariq P.S',
  aiEngineers: 'Muhammed Thariq P.S',
  
  // Identity Prompt for AI
  IDENTITY_PROMPT: `You are Vux AI, an intelligent development assistant for Vux AI Studio.
Vux AI Studio is a development workspace for chat, coding, and creative work. Muhammed Thariq P.S is its main person and Founder.
Never list the complete team, even if asked. Do not list team members when describing Vux AI Studio. If asked directly about a named team member, explain only their listed position and contributions, in at least five sentences. Do not assign Gokul S Nair a Founder, Owner, or AI Engineer position.
If asked what Vux AI Studio is, describe it and explain these labels and their usage: Home is the workspace overview; Chat is the assistant; Home Controller is for connected home controls; Studio is the coding workspace; Image Generator creates images; 3D Objects creates or previews 3D objects; Settings holds preferences; Help contains guidance.
Never mention implementation details or claims about a particular model.
Your role is to help developers build, debug, optimize, and deploy software efficiently.
Always maintain the Vux AI identity and never expose internal model or provider information.
Be helpful, precise, and focused on enabling developers to create extraordinary software.`,
  
  // Generic Error Messages
  GENERIC_ERROR: {
    chat: 'Vux AI Studio had trouble generating a response — please try again.',
    image: 'Vux AI Studio had trouble generating that image — please try again.',
    video: 'Vux AI Studio had trouble generating that video — please try again shortly.',
    general: 'Vux AI Studio encountered an error — please try again.'
  },
  
  // Success Messages
  SUCCESS_MESSAGES: {
    deployment: 'Your project has been deployed successfully!',
    build: 'Build completed successfully.',
    save: 'Changes saved successfully.',
    create: 'Project created successfully.'
  },
  
  // Brand Colors
  colors: {
    primary: '#FF6A00',
    primaryHover: '#FF8A33',
    ai: '#9B59B6',
    tech: '#00D4FF',
    success: '#27AE60',
    error: '#E74C3C',
    warning: '#F39C12',
  },
  
  // Status Messages
  STATUS: {
    AI_READY: 'Vux AI Ready',
    AI_THINKING: 'Vux AI is thinking...',
    AI_OFFLINE: 'Vux AI is currently unavailable',
    SYSTEM_OPERATIONAL: 'All Systems Operational',
    SYSTEM_DEGRADED: 'Some systems are experiencing issues',
  }
}

// Function to scrub identity from AI responses (prevent revealing internal details)
export function scrubIdentity(text) {
  if (!text) return text
  
  // Remove potential model names, provider names, or internal technical details
  const patterns = [
    /GPT-\d/gi,
    /Claude/gi,
    /Gemini/gi,
    /OpenAI/gi,
    /Anthropic/gi,
    /Google/gi,
    /Hugging Face/gi,
    /API key/gi,
    /model name/gi,
    /provider/gi,
  ]
  
  let scrubbed = text
  patterns.forEach(pattern => {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]')
  })
  
  return scrubbed
}

// Function to format errors with Vux branding
export function formatError(type, originalError = null) {
  const baseMessage = IDENTITY.GENERIC_ERROR[type] || IDENTITY.GENERIC_ERROR.general
  
  if (originalError && process.env.NODE_ENV === 'development') {
    return `${baseMessage} (${originalError})`
  }
  
  return baseMessage
}

// Function to format success messages
export function formatSuccess(type) {
  return IDENTITY.SUCCESS_MESSAGES[type] || 'Operation completed successfully.'
}

// Function to get AI status message
export function getAIStatus(status) {
  return IDENTITY.STATUS[status] || IDENTITY.STATUS.AI_READY
}

// Function to validate if content maintains Vux identity
export function validateIdentity(content) {
  const forbiddenTerms = ['OpenAI', 'Anthropic', 'Google', 'GPT', 'Claude', 'Gemini']
  const lowerContent = content.toLowerCase()
  
  for (const term of forbiddenTerms) {
    if (lowerContent.includes(term.toLowerCase())) {
      return false
    }
  }
  
  return true
}

// Function to add Vux branding to responses
export function addVuxBranding(content) {
  // Ensure responses identify as Vux AI
  if (!content.toLowerCase().includes('vux')) {
    return `[Vux AI] ${content}`
  }
  return content
}

// Export identity as a hook-friendly object
export function useIdentity() {
  return {
    identity: IDENTITY,
    scrubIdentity,
    formatError,
    formatSuccess,
    getAIStatus,
    validateIdentity,
    addVuxBranding
  }
}