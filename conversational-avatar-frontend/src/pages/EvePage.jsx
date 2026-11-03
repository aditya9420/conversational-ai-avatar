import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './EvePage.css'

/* ── Draw cute & adorable anime eyes ────────────────────────────────── */
function drawEye(ctx, cx, cy, rw, rh, state, lookX, angle = 0) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  const col = '#2d242a'

  if (state === 'closed') {
    ctx.beginPath()
    ctx.moveTo(-rw, 0)
    ctx.quadraticCurveTo(0, rh * 0.50, rw * 0.9, 0)
    ctx.strokeStyle = col
    ctx.lineWidth = Math.max(1.5, rh * 0.30)
    ctx.lineCap = 'round'
    ctx.stroke()

    // Cute outer lash flick
    ctx.beginPath()
    ctx.moveTo(rw * 0.8, 0)
    ctx.lineTo(rw * 1.15, -rh * 0.20)
    ctx.strokeStyle = col
    ctx.lineWidth = Math.max(1.2, rh * 0.22)
    ctx.stroke()

    ctx.restore()
    return
  }

  const openF = state === 'half' ? 0.35 : 1.0

  /* 1. Sclera (Soft warm white) */
  ctx.beginPath()
  ctx.ellipse(0, 0, rw, rh * openF, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#fffcf9'
  ctx.fill()

  /* 2. Iris + Pupil + Cute Catchlights */
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, 0, rw, rh * openF, 0, 0, Math.PI * 2)
  ctx.clip()

  const ix = lookX * rw * 0.16
  const irW = rw * 0.64
  const irH = rh * openF * 0.94

  const g = ctx.createLinearGradient(ix, -irH, ix, irH)
  g.addColorStop(0,    '#1e1420')
  g.addColorStop(0.35, '#3b2538')
  g.addColorStop(0.70, '#5e3c5a')
  g.addColorStop(1.0,  '#482b44')

  ctx.beginPath()
  ctx.ellipse(ix, 0, irW, irH, 0, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()

  // Crisp pupil
  ctx.beginPath()
  ctx.ellipse(ix, -irH * 0.05, irW * 0.44, irH * 0.48, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#0f0a12'
  ctx.fill()

  // Big cute sparkle highlight (Top Left)
  ctx.beginPath()
  ctx.arc(ix - irW * 0.26, -irH * 0.28, irW * 0.28, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Cute small secondary highlight (Bottom Right)
  ctx.beginPath()
  ctx.arc(ix + irW * 0.22, irH * 0.32, irW * 0.16, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.fill()

  ctx.restore()

  /* 3. Upper Eyelid / Eyelash Line */
  ctx.beginPath()
  ctx.moveTo(-rw * 1.02, rh * openF * 0.06)
  ctx.quadraticCurveTo(0, -rh * openF * 1.22, rw * 0.92, -rh * openF * 0.04)
  ctx.strokeStyle = col
  ctx.lineWidth = Math.max(1.6, rh * 0.35)
  ctx.lineCap = 'round'
  ctx.stroke()

  /* Cute outer eyelash flick */
  ctx.beginPath()
  ctx.moveTo(rw * 0.78, -rh * openF * 0.12)
  ctx.quadraticCurveTo(rw * 1.02, -rh * openF * 0.28, rw * 1.20, -rh * openF * 0.08)
  ctx.strokeStyle = col
  ctx.lineWidth = Math.max(1.2, rh * 0.24)
  ctx.lineCap = 'round'
  ctx.stroke()

  /* Half-blink shade */
  if (state === 'half') {
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, 0, rw, rh * openF, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = 'rgba(25, 15, 25, 0.60)'
    ctx.fillRect(-rw, -rh * 2, rw * 2, rh * 2.4)
    ctx.restore()
  }

  ctx.restore()
}

/* ── Draw mouth ───────────────────────────────────── */
function drawMouth(ctx, cx, cy, rw, rh, intensity) {
  ctx.save()
  ctx.translate(cx, cy)

  if (intensity === 0) {
    ctx.beginPath()
    ctx.moveTo(-rw * 0.85, 0)
    ctx.quadraticCurveTo(0, rh * 1.5, rw * 0.85, 0)
    ctx.strokeStyle = '#c4708a'
    ctx.lineWidth = Math.max(1.5, rh * 0.45)
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()
    return
  }

  const openR = [0, 0.4, 0.75, 1.0][intensity]
  const oH    = rh * openR

  /* dark interior */
  ctx.beginPath()
  ctx.moveTo(-rw * 0.85, 0)
  ctx.quadraticCurveTo(-rw * 0.28, -rh * 0.35, 0, -rh * 0.10)
  ctx.quadraticCurveTo( rw * 0.28, -rh * 0.35,  rw * 0.85, 0)
  ctx.quadraticCurveTo( rw * 0.50,  oH * 1.5,   0, oH * 1.8)
  ctx.quadraticCurveTo(-rw * 0.50,  oH * 1.5,  -rw * 0.85, 0)
  ctx.fillStyle = '#7a1530'
  ctx.fill()

  /* teeth (intensity ≥ 2) */
  if (intensity >= 2) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-rw * 0.85, 0)
    ctx.quadraticCurveTo(-rw * 0.28, -rh * 0.35, 0, -rh * 0.10)
    ctx.quadraticCurveTo( rw * 0.28, -rh * 0.35,  rw * 0.85, 0)
    ctx.quadraticCurveTo( rw * 0.50,  oH * 1.5,   0, oH * 1.8)
    ctx.quadraticCurveTo(-rw * 0.50,  oH * 1.5,  -rw * 0.85, 0)
    ctx.clip()
    ctx.fillStyle = 'rgba(255,248,245,0.86)'
    ctx.fillRect(-rw, -rh * 0.16, rw * 2, oH * 0.85)
    ctx.restore()
  }

  /* upper lip */
  ctx.beginPath()
  ctx.moveTo(-rw * 0.85, 0)
  ctx.quadraticCurveTo(-rw * 0.28, -rh * 0.35, 0, -rh * 0.10)
  ctx.quadraticCurveTo( rw * 0.28, -rh * 0.35,  rw * 0.85, 0)
  ctx.quadraticCurveTo(0, rh * 0.25, -rw * 0.85, 0)
  ctx.fillStyle = '#df708a'
  ctx.fill()

  /* outline */
  ctx.beginPath()
  ctx.moveTo(-rw * 0.85, 0)
  ctx.quadraticCurveTo(-rw * 0.28, -rh * 0.35, 0, -rh * 0.10)
  ctx.quadraticCurveTo( rw * 0.28, -rh * 0.35,  rw * 0.85, 0)
  ctx.quadraticCurveTo( rw * 0.50,  oH * 1.5,   0, oH * 1.8)
  ctx.quadraticCurveTo(-rw * 0.50,  oH * 1.5,  -rw * 0.85, 0)
  ctx.strokeStyle = '#c06075'
  ctx.lineWidth = Math.max(1.2, rh * 0.16)
  ctx.stroke()

  ctx.restore()
}

/* ── Viseme to Mouth Intensity Mapper ─────────────── */
function visemeToIntensity(viseme) {
  if (!viseme) return 0
  const shape = (viseme.shape || '').toLowerCase()
  const legacy = (viseme.shape_legacy || '').toUpperCase()

  if (shape === 'viseme_sil' || legacy === 'REST') return 0
  if (['viseme_aa', 'viseme_o', 'viseme_u'].includes(shape) || ['AA', 'O', 'U'].includes(legacy)) return 3
  if (['viseme_ss', 'viseme_ch', 'viseme_rr', 'viseme_e', 'viseme_i'].includes(shape) || ['E', 'I'].includes(legacy)) return 2
  return 1 // consonants
}

/* ══════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════ */
export default function EvePage() {
  const navigate  = useNavigate()
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  // Conversational loop state
  const [inConversation, setInConversation] = useState(false)
  const [convPhase, setConvPhase]           = useState('idle') // 'idle' | 'speaking' | 'listening' | 'thinking'
  const [talking, setTalking]               = useState(false)
  const [statusText, setStatusText]         = useState('')
  const [subtitle, setSubtitle]             = useState(null)
  const [inputText, setInputText]           = useState('')
  const [micLevel, setMicLevel]             = useState(0) // Live visual audio meter (0 to 1)
  const [sessionId, setSessionId]           = useState(null)
  const [chatHistory, setChatHistory]       = useState([]) // Full conversation transcript

  const clock        = useRef(0)
  const eyeState     = useRef('open')
  const mouthInt     = useRef(0)
  const lookX        = useRef(0)
  const offCanvas    = useRef(null)
  const transcriptEndRef = useRef(null)

  const audioRef           = useRef(null)
  const visemesRef         = useRef([])
  const inConversationRef  = useRef(false)
  const sessionIdRef       = useRef(null)

  // Voice Activity Detection (VAD) refs
  const micStreamRef       = useRef(null)
  const audioContextRef    = useRef(null)
  const analyserRef        = useRef(null)
  const audioSourceRef     = useRef(null)
  const mediaRecorderRef   = useRef(null)
  const audioChunksRef     = useRef([])
  const vadAnimRef         = useRef(null)
  const lastVoiceTimeRef   = useRef(0)
  const userHasSpokenRef   = useRef(false)
  const recordStartTimeRef = useRef(0)
  const noiseFloorRef      = useRef(10)
  const speechFramesRef    = useRef(0)
  const speechStartTimeRef = useRef(0)
  const speechPeakRmsRef   = useRef(0.05)
  const turnSubmittingRef  = useRef(false)
  const audioEndSafetyRef  = useRef(null)
  const audioUnlockedRef   = useRef(false)

  // Sync ref with state
  useEffect(() => {
    inConversationRef.current = inConversation
  }, [inConversation])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Auto-scroll transcript when new turns arrive
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory])

  /* ── Load base 1024x1024 image ─── */
  useEffect(() => {
    const img = new Image()
    img.src = '/eve-layers/body.png'
    img.onload = () => {
      const off = document.createElement('canvas')
      off.width  = img.naturalWidth
      off.height = img.naturalHeight
      const ctx  = off.getContext('2d')
      ctx.drawImage(img, 0, 0)

      // 1. Remove pure-white background
      const id = ctx.getImageData(0, 0, off.width, off.height)
      const d  = id.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (r > 248 && g > 248 && b > 248) {
          const w   = (r + g + b) / 3
          const fac = (w - 248) / 7
          d[i + 3]  = Math.round(255 * (1 - fac))
        }
      }
      ctx.putImageData(id, 0, 0)

      // 2. Permanently cover initial painted closed eyes using skin tone (#fae4d7)
      const tilt = -0.14
      const eraseEye = (cx, cy, rx, ry) => {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(tilt)
        ctx.beginPath()
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        ctx.fillStyle = '#fae4d7'
        ctx.fill()
        ctx.restore()
      }
      eraseEye(475, 156, 16.0, 7.5)
      eraseEye(530, 149, 16.0, 7.5)

      offCanvas.current = off
    }
  }, [])

  /* ── Auto-blink ─────────────────────────────────── */
  useEffect(() => {
    const blinkRef = { current: null }
    const doBlink = () => {
      if (eyeState.current === 'open') {
        eyeState.current = 'half'
        setTimeout(() => { eyeState.current = 'closed' }, 65)
        setTimeout(() => { eyeState.current = 'half'   }, 140)
        setTimeout(() => { eyeState.current = 'open'   }, 215)
      }
      blinkRef.current = setTimeout(doBlink, 3000 + Math.random() * 3500)
    }
    blinkRef.current = setTimeout(doBlink, 1800 + Math.random() * 1200)
    return () => clearTimeout(blinkRef.current)
  }, [])

  /* ── Occasional glance ──────────────────────────── */
  useEffect(() => {
    const t = { current: null }
    const go = () => {
      lookX.current = Math.random() > 0.5 ? 0.8 : -0.8
      setTimeout(() => { lookX.current = 0 }, 700 + Math.random() * 500)
      t.current = setTimeout(go, 5000 + Math.random() * 5000)
    }
    t.current = setTimeout(go, 3500)
    return () => clearTimeout(t.current)
  }, [])

  /* ── Prime/Unlock Audio on User Click ── */
  const unlockAudio = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {})
    }
    const audio = audioRef.current
    if (audio) {
      audio.muted = false
      audio.volume = 1.0
    }
    if (!audioUnlockedRef.current) {
      try {
        const dummy = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
        dummy.volume = 0.01
        dummy.play().then(() => {
          audioUnlockedRef.current = true
        }).catch(() => {})
      } catch (e) {}
    }
  }

  /* ── Start Auto-Listening with Dynamic Voice Activity Detection (VAD) ── */
  const startAutoListen = useCallback(async () => {
    if (!inConversationRef.current) return

    turnSubmittingRef.current = false
    setConvPhase('listening')
    setStatusText('Listening... (speak naturally)')
    userHasSpokenRef.current = false
    speechFramesRef.current = 0
    speechStartTimeRef.current = 0
    lastVoiceTimeRef.current = Date.now()
    recordStartTimeRef.current = Date.now()
    audioChunksRef.current = []
    noiseFloorRef.current = 0.008
    speechPeakRmsRef.current = 0.05

    // Cancel any previous VAD frame loop
    if (vadAnimRef.current) {
      cancelAnimationFrame(vadAnimRef.current)
      vadAnimRef.current = null
    }

    // Stop and unhook previous recorder if any
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.ondataavailable = null
        mediaRecorderRef.current.onstop = null
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch (e) {}
    }

    try {
      // 1. Ensure microphone stream is active and alive
      const tracks = micStreamRef.current ? micStreamRef.current.getAudioTracks() : []
      const isStreamAlive = micStreamRef.current && micStreamRef.current.active && tracks.some(t => t.readyState === 'live')

      if (!isStreamAlive) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        if (audioSourceRef.current) {
          try { audioSourceRef.current.disconnect() } catch (e) {}
          audioSourceRef.current = null
        }
      }

      // 2. AudioContext + Analyser for VAD monitoring
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx()
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      if (!analyserRef.current) {
        const analyser = audioContextRef.current.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.2
        analyserRef.current = analyser
      }

      // High-pass filter cuts off desk vibration, AC hum, and fan rumble (<120Hz)
      if (!audioSourceRef.current) {
        const srcNode = audioContextRef.current.createMediaStreamSource(micStreamRef.current)
        const filter = audioContextRef.current.createBiquadFilter()
        filter.type = 'highpass'
        filter.frequency.value = 120
        srcNode.connect(filter)
        filter.connect(analyserRef.current)
        audioSourceRef.current = srcNode
      }

      // 3. MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4')

      const recorder = new MediaRecorder(micStreamRef.current, { mimeType })
      mediaRecorderRef.current = recorder

      // Collect all chunks cleanly without shifting to guarantee valid WebM EBML headers
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        if (vadAnimRef.current) {
          cancelAnimationFrame(vadAnimRef.current)
          vadAnimRef.current = null
        }
        setMicLevel(0)

        if (!inConversationRef.current) return
        if (turnSubmittingRef.current) return
        turnSubmittingRef.current = true

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })

        // If user didn't speak or empty blob, seamlessly refresh listening session
        if (!userHasSpokenRef.current || audioBlob.size < 400) {
          console.log('[EvePage] No speech turn to submit, continuing to listen...')
          turnSubmittingRef.current = false
          setTimeout(() => {
            if (inConversationRef.current) startAutoListen()
          }, 100)
          return
        }

        // Send user speech directly to model
        setConvPhase('thinking')
        setStatusText('Eve is thinking...')
        const user = JSON.parse(sessionStorage.getItem('user') || '{}')
        const formData = new FormData()
        formData.append('file', audioBlob, 'speech.webm')
        formData.append('avatar', 'eve')
        if (sessionIdRef.current) formData.append('session_id', sessionIdRef.current)
        if (user.user_id) formData.append('user_id', user.user_id)

        try {
          const res = await fetch('/api/chat/voice', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) throw new Error(`HTTP error ${res.status}`)
          const data = await res.json()
          console.log('[EvePage] Voice turn response:', data)

          if (data.session_id) {
            sessionIdRef.current = data.session_id
            setSessionId(data.session_id)
          }

          const userText = data.user_transcript || data.user_message || data.userMessage || ''
          const replyText = data.reply_text || data.reply || ''

          if (!replyText) {
            console.log('[EvePage] Blank speech response, resuming listening...')
            setStatusText('Listening... (speak naturally)')
            turnSubmittingRef.current = false
            setTimeout(() => {
              if (inConversationRef.current) startAutoListen()
            }, 250)
            return
          }

          if (userText && userText !== '(no speech detected)') {
            setSubtitle({ role: 'user', text: userText })
            setChatHistory(prev => [...prev, { role: 'user', text: userText, time: new Date() }])
          }
          if (replyText) {
            setTimeout(() => {
              setSubtitle({ role: 'eve', text: replyText })
            }, 100)
            setChatHistory(prev => [...prev, { role: 'eve', text: replyText, time: new Date() }])
            setStatusText('')
            turnSubmittingRef.current = false
            playTurnAudio(data.audio_url, data.audio_base64, data.visemes, data.durationMs || data.audio_duration_ms)
          }
        } catch (err) {
          console.warn('[EvePage] Voice turn error:', err)
          setStatusText('Connection error. Listening again...')
          turnSubmittingRef.current = false
          setTimeout(() => {
            if (inConversationRef.current) startAutoListen()
          }, 1000)
        }
      }

      recorder.start(100)

      // 4. Real-time Time-Domain RMS Voice Activity Detection (VAD)
      const timeData = new Float32Array(analyserRef.current.fftSize)

      const checkVAD = () => {
        if (!inConversationRef.current || mediaRecorderRef.current?.state !== 'recording') {
          return
        }

        analyserRef.current.getFloatTimeDomainData(timeData)

        // Compute true RMS energy of audio buffer
        let sumSq = 0
        for (let i = 0; i < timeData.length; i++) {
          sumSq += timeData[i] * timeData[i]
        }
        const rms = Math.sqrt(sumSq / timeData.length)

        // Visual meter (scale 0 - 0.12 to 0 - 1)
        const norm = Math.min(1, Math.max(0, rms / 0.12))
        setMicLevel(norm)

        const now = Date.now()

        if (!userHasSpokenRef.current) {
          // Adaptively track ambient background room floor
          noiseFloorRef.current = noiseFloorRef.current * 0.94 + rms * 0.06

          // Speech onset threshold: human speech rises distinctly above ambient
          const speechOnsetThreshold = Math.max(0.018, noiseFloorRef.current * 2.0)
          if (rms > speechOnsetThreshold) {
            speechFramesRef.current += 1
            if (speechFramesRef.current >= 2) {
              userHasSpokenRef.current = true
              speechStartTimeRef.current = now
              lastVoiceTimeRef.current = now
              speechPeakRmsRef.current = Math.max(0.035, rms)
              setStatusText('Listening to you...')
            }
          } else {
            speechFramesRef.current = Math.max(0, speechFramesRef.current - 1)
          }

          // Recycle recorder after 45s of complete silence
          if (now - recordStartTimeRef.current > 45000) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
            return
          }
        } else {
          // User is actively speaking: track peak vocal level
          if (rms > speechPeakRmsRef.current) {
            speechPeakRmsRef.current = rms
          }

          // Dynamic silence threshold: user is quiet when energy drops below 26% of peak voice
          const silenceThreshold = Math.max(0.012, noiseFloorRef.current * 1.35, speechPeakRmsRef.current * 0.26)

          if (rms > silenceThreshold) {
            lastVoiceTimeRef.current = now
          }

          const silenceMs = now - lastVoiceTimeRef.current
          const speechDuration = now - speechStartTimeRef.current

          // Natural conversational pause: 750ms silence automatically sends turn!
          if (silenceMs >= 750) {
            console.log('[EvePage] User finished speaking (750ms silence). Automatically sending audio!')
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
            return
          }

          // Safety limit for continuous speech: 25s
          if (speechDuration >= 25000) {
            console.log('[EvePage] Max continuous speech duration reached (25s). Sending audio!')
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
            return
          }
        }

        vadAnimRef.current = requestAnimationFrame(checkVAD)
      }

      vadAnimRef.current = requestAnimationFrame(checkVAD)
    } catch (err) {
      console.warn('[EvePage] Failed to start auto-listening:', err)
      setStatusText('Microphone permission required for Conversation Mode.')
      setInConversation(false)
      inConversationRef.current = false
      setConvPhase('idle')
    }
  }, [])

  /* ── Play Speech Audio with Full Viseme Lip-Sync ── */
  const playTurnAudio = useCallback((audioUrl, audioBase64, visemes, expectedDurationMs = 3000) => {
    visemesRef.current = visemes || []
    const audio = audioRef.current
    if (!audio) return

    setConvPhase('speaking')
    audio.muted = false
    audio.volume = 1.0

    if (audioEndSafetyRef.current) {
      clearTimeout(audioEndSafetyRef.current)
      audioEndSafetyRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {})
    }

    // Prefer fast, standard HTTP streaming URL with fallback to base64
    const primarySrc = audioUrl || audioBase64
    const fallbackSrc = audioBase64 || audioUrl
    if (!primarySrc) {
      console.warn('[EvePage] No audio source provided, resuming listen mode...')
      setTimeout(() => {
        if (inConversationRef.current) startAutoListen()
      }, 1500)
      return
    }

    // Safety timeout: if audio element drops the 'ended' event, recover automatically
    const safetyMs = Math.max(6000, Number(expectedDurationMs) + 4000)
    audioEndSafetyRef.current = setTimeout(() => {
      console.warn('[EvePage] Audio end safety timeout triggered after', safetyMs, 'ms')
      handleAudioEnded()
    }, safetyMs)

    const startPlay = (src, isFallback = false) => {
      try {
        audio.src = src

        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[EvePage] Audio playback active (source:', isFallback ? 'fallback' : 'primary', ')')
              setTalking(true)
            })
            .catch(err => {
              console.warn('[EvePage] Audio play error:', err.name, err.message)
              if (err.name === 'AbortError' && !isFallback) {
                console.log('[EvePage] Play interrupted; retrying...')
                setTimeout(() => startPlay(src, true), 100)
                return
              }
              if (!isFallback && fallbackSrc && fallbackSrc !== src) {
                console.log('[EvePage] Attempting fallback audio source...')
                setTimeout(() => startPlay(fallbackSrc, true), 150)
              } else {
                console.error('[EvePage] Both audio sources failed. Resuming listening.')
                setTimeout(() => handleAudioEnded(), 500)
              }
            })
        }
      } catch (e) {
        console.warn('[EvePage] Play invocation error:', e)
        if (!isFallback && fallbackSrc && fallbackSrc !== src) {
          startPlay(fallbackSrc, true)
        } else {
          handleAudioEnded()
        }
      }
    }

    startPlay(primarySrc, false)
  }, [startAutoListen])

  /* ── When Audio Finishes Playing: Automatically Listen! ── */
  const handleAudioEnded = useCallback(() => {
    if (audioEndSafetyRef.current) {
      clearTimeout(audioEndSafetyRef.current)
      audioEndSafetyRef.current = null
    }
    setTalking(false)
    mouthInt.current = 0

    // Clear the oncanplaythrough handler to prevent stale callbacks
    if (audioRef.current) {
      audioRef.current.oncanplaythrough = null
    }

    if (inConversationRef.current) {
      // 550ms natural pause before mic turns on to prevent speaker audio echo
      setTimeout(() => {
        if (inConversationRef.current) {
          startAutoListen()
        }
      }, 550)
    } else {
      setConvPhase('idle')
    }
  }, [startAutoListen])

  /* ── Manual Done Speaking Button (Skip silence pause) ── */
  const handleDoneSpeaking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      userHasSpokenRef.current = true
      speechStartTimeRef.current = speechStartTimeRef.current || Date.now()
      mediaRecorderRef.current.stop()
    }
  }

  /* ── Toggle Conversation Mode (Like ChatGPT / Gemini Live) ── */
  const handleToggleConversation = () => {
    unlockAudio()

    if (inConversation) {
      // Stop conversation mode
      inConversationRef.current = false
      setInConversation(false)
      setConvPhase('idle')
      setStatusText('')
      setMicLevel(0)
      turnSubmittingRef.current = false

      if (audioEndSafetyRef.current) {
        clearTimeout(audioEndSafetyRef.current)
        audioEndSafetyRef.current = null
      }
      if (vadAnimRef.current) {
        cancelAnimationFrame(vadAnimRef.current)
        vadAnimRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch (e) {}
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setTalking(false)
      mouthInt.current = 0
      return
    }

    // Start conversation mode
    inConversationRef.current = true
    setInConversation(true)
    setConvPhase('speaking')
    setStatusText('Eve is connecting...')
    turnSubmittingRef.current = false

    // Send greeting to kick off the conversation loop
    sendTextMessage("Hello Eve! I'm starting our conversation.")
  }

  /* ── Send Text Message ── */
  const sendTextMessage = async (textToSend) => {
    unlockAudio()
    const text = (textToSend || inputText).trim()
    if (!text) return

    setInputText('')
    setConvPhase('thinking')
    setStatusText('Eve is thinking...')
    setSubtitle({ role: 'user', text })
    setChatHistory(prev => [...prev, { role: 'user', text, time: new Date() }])

    const user = JSON.parse(sessionStorage.getItem('user') || '{}')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          avatar: 'eve',
          session_id: sessionIdRef.current || null,
          user_id: user.user_id || null,
        }),
      })

      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const data = await res.json()
      console.log('[EvePage] /api/chat response:', data)

      if (data.session_id) {
        sessionIdRef.current = data.session_id
        setSessionId(data.session_id)
      }
      const replyText = data.reply_text || data.reply || ''
      if (replyText) {
        setSubtitle({ role: 'eve', text: replyText })
        setChatHistory(prev => [...prev, { role: 'eve', text: replyText, time: new Date() }])
        setStatusText('')
        playTurnAudio(data.audio_url, data.audio_base64, data.visemes, data.durationMs || data.audio_duration_ms)
      }
    } catch (err) {
      console.warn('[EvePage] Send message error:', err)
      setStatusText('Connection error. Please check if backend is running.')
      setConvPhase('idle')
    }
  }

  /* ── Canvas render loop with Viseme Synchronization ─── */
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) { animRef.current = requestAnimationFrame(render); return }
    const off = offCanvas.current
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height
    clock.current += 0.016

    // Lip-sync: check active audio playback time against visemes timeline
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) {
      const curTimeMs = audioRef.current.currentTime * 1000
      const active = visemesRef.current.find(
        v => curTimeMs >= v.time_ms && curTimeMs < (v.time_ms + (v.duration_ms || 80))
      )
      mouthInt.current = active ? visemeToIntensity(active) : 0
    } else {
      mouthInt.current = 0
    }

    ctx.clearRect(0, 0, W, H)

    if (off) {
      /* Frame BIG half-body avatar */
      const aspect = off.width / off.height
      const drawH  = H * 1.75
      const drawW  = drawH * aspect
      const drawX  = (W - drawW) / 2
      const drawY  = 0

      /* Idle breathing */
      const breathY = Math.sin(clock.current * 0.72) * 4
      const swayX   = Math.sin(clock.current * 0.40) * 1.5

      ctx.save()
      ctx.translate(drawX + swayX, drawY + breathY)
      ctx.scale(drawW / 1024, drawH / 1024)

      // 1. Draw base body image
      ctx.drawImage(off, 0, 0, 1024, 1024)

      // 2. Render animated eyes & lips naturally on face
      const tilt = -0.14
      drawEye(ctx, 476, 152, 10.5, 6.6, eyeState.current, lookX.current, tilt)
      drawEye(ctx, 531, 145, 10.5, 6.6, eyeState.current, lookX.current, tilt)
      drawMouth(ctx, 505, 184, 14.0, 8.0, mouthInt.current)

      ctx.restore()
    }

    animRef.current = requestAnimationFrame(render)
  }, [])

  /* ── Setup canvas & cleanup (Mount / Unmount only) ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)
    animRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      if (vadAnimRef.current) cancelAnimationFrame(vadAnimRef.current)
      if (audioRef.current) audioRef.current.pause()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch (e) {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const handleDropdown = (e) => {
    if (e.target.value === 'steve') navigate('/chat/steve')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      sendTextMessage()
    }
  }

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
        .then(() => setTalking(true))
        .catch(err => console.warn('Replay failed:', err))
    }
  }

  return (
    <div className="eve-page">
      {/* ── Background ── */}
      <div className="eve-bg" />
      <div className="eve-bg-glow-top" />

      {/* ── Avatar canvas ── */}
      <canvas ref={canvasRef} className="eve-canvas" />

      {/* ── Active Background DOM Audio Element (no display:none to prevent browser audio throttling) ── */}
      <audio
        ref={audioRef}
        className="hidden-audio-player"
        preload="auto"
        playsInline
        onPlay={() => setTalking(true)}
        onEnded={handleAudioEnded}
        onError={(e) => {
          console.warn('[EvePage] Audio element warning:', e.target?.error?.code, e.target?.error?.message)
        }}
      />

      {/* ── Top nav ── */}
      <div className="chat-topbar">
        <button className="back-btn" onClick={() => navigate('/select')}>← Back</button>
        <select
          id="avatar-switcher"
          className="avatar-select-dropdown"
          value="eve"
          onChange={handleDropdown}
        >
          <option value="eve">Chat with Eve</option>
          <option value="steve">Chat with Steve</option>
        </select>
      </div>

      {/* ── Subtitle / Speech Bubble ── */}
      {subtitle && (
        <div className="subtitle-bubble">
          <div className="subtitle-header-row">
            <span className="subtitle-speaker">{subtitle.role === 'eve' ? 'Eve' : 'You'}</span>
            {subtitle.role === 'eve' && (
              <button
                className="replay-speech-btn"
                type="button"
                onClick={handleReplay}
                title="Replay voice audio"
              >
                🔊 Replay Voice
              </button>
            )}
          </div>
          <div>{subtitle.text}</div>
        </div>
      )}

      {/* ── Modern Dynamic Conversation Capsule (ChatGPT / Gemini style) ── */}
      {inConversation && (
        <div className={`conv-status-capsule phase-${convPhase}`}>
          {convPhase === 'listening' && (
            <div className="listening-visualizer">
              <span className="live-mic-pulse" style={{ transform: `scale(${1 + micLevel * 0.7})` }}>
                🎙️
              </span>
              <span className="capsule-text">Listening... Speak now</span>
              <button
                className="capsule-done-btn"
                type="button"
                onClick={handleDoneSpeaking}
                title="Done speaking, submit now"
              >
                Done Speaking →
              </button>
            </div>
          )}

          {convPhase === 'thinking' && (
            <div className="thinking-visualizer">
              <span className="dot" /><span className="dot" /><span className="dot" />
              <span className="capsule-text">Eve is thinking...</span>
            </div>
          )}

          {convPhase === 'speaking' && (
            <div className="speaking-visualizer">
              <div className="sound-wave-bars">
                <span className="bar" /><span className="bar" /><span className="bar" /><span className="bar" />
              </div>
              <span className="capsule-text">Eve is speaking...</span>
            </div>
          )}
        </div>
      )}

      {/* Status indicator when not in conversation mode */}
      {!inConversation && statusText && (
        <div className="talking-indicator">
          <span className="status-label">{statusText}</span>
        </div>
      )}

      {/* ── Bottom Controls ── */}
      <div className="chat-controls-container">
        {/* Main Conversation Mode Button */}
        <button
          id="conversation-mode-btn"
          className={`conversation-toggle-btn${inConversation ? ' active' : ''}`}
          type="button"
          onClick={handleToggleConversation}
        >
          {inConversation ? (
            <>
              <span className="btn-icon">✕</span>
              <span>End Conversation</span>
            </>
          ) : (
            <>
              <span className="btn-icon">✨</span>
              <span>Start Conversation Mode</span>
            </>
          )}
        </button>

        {/* Text Input Row for typing optionally */}
        <div className="chat-input-row">
          <input
            id="chat-message-input"
            className="chat-text-input"
            type="text"
            placeholder={inConversation ? "Or type a message to Eve..." : "Type a message, or click Start Conversation above..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            id="send-message-btn"
            className="action-icon-btn"
            type="button"
            title="Send Message"
            onClick={() => sendTextMessage()}
            disabled={!inputText.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Conversation Transcript Panel ── */}
      {chatHistory.length > 0 && (
        <div className="transcript-panel">
          <div className="transcript-header">
            <span className="transcript-title">💬 Transcript</span>
            <button
              className="transcript-clear-btn"
              type="button"
              onClick={() => setChatHistory([])}
              title="Clear transcript"
            >
              ✕
            </button>
          </div>
          <div className="transcript-messages">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`transcript-msg transcript-msg-${msg.role}`}>
                <span className="transcript-msg-role">{msg.role === 'eve' ? 'Eve' : 'You'}</span>
                <span className="transcript-msg-text">{msg.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      <div className="bottom-handle" />
    </div>
  )
}
