/**
 * LayeredAvatar — ORA-style composited animated avatar for Eve
 *
 * EXPOSED API  (via ref → useImperativeHandle):
 * ─────────────────────────────────────────────
 *  ref.current.blink()
 *    Triggers a single blink cycle (open → half → closed → half → open)
 *
 *  ref.current.setEyes(direction)
 *    direction: "center" | "left" | "right"
 *    Shifts iris gaze direction on the canvas
 *
 *  ref.current.setMouth(intensity)
 *    intensity: 0 (idle/closed) | 1 (slight) | 2 (medium) | 3 (wide)
 *    Drives lip-sync mouth frames
 *
 *  ref.current.setHand(gesture)
 *    gesture: "idle" | "wave" | "point"
 *    Swaps hand body layer + triggers CSS gesture animation
 *
 * AUTO-BEHAVIOURS (always active, no API needed):
 * ─────────────────────────────────────────────
 *  • Idle breathing animation (CSS)
 *  • Random auto-blink every 3–6 s
 *  • Canvas renders eyes + mouth on top of base image
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle,
         useRef, useState } from 'react'
import './LayeredAvatar.css'

/* ── Sprite paths ──────────────────────────────────────── */
const BODY      = '/eve-layers/body.png'
const HAND_WAVE = '/eve-layers/hand_wave.png'
/* hand_point uses CSS transform on wave layer for now */

/* ── Face canvas config (% of rendered stage height/width) ─
   The canvas is a tight window over the character's face.
   Full-body sprite: head ≈ top 20% of height, centred.     */
const FACE = {
  topPct:    0.085,  // eyes sit ~8.5 % from top of stage
  leftPct:   0.355,  // face starts ~35.5 % from left
  widthPct:  0.20,   // face is only ~20 % of stage width
  heightPct: 0.11,   // eye-to-mouth region is ~11 % of stage height
}

/* Eye & mouth positions as fraction of the face canvas */
const EYE_L  = { cx: 0.26, cy: 0.30 }
const EYE_R  = { cx: 0.74, cy: 0.30 }
const MOUTH  = { cx: 0.50, cy: 0.78 }

/* ── Eye-state enum ──────────────────────────────────────── */
const EYE_STATE = { OPEN: 'open', HALF: 'half', CLOSED: 'closed' }

/* ── Canvas draw helpers ─────────────────────────────────── */
function drawEye(ctx, cx, cy, rw, rh, state, lookX, lookY, color = '#3a1a00') {
  ctx.save()
  ctx.translate(cx, cy)

  if (state === EYE_STATE.CLOSED) {
    // Closed: just a curved line
    ctx.beginPath()
    ctx.moveTo(-rw * 0.85, 0)
    ctx.quadraticCurveTo(0, rh * 0.45, rw * 0.85, 0)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.5, rh * 0.18)
    ctx.lineCap = 'round'
    ctx.stroke()
    // lower lash
    ctx.beginPath()
    ctx.moveTo(-rw * 0.55, rh * 0.12)
    ctx.quadraticCurveTo(0, rh * 0.6, rw * 0.55, rh * 0.12)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, rh * 0.10)
    ctx.stroke()
  } else {
    const openFrac = state === EYE_STATE.HALF ? 0.45 : 1.0

    // White of eye
    ctx.beginPath()
    ctx.ellipse(0, 0, rw, rh * openFrac, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Clip everything inside the eye white
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, 0, rw, rh * openFrac, 0, 0, Math.PI * 2)
    ctx.clip()

    // Iris — shifted by lookX/Y
    const irisR = rw * 0.55
    const pupilR = irisR * 0.55
    const shiftX = lookX * rw * 0.22
    const shiftY = lookY * rh * 0.12
    const grad = ctx.createRadialGradient(shiftX, shiftY - irisR * 0.2, pupilR * 0.1, shiftX, shiftY, irisR)
    grad.addColorStop(0,   '#1a0a00')
    grad.addColorStop(0.4, color)
    grad.addColorStop(1,   color + 'aa')
    ctx.beginPath()
    ctx.arc(shiftX, shiftY, irisR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Pupil
    ctx.beginPath()
    ctx.arc(shiftX, shiftY, pupilR, 0, Math.PI * 2)
    ctx.fillStyle = '#0a0000'
    ctx.fill()

    // Highlight sparkle
    ctx.beginPath()
    ctx.arc(shiftX - irisR * 0.22, shiftY - irisR * 0.28, pupilR * 0.36, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(shiftX + irisR * 0.22, shiftY - irisR * 0.14, pupilR * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.60)'
    ctx.fill()

    ctx.restore()

    // Top eyelid / lash line
    ctx.beginPath()
    ctx.moveTo(-rw, 0)
    ctx.quadraticCurveTo(0, -rh * openFrac * 1.1, rw, 0)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.5, rh * 0.20)
    ctx.lineCap = 'round'
    ctx.stroke()

    // Half-closed upper shade
    if (state === EYE_STATE.HALF) {
      ctx.beginPath()
      ctx.ellipse(0, -rh * 0.05, rw, rh * 0.55, 0, Math.PI, Math.PI * 2)
      ctx.fillStyle = 'rgba(30,10,5,0.55)'
      ctx.fill()
    }

    // Bottom lash
    ctx.beginPath()
    ctx.moveTo(-rw * 0.6, rh * openFrac * 0.55)
    ctx.quadraticCurveTo(0, rh * openFrac * 1.1, rw * 0.6, rh * openFrac * 0.55)
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, rh * 0.10)
    ctx.stroke()

    // Outer lash flicks
    const lashes = [[-rw * 0.9, -rh * 0.05], [-rw * 0.72, -rh * 0.55 * openFrac], [rw * 0.9, -rh * 0.05], [rw * 0.72, -rh * 0.55 * openFrac]]
    lashes.forEach(([x1, y1], i) => {
      const dx = (i < 2 ? -1 : 1) * rw * 0.18
      ctx.beginPath(); ctx.moveTo(x1, y1)
      ctx.lineTo(x1 + dx, y1 - rh * 0.38 * openFrac)
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, rh * 0.09); ctx.stroke()
    })
  }

  ctx.restore()
}

function drawMouth(ctx, cx, cy, rw, rh, intensity) {
  ctx.save()
  ctx.translate(cx, cy)

  if (intensity === 0) {
    // Gentle closed smile
    ctx.beginPath()
    ctx.moveTo(-rw * 0.65, 0)
    ctx.quadraticCurveTo(0, rh * 0.9, rw * 0.65, 0)
    ctx.strokeStyle = '#c76b8a'
    ctx.lineWidth = Math.max(1.5, rh * 0.22)
    ctx.lineCap = 'round'
    ctx.stroke()
  } else {
    const openH = rh * [0, 0.35, 0.70, 1.0][intensity]

    // Lip outline
    ctx.beginPath()
    // Upper lip
    ctx.moveTo(-rw * 0.65, 0)
    ctx.quadraticCurveTo(-rw * 0.22, -rh * 0.22, 0, -rh * 0.12)
    ctx.quadraticCurveTo( rw * 0.22, -rh * 0.22, rw * 0.65, 0)
    // Lower lip
    ctx.quadraticCurveTo( rw * 0.35,  openH * 1.1, 0, openH * 1.15)
    ctx.quadraticCurveTo(-rw * 0.35,  openH * 1.1, -rw * 0.65, 0)
    ctx.closePath()

    // Mouth interior
    ctx.fillStyle = '#8b1a3a'
    ctx.fill()

    // Upper lip fill
    ctx.beginPath()
    ctx.moveTo(-rw * 0.65, 0)
    ctx.quadraticCurveTo(-rw * 0.22, -rh * 0.22, 0, -rh * 0.12)
    ctx.quadraticCurveTo( rw * 0.22, -rh * 0.22, rw * 0.65, 0)
    ctx.quadraticCurveTo(0, rh * 0.1, -rw * 0.65, 0)
    ctx.closePath()
    ctx.fillStyle = '#e8809a'
    ctx.fill()

    // Lower lip
    ctx.beginPath()
    ctx.moveTo(-rw * 0.55, openH * 0.3)
    ctx.quadraticCurveTo(0, openH * 1.3, rw * 0.55, openH * 0.3)
    ctx.quadraticCurveTo(0, openH * 0.9, -rw * 0.55, openH * 0.3)
    ctx.closePath()
    ctx.fillStyle = '#e899ae'
    ctx.fill()

    // Outline stroke
    ctx.beginPath()
    ctx.moveTo(-rw * 0.65, 0)
    ctx.quadraticCurveTo(-rw * 0.22, -rh * 0.22, 0, -rh * 0.12)
    ctx.quadraticCurveTo( rw * 0.22, -rh * 0.22, rw * 0.65, 0)
    ctx.quadraticCurveTo( rw * 0.35,  openH * 1.1, 0, openH * 1.15)
    ctx.quadraticCurveTo(-rw * 0.35,  openH * 1.1, -rw * 0.65, 0)
    ctx.strokeStyle = '#c76b8a'
    ctx.lineWidth = Math.max(1.2, rh * 0.14)
    ctx.stroke()

    // Teeth hint (intensity 2+)
    if (intensity >= 2) {
      ctx.beginPath()
      ctx.rect(-rw * 0.45, -rh * 0.06, rw * 0.9, openH * 0.55)
      ctx.fillStyle = 'rgba(255,248,250,0.85)'
      ctx.fill()
      // Tooth divider
      ctx.beginPath()
      ctx.moveTo(0, -rh * 0.06)
      ctx.lineTo(0, openH * 0.5)
      ctx.strokeStyle = 'rgba(200,160,170,0.5)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
  }

  ctx.restore()
}

/* ══════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════ */
const LayeredAvatar = forwardRef(function LayeredAvatar({ talking = false }, ref) {
  const stageRef  = useRef(null)
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  // State driven by API calls & auto-behaviour
  const eyeState   = useRef(EYE_STATE.OPEN)
  const lookDir    = useRef({ x: 0, y: 0 })
  const mouthInt   = useRef(0)
  const gesture    = useRef('idle')   // 'idle' | 'wave' | 'point'
  const [gestureClass, setGestureClass] = useState('idle')

  /* ── Expose imperative API ─────────────────────────────── */
  useImperativeHandle(ref, () => ({
    /**
     * Trigger a blink: open → half → closed → half → open
     */
    blink() {
      eyeState.current = EYE_STATE.HALF
      setTimeout(() => { eyeState.current = EYE_STATE.CLOSED }, 60)
      setTimeout(() => { eyeState.current = EYE_STATE.HALF   }, 130)
      setTimeout(() => { eyeState.current = EYE_STATE.OPEN   }, 200)
    },

    /**
     * Move eye gaze direction
     * @param {'center'|'left'|'right'} direction
     */
    setEyes(direction) {
      lookDir.current = direction === 'left'  ? { x: -1, y: 0 }
                      : direction === 'right' ? { x:  1, y: 0 }
                      : { x: 0, y: 0 }
    },

    /**
     * Set mouth openness for lip sync
     * @param {0|1|2|3} intensity  0=closed, 3=wide open
     */
    setMouth(intensity) {
      mouthInt.current = Math.max(0, Math.min(3, intensity))
    },

    /**
     * Change hand gesture
     * @param {'idle'|'wave'|'point'} gest
     */
    setHand(gest) {
      gesture.current = gest
      setGestureClass(gest)
    },
  }), [])

  /* ── Auto-blink ─────────────────────────────────────────── */
  useEffect(() => {
    const doBlink = () => {
      // Only blink when not already in mid-blink
      if (eyeState.current === EYE_STATE.OPEN) {
        eyeState.current = EYE_STATE.HALF
        setTimeout(() => { eyeState.current = EYE_STATE.CLOSED }, 65)
        setTimeout(() => { eyeState.current = EYE_STATE.HALF   }, 135)
        setTimeout(() => { eyeState.current = EYE_STATE.OPEN   }, 210)
      }
      // Schedule next blink: 3–6 s
      const next = 3000 + Math.random() * 3000
      autoBlinkRef.current = setTimeout(doBlink, next)
    }
    const autoBlinkRef = { current: setTimeout(doBlink, 2500) }
    return () => clearTimeout(autoBlinkRef.current)
  }, [])

  /* ── Talking: auto-cycle mouth frames ──────────────────── */
  useEffect(() => {
    if (!talking) {
      mouthInt.current = 0
      return
    }
    const frames = [1, 2, 3, 2, 1, 0]
    let fi = 0
    const iv = setInterval(() => {
      mouthInt.current = frames[fi % frames.length]
      fi++
    }, 110)
    return () => clearInterval(iv)
  }, [talking])

  /* ── Canvas render loop ─────────────────────────────────── */
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const stage  = stageRef.current
    if (!canvas || !stage) return

    const sw = stage.offsetWidth
    const sh = stage.offsetHeight

    // Size & position the canvas over the face region
    const cw = sw * FACE.widthPct
    const ch = sh * FACE.heightPct
    canvas.width  = cw
    canvas.height = ch
    canvas.style.left   = `${sw * FACE.leftPct}px`
    canvas.style.top    = `${sh * FACE.topPct}px`
    canvas.style.width  = `${cw}px`
    canvas.style.height = `${ch}px`

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)

    // Eye radius — small, proportional to the actual face size
    const eRW = cw * 0.115   // ~11.5% of canvas width
    const eRH = ch * 0.32    // ~32% of canvas height (eyes are tall relative to face strip)

    // Mouth dimensions
    const mRW = cw * 0.13
    const mRH = ch * 0.13

    drawEye(ctx,
      EYE_L.cx * cw, EYE_L.cy * ch, eRW, eRH,
      eyeState.current, lookDir.current.x, lookDir.current.y
    )
    drawEye(ctx,
      EYE_R.cx * cw, EYE_R.cy * ch, eRW, eRH,
      eyeState.current, lookDir.current.x, lookDir.current.y
    )
    drawMouth(ctx,
      MOUTH.cx * cw, MOUTH.cy * ch, mRW, mRH,
      mouthInt.current
    )

    animRef.current = requestAnimationFrame(renderCanvas)
  }, [])

  useEffect(() => {
    animRef.current = requestAnimationFrame(renderCanvas)
    return () => cancelAnimationFrame(animRef.current)
  }, [renderCanvas])

  /* ── Render ─────────────────────────────────────────────── */
  const isWave  = gestureClass === 'wave'
  const isPoint = gestureClass === 'point'

  return (
    <div
      ref={stageRef}
      className={`avatar-stage${talking ? ' talking' : ''} gesture-${gestureClass}`}
    >
      {/* ── Layer 0: Base body (sets stage natural height) ── */}
      <img
        className="avatar-layer avatar-layer--body"
        src={BODY}
        alt="Eve"
        draggable={false}
      />

      {/* ── Layer 1: Hand — wave ── */}
      <img
        className={`avatar-layer avatar-layer--hand avatar-layer--hand-wave${isWave ? ' active' : ''}`}
        src={HAND_WAVE}
        alt=""
        draggable={false}
        aria-hidden="true"
      />

      {/* ── Layer 2: Hand — point (reuses wave + CSS rotate) ── */}
      <img
        className={`avatar-layer avatar-layer--hand avatar-layer--hand-point${isPoint ? ' active' : ''}`}
        src={HAND_WAVE}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={isPoint ? { transform: 'translateX(-50%) scaleX(-1) rotate(-35deg)', transformOrigin: 'bottom center' } : undefined}
      />

      {/* ── Canvas overlay: eyes + mouth ── */}
      <canvas
        ref={canvasRef}
        className="avatar-face-canvas"
        aria-hidden="true"
      />
    </div>
  )
})

export default LayeredAvatar
