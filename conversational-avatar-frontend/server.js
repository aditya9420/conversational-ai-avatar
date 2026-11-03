import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Conversational Avatar Backend',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/health', '/api/chat', '/api/speak', '/api/avatar/status']
  })
})

// Avatar chat endpoint for team connection
app.post('/api/chat', (req, res) => {
  const { message = '', avatar = 'eve' } = req.body
  console.log(`[API /chat] Received request for avatar ${avatar}: "${message}"`)

  // Simulated AI response
  const responses = [
    "Hello! I am Eve, your AI assistant. I'm ready to talk!",
    "That sounds interesting! Tell me more about what you're working on.",
    "I'm listening! How can I assist your team today?",
    "Great question. Let's explore that together!"
  ]
  const reply = responses[Math.floor(Math.random() * responses.length)]

  res.json({
    avatar,
    userMessage: message,
    reply,
    durationMs: 2500,
    timestamp: new Date().toISOString()
  })
})

// Dedicated speech trigger endpoint
app.post('/api/speak', (req, res) => {
  const { text = "Hello" } = req.body
  const durationMs = Math.max(1500, text.length * 80)
  res.json({
    status: 'speaking',
    text,
    durationMs,
    mouthFrames: [1, 2, 3, 2, 1, 0]
  })
})

// Status endpoint
app.get('/api/avatar/status', (req, res) => {
  res.json({
    status: 'ready',
    activeAvatar: 'eve',
    version: '1.0.0'
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Avatar Backend API Server running at http://localhost:${PORT}`)
  console.log(`👉 Team endpoint: http://localhost:${PORT}/api/chat`)
})
