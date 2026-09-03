/**
 * dsh-live2d-pet client half — renders a Live2D model as a floating
 * bottom-right companion. Enable with localStorage.setItem('dsh-live2d-pet','1')
 * (persisted across refreshes); disable with '0'. A ✨ toggle button is also
 * injected into the session header (next to the 💰 wallet).
 *
 * Boot order: the Cubism core is injected into the document head by the host
 * half, so window.Live2DCubismCore exists before this bundle evaluates. The
 * model is loaded from the host-served /pet/live2d/* route; the head/eyes
 * follow the mouse via core parameters.
 *
 * This is the GENERIC build (bundled Haru sample model): the expression map
 * below targets the official Haru expressions (f00..f08) and its Idle/Tap
 * motion groups. To skin a custom model, edit PHASE_EXPRESSION / the motion
 * groups and swap assets under assets/live2d/<model>/. The architecture
 * (toggle, session-state linkage, freeze, drag clamping, iris loop, mouse
 * follow yield) is model-agnostic and battle-tested — see the deployment
 * manual for the pitfall log.
 * @module dsh-live2d-pet/client
 */

import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import * as PIXI from 'pixi.js'

/** localStorage key that toggles the Live2D companion. */
const STORAGE_KEY = 'dsh-live2d-pet'
/** localStorage key that persists a manual drag offset. */
const DRAG_KEY = 'dsh-live2d-pet-drag'

/** Where the host serves the model config from (see src/index.ts). */
const CONFIG_URL = '/pet/live2d/config'

/** Activity phase → cat parameter-snapshot key (CAT_PARAM_EXPRESSIONS). */
const PHASE_EXPRESSION: Record<string, string> = {
  idle: 'idle',
  waiting: 'idle', // no dedicated waiting face → neutral
  thinking: 'thinking',
  tool: 'tool',
  done: 'done',
  failed: 'failed',
  drag: 'drag',
  deep: 'thinking', // deep thinking reuses the thinking face
  sleep: 'sleep',
  celebrate: 'done', // celebrate reuses the happy face
}
/** hover → surprise parameter snapshot (wide eyes + open mouth). */
const HOVER_EXPRESSION = 'surprise'

/** How long "done" stays visible after a turn finishes. */
const DONE_MS = 3000
/** Idle fidget: how long before the pet does a random little wiggle. */
const IDLE_FIDGET_MS = 7000
/** How long one idle fidget motion plays. */
const IDLE_FIDGET_PLAY_MS = 2400
/** Deep thinking threshold (thinking longer than this becomes 'deep'). */
const DEEP_THINK_MS = 5000
/** Idle-to-sleep threshold. */
const SLEEP_MS = 60000
/** A turn that used at least this many tools celebrates. */
const CELEBRATE_TOOL_COUNT = 3

/**
 * Motion groups this model exposes (haru: only "Idle" + "Tap"). The idle
 * motion runs constantly; fidget plays a random Tap motion; everything else
 * has no motion (the sample model ships no per-state body animations).
 * A custom model with its own motion groups can extend TOOL_MOTION below.
 */
const IDLE_MOTION = 'Idle'
/** Tap group: the sample's interactive motions, used for idle fidgets. */
const TAP_MOTION_GROUP = 'Tap'
/** Tool → motion group map (empty for haru; custom models may add entries). */
const TOOL_MOTION: Record<string, string> = {}

/**
 * Drag offset is intentionally NOT persisted across restarts (2026-08-28):
 * a leftover offset used to push the pet off-screen after a server restart
 * (the viewport clamp alone was too loose — e.g. y=-900 passed |y|<=vh but
 * still put the canvas above the viewport). Every boot starts at the default
 * anchor position; any stale key is wiped so it can never resurrect a
 * hidden pet.
 */
function loadDragOffset(): { x: number; y: number } {
  try {
    window.localStorage?.removeItem(DRAG_KEY)
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0 }
}

function saveDragOffset(): void {
  // Intentionally a no-op: drag offset does not survive restarts (see above).
}

/**
 * Parameter-snapshot "expressions" for models without exp3 files (Tororo /
 * Hijiki ship no Expressions). Each state is a static set of PARAM_* values
 * applied directly to the core model. Values are guesses tuned against the
 * bundled idle motion's keyframes — hand-tune in Live2D Cubism Viewer and
 * update here (or convert into real .exp3.json files later).
 * `null` → leave the parameter at its current (motion/physics) value.
 */
const CAT_PARAM_EXPRESSIONS: Record<string, Record<string, number | null>> = {
  idle: {
    PARAM_EYE_L_OPEN: null,
    PARAM_EYE_R_OPEN: null,
    PARAM_MOUTH_OPEN_Y: null,
    PARAM_MOUTH_FORM: null,
    PARAM_TAIL: null,
    PARAM_EAR_L: null,
    PARAM_EAR_R: null,
  },
  thinking: {
    PARAM_EYE_L_OPEN: 0.5, // half-lidded
    PARAM_EYE_R_OPEN: 0.5,
    PARAM_MOUTH_OPEN_Y: 0.15, // slightly open
    PARAM_TAIL: -0.3, // slow, curious
  },
  tool: {
    PARAM_EYE_L_OPEN: 0.9,
    PARAM_EYE_R_OPEN: 0.9,
    PARAM_MOUTH_OPEN_Y: 0.1,
    PARAM_TAIL: 0.5, // busy tail
  },
  done: {
    PARAM_EYE_L_OPEN: 0.8,
    PARAM_EYE_R_OPEN: 0.8,
    PARAM_MOUTH_FORM: 0.4, // smile-ish
    PARAM_TAIL: 0.7, // happy tail up
  },
  failed: {
    PARAM_EYE_L_OPEN: 0.4,
    PARAM_EYE_R_OPEN: 0.4,
    PARAM_EAR_L: -0.4, // droopy ears
    PARAM_EAR_R: -0.4,
    PARAM_TAIL: -0.8, // tail down
  },
  drag: {
    PARAM_EYE_L_OPEN: 0.9,
    PARAM_EYE_R_OPEN: 0.9,
    PARAM_MOUTH_OPEN_Y: 0.2,
    PARAM_TAIL: 1, // startled tail
  },
  sleep: {
    PARAM_EYE_L_OPEN: 0.15, // nearly closed
    PARAM_EYE_R_OPEN: 0.15,
    PARAM_MOUTH_OPEN_Y: 0.05,
    PARAM_TAIL: 0.2, // relaxed curl
  },
  surprise: {
    PARAM_EYE_L_OPEN: 1, // wide
    PARAM_EYE_R_OPEN: 1,
    PARAM_MOUTH_OPEN_Y: 0.3,
    PARAM_TAIL: -0.5,
  },
}

/**
 * Apply an expression. If the name matches a CAT_PARAM_EXPRESSIONS key, write
 * the parameter snapshot directly (models without exp3 files); otherwise fall
 * back to the standard model.expression() path (models with exp3 files).
 */
function applyExpression(model: any, name: string): void {
  const snap = CAT_PARAM_EXPRESSIONS[name]
  if (snap) {
    try {
      for (const [id, value] of Object.entries(snap)) {
        if (value !== null) {
          model.internalModel.coreModel.setParameterValueById(id, value, 1)
        }
      }
      return
    } catch {
      /* parameter ids vary; fall through to expression() */
    }
  }
  try {
    model.expression(name)
  } catch {
    // Expression name may not exist on every model; ignore.
  }
}

/* ---- ✨ pet toggle button (session header, next to the 💰 wallet) ---- */
const TOGGLE_BTN_STYLE = {
  width: '30px',
  height: '30px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '15px',
  background: 'transparent',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform 0.15s, background 0.15s, opacity 0.15s',
  // flex order inside the utilities bar: must be LEFT of the 💰 wallet
  // (wallet uses order -1, so go one further left).
  order: -2,
} as const

/** ✨ toggle: reads localStorage, flips it via the exposed toggle, re-renders. */
function PetToggleButton() {
  const [on, setOn] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEY) === '1',
  )
  const click = (): void => {
    ;(window as any).__dshLive2dPetToggle?.()
    setOn(!on)
  }
  return createElement('button', {
    onClick: click,
    title: on ? '关闭宠物' : '开启宠物',
    style: { ...TOGGLE_BTN_STYLE, opacity: on ? 0.9 : 0.35 },
    onMouseEnter: (e: MouseEvent) => {
      ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'
      ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'
    },
    onMouseLeave: (e: MouseEvent) => {
      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      ;(e.currentTarget as HTMLElement).style.transform = 'scale(1)'
    },
    children: '✨',
  })
}

/** The floating Live2D pet component. */
export function Live2DPet(props: { phase?: string; size?: number; toolName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modelRef = useRef<any>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const dragOffsetRef = useRef<{ x: number; y: number }>(loadDragOffset())
  const phaseRef = useRef(props.phase ?? 'idle')
  phaseRef.current = props.phase ?? 'idle'
  /** True while a body motion owns the head/eye parameters (mouse follow yields). */
  const motionActiveRef = useRef(false)
  /** Latest cursor delta, written to the iris EVERY FRAME via the ticker —
   * expression snapshots would otherwise clobber the event-driven write. */
  const mouseRef = useRef({ dx: 0, dy: 0 })
  const size = props.size ?? 320

  useEffect(() => {
    let disposed = false
    let app: any = null
    let onMove: ((e: MouseEvent) => void) | null = null
    let anchorRaf = 0
    let dragState: { startX: number; startY: number; baseX: number; baseY: number } | null = null
    let onDown: ((e: MouseEvent) => void) | null = null
    let onDragMove: ((e: MouseEvent) => void) | null = null
    let onUp: ((e: MouseEvent) => void) | null = null

    async function boot(): Promise<void> {
      if (disposed || !canvasRef.current) return
      const cfg = await (await fetch(CONFIG_URL)).json()
      if (disposed || !canvasRef.current) return
      // Apply host-provided geometry: size + offsets come from the plugin
      // config (cordis.patch.yml), so tweaks need no rebuild.
      const csize = cfg.size ?? size
      const canvas = canvasRef.current
      canvas.style.right = `${cfg.right ?? 24}px`
      canvas.style.bottom = `${cfg.bottom ?? 20}px`
      canvas.style.width = `${csize}px`
      canvas.style.height = `${csize}px`
      canvas.style.pointerEvents = 'auto'
      canvas.style.cursor = 'grab'

      app = new PIXI.Application({
        view: canvas,
        width: csize,
        height: csize,
        backgroundAlpha: 0,
        autoStart: true,
        antialias: true,
        autoDensity: true,
        resolution: Math.max(1, Math.round((window as any).devicePixelRatio || 1)),
      })

      // The model needs a ticker to animate (physics/expressions).
      Live2DModel.registerTicker(PIXI.Ticker)

      console.log('[dsh-live2d-pet] loading model…', cfg.model)
      const model = await Live2DModel.from(cfg.model, { autoInteract: false })
      console.log('[dsh-live2d-pet] model loaded ✓', { w: model.width, h: model.height })
      const baseH = model.height ?? csize
      model.scale.set(csize / Math.max(baseH, 1), csize / Math.max(baseH, 1))
      model.anchor?.set(0.5, 1)
      model.position?.set(csize / 2, csize)
      app.stage.addChild(model)
      modelRef.current = model
      // Debug handles: manual expression/motion testing from the console.
      ;(window as any).__dshLive2dPetModel = model
      ;(window as any).pet = (expr?: string, motion?: string): void => {
        const mm = (window as any).__dshLive2dPetModel
        if (!mm) return
        if (expr) {
          try {
            mm.expression(expr)
          } catch {
            /* ignore */
          }
        }
        if (motion) {
          try {
            mm.motion(motion)
          } catch {
            /* ignore */
          }
        }
      }
      applyExpression(model, PHASE_EXPRESSION[phaseRef.current] ?? PHASE_EXPRESSION.idle)
      // Start the idle motion loop (haru ships one; custom models may not).
      try {
        model.motion(IDLE_MOTION)
      } catch {
        /* no Idle group on this model */
      }

      // Anchor to the composer seat (chat input bar), with config offsets and
      // any manual drag offset stacked on top. Re-anchored every frame so the
      // pet follows internal chat scrolling and window resizes.
      const anchorToComposer = (): void => {
        if (dragState) return // dragging: free position until release
        const seat = document.querySelector('[data-composer-seat]') ?? document.querySelector('[data-composer-card]')
        if (!seat) return
        const r = seat.getBoundingClientRect()
        if (!r.width && !r.height) return
        const off = dragOffsetRef.current
        const gap = cfg.gap ?? 10
        canvas.style.left = `${Math.max(4, Math.round(r.left + r.width / 2 - csize / 2 + (cfg.offsetX ?? 0) + off.x))}px`
        canvas.style.right = 'auto'
        canvas.style.bottom = `${Math.max(4, Math.round(window.innerHeight - r.top + gap + (cfg.offsetY ?? 0) + off.y))}px`
        if (!(window as any).__dshAnchorLogged) {
          ;(window as any).__dshAnchorLogged = true
          console.log('[dsh-live2d-pet] anchor debug:', JSON.stringify({
            seatFound: !!seat,
            seatRect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
            canvasPos: { left: canvas.style.left, bottom: canvas.style.bottom },
            dragOffset: off,
            cfg: { size: csize, offsetX: cfg.offsetX, offsetY: cfg.offsetY },
            viewport: { w: window.innerWidth, h: window.innerHeight },
          }))
        }
      }
      const anchorLoop = (): void => {
        if (disposed) return
        anchorToComposer()
        anchorRaf = requestAnimationFrame(anchorLoop)
      }
      anchorLoop()

      // Drag to reposition: while dragging the pet is free-floating and shows
      // the 'drag' expression; on release the offset is persisted and the
      // anchor resumes with the accumulated offset.
      onDown = (e: MouseEvent): void => {
        if (e.button !== 0) return
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        dragState = { startX: e.clientX, startY: e.clientY, baseX: rect.left, baseY: rect.top }
        canvas.style.cursor = 'grabbing'
        setDragging(true)
      }
      onDragMove = (e: MouseEvent): void => {
        if (!dragState) return
        const dx = e.clientX - dragState.startX
        const dy = e.clientY - dragState.startY
        canvas.style.left = `${dragState.baseX + dx}px`
        canvas.style.top = `${dragState.baseY + dy}px`
        canvas.style.right = 'auto'
        canvas.style.bottom = 'auto'
      }
      onUp = (e: MouseEvent): void => {
        if (!dragState) return
        const off = dragOffsetRef.current
        off.x += e.clientX - dragState.startX
        off.y += e.clientY - dragState.startY
        dragState = null
        saveDragOffset() // no-op: position resets on next boot (see loadDragOffset)
        canvas.style.cursor = 'grab'
        setDragging(false)
      }
      canvas.addEventListener('mousedown', onDown)
      window.addEventListener('mousemove', onDragMove)
      window.addEventListener('mouseup', onUp)

      // Head + gaze follow the mouse cursor. While a body motion is playing
      // the HEAD params yield to the motion, but the iris (EyeBallX/Y) keeps
      // tracking the cursor — the pet reads as alive even mid-action.
      onMove = (e: MouseEvent): void => {
        const m = modelRef.current
        if (!m) return
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
        const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
        mouseRef.current = { dx, dy }
        try {
          if (!motionActiveRef.current) {
            // Tororo/Hijiki use the ALL-CAPS PARAM_* id convention (Cubism
            // 2.1-era export); the generic haru build used ParamAngleX/Y.
            m.internalModel.coreModel.setParameterValueById('PARAM_ANGLE_X', dx * 24, 1)
            // Screen Y grows downward but Live2D Y grows upward — negate the
            // vertical delta so the head/gaze follow the cursor correctly.
            m.internalModel.coreModel.setParameterValueById('PARAM_ANGLE_Y', -dy * 18, 1)
          }
        } catch {
          // Parameter ids vary per model; ignore unknown ones.
        }
      }
      window.addEventListener('mousemove', onMove)

      // Iris follows the cursor EVERY FRAME (ticker, after the physics/expression
      // pass) so expression snapshots can't clobber it. Head stays event-driven.
      const irisLoop = (): void => {
        const m2 = modelRef.current
        if (!m2) return
        const { dx, dy } = mouseRef.current
        try {
          m2.internalModel.coreModel.setParameterValueById('PARAM_EYE_BALL_X', dx, 1)
          m2.internalModel.coreModel.setParameterValueById('PARAM_EYE_BALL_Y', -dy, 1)
        } catch {
          /* ignore */
        }
      }
      app.ticker.add(irisLoop)

      // Hover interaction: acknowledge the cursor with a tilt.
      canvas.addEventListener('pointerenter', () => setHovering(true))
      canvas.addEventListener('pointerleave', () => setHovering(false))
    }

    boot().catch((error) => {
      console.error('[dsh-live2d-pet] boot failed', error)
    })
    return () => {
      disposed = true
      cancelAnimationFrame(anchorRaf)
      try {
        app?.ticker.remove(irisLoop)
      } catch {
        /* ignore */
      }
      if (onDown) canvasRef.current?.removeEventListener('mousedown', onDown)
      if (onDragMove) window.removeEventListener('mousemove', onDragMove)
      if (onUp) window.removeEventListener('mouseup', onUp)
      if (onMove) window.removeEventListener('mousemove', onMove)
      try {
        app?.destroy(true)
      } catch {
        // Already destroyed.
      }
      modelRef.current = null
    }
  }, [size])

  // Switch the expression + motion when the phase / tool / drag / hover changes.
  useEffect(() => {
    const m = modelRef.current
    if (!m) return
    // Manual-testing freeze: window.__dshLive2dPetFreeze = true stops the
    // automatic expression/motion overrides so console-driven checks stick.
    if ((window as any).__dshLive2dPetFreeze) return

    // Expression: hover greets with surprise (even from sleep); drag wins.
    let expr = PHASE_EXPRESSION[props.phase ?? 'idle'] ?? PHASE_EXPRESSION.idle
    if (props.phase === 'tool' && props.toolName) expr = PHASE_EXPRESSION.tool ?? expr
    if (hovering && (props.phase === 'idle' || props.phase === 'sleep')) expr = HOVER_EXPRESSION
    if (dragging) expr = PHASE_EXPRESSION.drag
    applyExpression(m, expr)

    // Motion: pick the body animation for this state; stop everything else.
    const mm = m.internalModel?.motionManager
    let motionGroup: string | null = null
    if (dragging) {
      motionGroup = null // no wiggle group on the sample; keep idle running
    } else if (props.phase === 'tool' && props.toolName) {
      motionGroup = TOOL_MOTION[props.toolName] ?? null
    } else if (props.phase === 'thinking' || props.phase === 'deep' || props.phase === 'waiting' || props.phase === 'done' || props.phase === 'celebrate' || props.phase === 'failed') {
      motionGroup = null // sample model: no per-state motions; keep idle
    }
    motionActiveRef.current = motionGroup !== null
    try {
      if (motionGroup) {
        // Always stop the previous motion first — pixi's priority gating
        // silently ignores a new motion while another is still playing.
        mm?.stopAllMotions()
        m.motion(motionGroup)
      } else if (dragging) {
        // Keep the idle loop alive while dragged (no dedicated wiggle group).
        mm?.stopAllMotions()
        try {
          m.motion(IDLE_MOTION)
        } catch {
          /* ignore */
        }
      } else {
        mm?.stopAllMotions()
      }
    } catch {
      // Motion group may not exist on every model; ignore.
    }
  }, [props.phase, dragging, props.toolName, hovering])

  // Idle fidget: while idle and untouched, play a random Tap motion every so
  // often (the sample's interactive motions double as idle micro-antics).
  useEffect(() => {
    if (props.phase !== 'idle' || dragging || hovering) return
    let timer: any
    const fidget = (): void => {
      const m = modelRef.current
      if (m && phaseRef.current === 'idle') {
        try {
          m.internalModel?.motionManager?.stopAllMotions()
          motionActiveRef.current = true // yield the head to the fidget sway
          m.motion(TAP_MOTION_GROUP) // random Tap motion as the idle micro-motion
        } catch {
          /* ignore */
        }
        timer = setTimeout(() => {
          try {
            modelRef.current?.internalModel?.motionManager?.stopAllMotions()
          } catch {
            /* ignore */
          }
          motionActiveRef.current = false
          fidget()
        }, IDLE_FIDGET_PLAY_MS)
      }
    }
    timer = setTimeout(fidget, IDLE_FIDGET_MS)
    return () => {
      clearTimeout(timer)
      motionActiveRef.current = false
      try {
        modelRef.current?.internalModel?.motionManager?.stopAllMotions()
      } catch {
        /* ignore */
      }
    }
  }, [props.phase, dragging, hovering])

  return createElement('canvas', {
    ref: canvasRef,
    width: size,
    height: size,
    style: {
      position: 'fixed',
      right: '24px',
      bottom: '20px',
      zIndex: 2147483000,
      pointerEvents: 'auto',
      cursor: 'grab',
      width: `${size}px`,
      height: `${size}px`,
    },
  })
}

/** Derive the pet phase from one ConversationSnapshot. */
function computePhase(snap: any, lastTurnEndAt: number): string {
  if (snap?.pending?.length) return 'waiting'
  if (snap?.running) {
    if (snap?.runningCalls?.length) return 'tool'
    return 'thinking'
  }
  if (snap?.lastAgentError) return 'failed'
  if (Date.now() - lastTurnEndAt < DONE_MS) return 'done'
  return 'idle'
}

/** Mount the companion when the localStorage toggle is on. */
/** Cordis service-level inject: ctx.slots is used for the ✨ header button. */
export const inject = ['slots']

export function apply(ctx: any): void {
  const mount = (): void => {
    if (typeof window === 'undefined') return
    if (window.localStorage?.getItem(STORAGE_KEY) !== '1') return
    if ((window as any).__dshLive2dPetRoot) return // already mounted (no double pet)
    const container = document.createElement('div')
    container.dataset.dshLive2dPet = ''
    document.body.appendChild(container)
    const root = createRoot(container)
    root.render(createElement(Live2DPet, {}))
    ;(window as any).__dshLive2dPetRoot = root
    ;(window as any).__dshLive2dPetContainer = container
  }
  const unmount = (): void => {
    if (typeof window === 'undefined') return
    const root = (window as any).__dshLive2dPetRoot
    const container = (window as any).__dshLive2dPetContainer
    if (root) {
      try {
        root.unmount()
      } catch {
        /* already unmounted */
      }
    }
    if (container) {
      try {
        container.remove()
      } catch {
        /* already removed */
      }
    }
    ;(window as any).__dshLive2dPetRoot = null
    ;(window as any).__dshLive2dPetContainer = null
  }

  // ---- State linkage: watch the DSH session runtime and re-render with the
  // derived phase. Falls back to a static idle pet when no sessions service
  // is available (older hosts / non-web surfaces). ----
  let listUnsub: (() => void) | null = null
  let sessionUnsub: (() => void) | null = null
  let refreshTimer: any = null
  let currentSessionId: string | null = null
  let wasRunning = false
  let lastTurnEndAt = 0
  let lastKey = ''
  let thinkingSince = 0
  let idleSince = 0
  let toolCount = 0
  let lastCallCount = 0

  const renderPhase = (phase: string, toolName?: string): void => {
    // Dedupe on the (phase, tool) pair so a tool switch under the same phase
    // still re-renders the pet with the new toolName.
    const key = `${phase}|${toolName ?? ''}`
    if (key === lastKey) return
    lastKey = key
    console.log('[dsh-live2d-pet] phase →', phase, '| tool:', toolName ?? '-')
    const root = (window as any).__dshLive2dPetRoot
    if (root) root.render(createElement(Live2DPet, { phase, toolName }))
  }

  const tearDownSession = (): void => {
    sessionUnsub?.()
    sessionUnsub = null
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    // CRITICAL: reset the session identity too, otherwise toggling the pet
    // off/on leaves currentSessionId set and attachSession() bails early on
    // `sessionId === currentSessionId`, killing the refresh loop forever
    // (the pet keeps rendering but phase linkage is dead → no motions).
    currentSessionId = null
    lastKey = ''
  }

  const attachSession = (sessions: any, sessionId: string): void => {
    if (sessionId === currentSessionId) return
    tearDownSession()
    currentSessionId = sessionId
    const binding = sessions.binding?.(sessionId)
    const session = binding?.session
    if (!session?.subscribe) {
      console.warn('[dsh-live2d-pet] no session binding for', sessionId)
      return
    }
    console.log('[dsh-live2d-pet] watching session', sessionId)
    const refresh = (): void => {
      const snap = session.getSnapshot()
      const running = Boolean(snap?.running)
      // Record the moment a turn finishes BEFORE deriving the phase, so the
      // same snapshot can surface 'done' for DONE_MS.
      if (wasRunning && !running) lastTurnEndAt = Date.now()
      wasRunning = running
      let phase = computePhase(snap, lastTurnEndAt)
      const toolName = snap?.runningCalls?.length ? snap.runningCalls[0].name : undefined
      const now = Date.now()

      // Count tool calls in this turn (celebrate when done && >= N tools).
      // Reset only when the turn actually settles (not running & not done) —
      // a gap between two tools briefly reports 'thinking' and must NOT wipe
      // the counter.
      const callCount = snap?.runningCalls?.length ?? 0
      if (phase === 'tool') {
        if (callCount > lastCallCount) toolCount += callCount - lastCallCount
        lastCallCount = callCount
      } else if (!running && phase !== 'done') {
        // turn settled outside done → reset counters
        toolCount = 0
        lastCallCount = 0
      }

      // Deep thinking: thinking persisting past the threshold.
      if (phase === 'thinking') {
        if (!thinkingSince) thinkingSince = now
        else if (now - thinkingSince > DEEP_THINK_MS) phase = 'deep'
      } else {
        thinkingSince = 0
      }

      // Sleep: idle persisting past the threshold.
      if (phase === 'idle') {
        if (!idleSince) idleSince = now
        else if (now - idleSince > SLEEP_MS) phase = 'sleep'
      } else {
        idleSince = 0
      }

      // Celebrate: a done that used enough tools.
      if (phase === 'done' && toolCount >= CELEBRATE_TOOL_COUNT) phase = 'celebrate'

      renderPhase(phase, toolName)
    }
    // Snapshot events + a 1s driver loop: time-driven states (done/sleep/deep)
    // must fall back even when the snapshot stops changing.
    sessionUnsub = session.subscribe(refresh)
    refreshTimer = setInterval(refresh, 1000)
    refresh()
  }

  const attach = (): void => {
    // ctx.get() (not property access) — the sessions service is registered by
    // the framework runtime and reading it via get() needs no inject edge.
    const sessions = ctx.get?.('sessions')
    if (!sessions?.list) {
      console.warn('[dsh-live2d-pet] sessions service unavailable — state linkage disabled (static idle)')
      return
    }
    console.log('[dsh-live2d-pet] sessions service attached')
    listUnsub?.() // never double-subscribe across toggle cycles
    const onList = (): void => {
      const list = sessions.list.getSnapshot()
      const id = list?.current
      if (id) attachSession(sessions, id)
      else {
        tearDownSession()
        currentSessionId = null
        renderPhase('idle')
      }
    }
    listUnsub = sessions.list.subscribe(onList)
    onList()
  }

  // Toggle: flip the key and mount/unmount immediately (same-page click does
  // NOT fire the storage event, so we drive it directly via the exposed fn).
  const handleToggle = (open: boolean): void => {
    if (open) {
      mount()
      attach()
    } else {
      tearDownSession()
      listUnsub?.()
      unmount()
    }
  }
  ;(window as any).__dshLive2dPetToggle = (): void => {
    const cur = window.localStorage?.getItem(STORAGE_KEY) === '1'
    window.localStorage?.setItem(STORAGE_KEY, cur ? '0' : '1')
    handleToggle(!cur)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      handleToggle(e.newValue === '1')
    })
  }

  // ✨ toggle button into the session header actions (next to the 💰 wallet).
  // ctx.slots requires the ui-slots inject declaration (see package.json).
  if (ctx.slots?.inject) {
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'pet-toggle', order: 90 },
        PetToggleButton,
      ),
    )
  }
  mount()
  attach()
}
