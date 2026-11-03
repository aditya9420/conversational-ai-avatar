import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './StevePage.css'

export default function StevePage() {
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
  const [micLevel, setMicLevel]             = useState(0)
  const [sessionId, setSessionId]           = useState(null)
  const [chatHistory, setChatHistory]       = useState([]) // Full conversation transcript

  const audioRef           = useRef(null)
  const inConversationRef  = useRef(false)
  const sessionIdRef       = useRef(null)
  const transcriptEndRef   = useRef(null)

  // VAD refs
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

  /* ── Blue aura canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    let t = 0
    const particles = Array.from({ length: 55 }, () => ({
      angle:    Math.random() * Math.PI * 2,
      baseR:    130 + Math.random() * 55,
      speed:    0.0012 + Math.random() * 0.003,
      size:     0.7 + Math.random() * 2.2,
      alpha:    0.12 + Math.random() * 0.55,
      alphaSpd: 0.003 + Math.random() * 0.007,
      alphaDir: Math.random() > 0.5 ? 1 : -1,
      color:    Math.random() > 0.5 ? '255,255,255' : '120,190,255',
    }))

    const draw = () => {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      t += 0.011
      const cx = w / 2
      const cy = h * 0.38

      for (let i = 4; i >= 0; i--) {
        const r     = 105 + i * 18 + Math.sin(t + i * 0.9) * 8
        const alpha = (0.06 - i * 0.01) + Math.sin(t * 0.6 + i) * 0.02
        const g     = ctx.createRadialGradient(cx, cy, r - 14, cx, cy, r + 14)
        g.addColorStop(0,   'rgba(255,255,255,0)')
        g.addColorStop(0.5, `rgba(100,180,255,${alpha})`)
        g.addColorStop(1,   'rgba(255,255,255,0)')
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = g; ctx.lineWidth = 18; ctx.stroke()
      }

      ctx.save()
      ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(30,136,229,0.6)'
      ctx.beginPath(); ctx.arc(cx, cy, 115 + Math.sin(t * 1.05) * 5, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + Math.sin(t) * 0.07})`
      ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore()

      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.25); ctx.setLineDash([8, 18])
      ctx.beginPath(); ctx.arc(0, 0, 132, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(120,190,255,${0.09 + Math.sin(t) * 0.03})`
      ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore()

      particles.forEach(p => {
        p.angle += p.speed; p.alpha += p.alphaSpd * p.alphaDir
        if (p.alpha > 0.82 || p.alpha < 0.04) p.alphaDir *= -1
        const wobble = Math.sin(p.angle * 2.4 + t) * 14
        const r = p.baseR + wobble
        const x = cx + Math.cos(p.angle) * r
        const y = cy + Math.sin(p.angle) * r * 0.7
        ctx.save(); ctx.shadowBlur = 6; ctx.shadowColor = `rgba(${p.color},0.65)`
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`; ctx.fill(); ctx.restore()
      })

      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize) }
  }, [])

  /* ── Unlock audio on user interaction ── */
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

    if (vadAnimRef.current) {
      cancelAnimationFrame(vadAnimRef.current)
      vadAnimRef.current = null
    }

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
          console.log('[StevePage] No speech turn to submit, continuing to listen...')
          turnSubmittingRef.current = false
          setTimeout(() => {
            if (inConversationRef.current) startAutoListen()
          }, 100)
          return
        }

        setConvPhase('thinking')
        setStatusText('Steve is thinking...')
        const user = JSON.parse(sessionStorage.getItem('user') || '{}')
        const formData = new FormData()
        formData.append('file', audioBlob, 'speech.webm')
        formData.append('avatar', 'steve')
        formData.append('voice', 'en-US-GuyNeural')
        if (sessionIdRef.current) formData.append('session_id', sessionIdRef.current)
        if (user.user_id) formData.append('user_id', user.user_id)

        try {
          const res = await fetch('/api/chat/voice', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) throw new Error(`HTTP error ${res.status}`)
          const data = await res.json()
          console.log('[StevePage] Voice turn response:', data)

          if (data.session_id) {
            sessionIdRef.current = data.session_id
            setSessionId(data.session_id)
          }

          const userText = data.user_transcript || data.user_message || data.userMessage || ''
          const replyText = data.reply_text || data.reply || ''

          if (!replyText) {
            console.log('[StevePage] Blank speech response, resuming listening...')
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
              setSubtitle({ role: 'steve', text: replyText })
            }, 100)
            setChatHistory(prev => [...prev, { role: 'steve', text: replyText, time: new Date() }])
            setStatusText('')
            turnSubmittingRef.current = false
            playTurnAudio(data.audio_url, data.audio_base64, data.durationMs || data.audio_duration_ms)
          }
        } catch (err) {
          console.warn('[StevePage] Voice error:', err)
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
            console.log('[StevePage] User finished speaking (750ms silence). Automatically sending audio!')
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
            return
          }

          // Safety limit for continuous speech: 25s
          if (speechDuration >= 25000) {
            console.log('[StevePage] Max continuous speech duration reached (25s). Sending audio!')
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
      console.warn('[StevePage] Failed to start auto-listening:', err)
      setStatusText('Microphone permission required for Conversation Mode.')
      setInConversation(false)
      inConversationRef.current = false
      setConvPhase('idle')
    }
  }, [])

  /* ── Play Speech Audio ── */
  const playTurnAudio = useCallback((audioUrl, audioBase64, expectedDurationMs = 3000) => {
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

    const primarySrc = audioUrl || audioBase64
    const fallbackSrc = audioBase64 || audioUrl
    if (!primarySrc) {
      console.warn('[StevePage] No audio source provided, resuming listen mode...')
      setTimeout(() => {
        if (inConversationRef.current) startAutoListen()
      }, 1500)
      return
    }

    const safetyMs = Math.max(6000, Number(expectedDurationMs) + 4000)
    audioEndSafetyRef.current = setTimeout(() => {
      console.warn('[StevePage] Audio end safety timeout triggered after', safetyMs, 'ms')
      handleAudioEnded()
    }, safetyMs)

    const startPlay = (src, isFallback = false) => {
      try {
        audio.src = src

        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[StevePage] Audio playback active (source:', isFallback ? 'fallback' : 'primary', ')')
              setTalking(true)
            })
            .catch(err => {
              console.warn('[StevePage] Audio play error:', err.name, err.message)
              if (err.name === 'AbortError' && !isFallback) {
                console.log('[StevePage] Play interrupted; retrying...')
                setTimeout(() => startPlay(src, true), 100)
                return
              }
              if (!isFallback && fallbackSrc && fallbackSrc !== src) {
                console.log('[StevePage] Attempting fallback audio source...')
                setTimeout(() => startPlay(fallbackSrc, true), 150)
              } else {
                console.error('[StevePage] Both audio sources failed. Resuming listening.')
                setTimeout(() => handleAudioEnded(), 500)
              }
            })
        }
      } catch (e) {
        console.warn('[StevePage] Play invocation error:', e)
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

    if (audioRef.current) {
      audioRef.current.oncanplaythrough = null
    }

    if (inConversationRef.current) {
      setTimeout(() => {
        if (inConversationRef.current) {
          startAutoListen()
        }
      }, 550)
    } else {
      setConvPhase('idle')
    }
  }, [startAutoListen])

  /* ── Manual Done Speaking Button ── */
  const handleDoneSpeaking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      userHasSpokenRef.current = true
      speechStartTimeRef.current = speechStartTimeRef.current || Date.now()
      mediaRecorderRef.current.stop()
    }
  }

  /* ── Toggle Conversation Mode ── */
  const handleToggleConversation = () => {
    unlockAudio()

    if (inConversation) {
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
      return
    }

    inConversationRef.current = true
    setInConversation(true)
    setConvPhase('speaking')
    setStatusText('Steve is connecting...')
    turnSubmittingRef.current = false

    sendTextMessage("Hello Steve! I'm starting our conversation.")
  }

  /* ── Send Message ── */
  const sendTextMessage = async (textToSend) => {
    unlockAudio()
    const text = (textToSend || inputText).trim()
    if (!text) return

    setInputText('')
    setConvPhase('thinking')
    setStatusText('Steve is analyzing...')
    setSubtitle({ role: 'user', text })
    setChatHistory(prev => [...prev, { role: 'user', text, time: new Date() }])

    const user = JSON.parse(sessionStorage.getItem('user') || '{}')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          avatar: 'steve',
          voice: 'en-US-GuyNeural',
          session_id: sessionIdRef.current || null,
          user_id: user.user_id || null,
        }),
      })

      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const data = await res.json()
      console.log('[StevePage] /api/chat response:', data)

      if (data.session_id) {
        sessionIdRef.current = data.session_id
        setSessionId(data.session_id)
      }
      const replyText = data.reply_text || data.reply || ''
      if (replyText) {
        setSubtitle({ role: 'steve', text: replyText })
        setChatHistory(prev => [...prev, { role: 'steve', text: replyText, time: new Date() }])
        setStatusText('')
        playTurnAudio(data.audio_url, data.audio_base64, data.durationMs || data.audio_duration_ms)
      }
    } catch (err) {
      console.warn('[StevePage] Chat error:', err)
      setStatusText('Connection error. Please check if backend is running.')
      setConvPhase('idle')
    }
  }

  useEffect(() => {
    return () => {
      if (audioEndSafetyRef.current) clearTimeout(audioEndSafetyRef.current)
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
    if (e.target.value === 'eve') navigate('/chat/eve')
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
    <div className="steve-page">
      {/* Background */}
      <div className="steve-bg" />
      <div className="steve-bg-glow-top" />
      <div className="steve-bg-glow-bl" />
      <div className="steve-bg-glow-br" />

      {/* Aura */}
      <canvas ref={canvasRef} className="steve-aura-canvas" />

      {/* Active Background DOM Audio Element (no display:none to prevent browser audio throttling) */}
      <audio
        ref={audioRef}
        className="hidden-audio-player"
        preload="auto"
        playsInline
        onPlay={() => setTalking(true)}
        onEnded={handleAudioEnded}
        onError={(e) => {
          console.warn('[StevePage] Audio element warning:', e.target?.error?.code, e.target?.error?.message)
        }}
      />

      {/* Top-right controls */}
      <div className="chat-topbar">
        <button className="back-btn" onClick={() => navigate('/select')}>← Back</button>
        <select
          id="avatar-switcher-steve"
          className="avatar-select-dropdown"
          value="steve"
          onChange={handleDropdown}
        >
          <option value="eve">Chat with Eve</option>
          <option value="steve">Chat with Steve</option>
        </select>
      </div>

      {/* Main Content */}
      <main className="steve-main">
        {/* Steve avatar */}
        <div className={`steve-avatar-wrap${talking ? ' talking' : ''}`}>
          <div className="steve-avatar-circle" />
        </div>

        {/* Subtitle / Speech Bubble */}
        {subtitle && (
          <div className="subtitle-bubble-steve">
            <div className="subtitle-header-row-steve">
              <span className="subtitle-speaker-steve">{subtitle.role === 'steve' ? 'Steve' : 'You'}</span>
              {subtitle.role === 'steve' && (
                <button
                  className="replay-speech-btn-steve"
                  type="button"
                  onClick={handleReplay}
                  title="Replay Steve's voice"
                >
                  🔊 Replay Voice
                </button>
              )}
            </div>
            <div>{subtitle.text}</div>
          </div>
        )}

        {/* Dynamic Conversation Capsule (ChatGPT / Gemini Live style) */}
        {inConversation && (
          <div className={`conv-status-capsule-steve phase-${convPhase}`}>
            {convPhase === 'listening' && (
              <div className="listening-visualizer">
                <span className="live-mic-pulse" style={{ transform: `scale(${1 + micLevel * 0.7})` }}>
                  🎙️
                </span>
                <span className="capsule-text">Listening... Speak now</span>
                <button
                  className="capsule-done-btn-steve"
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
                <span className="capsule-text">Steve is analyzing...</span>
              </div>
            )}

            {convPhase === 'speaking' && (
              <div className="speaking-visualizer">
                <div className="sound-wave-bars-steve">
                  <span className="bar" /><span className="bar" /><span className="bar" /><span className="bar" />
                </div>
                <span className="capsule-text">Steve is speaking...</span>
              </div>
            )}
          </div>
        )}

        {/* Status indicator when not in conversation mode */}
        {!inConversation && statusText && (
          <div className="talking-indicator">
            <span className="status-label-steve">{statusText}</span>
          </div>
        )}

        {/* Conversational Controls */}
        <div className="chat-controls-container-steve">
          {/* Main Conversation Mode Button */}
          <button
            id="conversation-mode-btn-steve"
            className={`conversation-toggle-btn-steve${inConversation ? ' active' : ''}`}
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

          {/* Text Input Row */}
          <div className="chat-input-row-steve">
            <input
              id="chat-message-input-steve"
              className="chat-text-input-steve"
              type="text"
              placeholder={inConversation ? "Or type a message to Steve..." : "Type a message, or click Start Conversation above..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            <button
              id="send-message-btn-steve"
              className="action-icon-btn-steve"
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
      </main>

      {/* ── Conversation Transcript Panel ── */}
      {chatHistory.length > 0 && (
        <div className="transcript-panel-steve">
          <div className="transcript-header-steve">
            <span className="transcript-title-steve">💬 Transcript</span>
            <button
              className="transcript-clear-btn-steve"
              type="button"
              onClick={() => setChatHistory([])}
              title="Clear transcript"
            >
              ✕
            </button>
          </div>
          <div className="transcript-messages-steve">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`transcript-msg-steve transcript-msg-${msg.role}`}>
                <span className="transcript-msg-role-steve">{msg.role === 'steve' ? 'Steve' : 'You'}</span>
                <span className="transcript-msg-text-steve">{msg.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      <div className="bottom-handle-steve" />
    </div>
  )
}
