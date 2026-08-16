/**
 * dsh-live2d-pet client half — renders a Live2D model as a floating
 * bottom-right companion. Enable with localStorage.setItem('dsh-live2d-pet','1')
 * (persisted across refreshes); disable with '0'.
 *
 * Boot order: the Cubism core is injected into the document head by the host
 * half, so window.Live2DCubismCore exists before this bundle evaluates. The
 * model is loaded from the host-served /pet/live2d/* route; the head/eyes
 * follow the mouse via core parameters.
 * @module dsh-live2d-pet/client
 */

import { createElement, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import * as PIXI from 'pixi.js'

/** localStorage key that toggles the Live2D companion. */
const STORAGE_KEY = 'dsh-live2d-pet'

/** Where the host serves the model config from (see src/index.ts). */
const CONFIG_URL = '/pet/live2d/config'

/** ActivityPhase-like states → haru expression names (f00..f07). */
const PHASE_EXPRESSION: Record<string, string> = {
  idle: 'f00',
  waiting: 'f01',
  thinking: 'f02',
  tool: 'f03',
  done: 'f04',
  failed: 'f05',
}

/** The floating Live2D pet component. */
export function Live2DPet(props: { phase?: string; size?: number; right?: number; bottom?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modelRef = useRef<any>(null)
  const phaseRef = useRef(props.phase ?? 'idle')
  phaseRef.current = props.phase ?? 'idle'
  const size = props.size ?? 320

  useEffect(() => {
    let disposed = false
    let app: any = null
    let onMove: ((e: MouseEvent) => void) | null = null

    async function boot(): Promise<void> {
      if (disposed || !canvasRef.current) return
      const cfg = await (await fetch(CONFIG_URL)).json()
      if (disposed || !canvasRef.current) return
      // Apply host-provided geometry to the canvas: size + position come from
      // the plugin config (cordis.patch.yml), so tweaks need no rebuild.
      const csize = cfg.size ?? size
      const canvas = canvasRef.current
      canvas.style.right = `${cfg.right ?? 24}px`
      canvas.style.bottom = `${cfg.bottom ?? 20}px`
      canvas.style.width = `${csize}px`
      canvas.style.height = `${csize}px`

      app = new PIXI.Application({
        view: canvas,
        width: csize,
        height: csize,
        backgroundAlpha: 0,
        autoStart: true,
        antialias: true,
        autoDensity: true,
      })

      // The model needs a ticker to animate (physics/expressions).
      Live2DModel.registerTicker(PIXI.Ticker)

      const model = await Live2DModel.from(cfg.model, { autoInteract: false })
      // Fit the FULL model by HEIGHT (full-body models: width-scaling blows
      // the height past the canvas), anchored at the bottom center.
      const baseH = model.height ?? csize
      model.scale.set(csize / Math.max(baseH, 1), csize / Math.max(baseH, 1))
      model.anchor?.set(0.5, 1)
      model.position?.set(csize / 2, csize)
      app.stage.addChild(model)
      modelRef.current = model

      try {
        model.expression(PHASE_EXPRESSION[phaseRef.current] ?? 'f00')
      } catch {
        // Expression name may not exist on every model; ignore.
      }
      try {
        model.motion('Idle')
      } catch {
        // No Idle group on this model; ignore.
      }

      // Head + gaze follow the mouse cursor.
      onMove = (e: MouseEvent): void => {
        const m = modelRef.current
        if (!m) return
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
        const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
        try {
          m.internalModel.coreModel.setParameterValueById('ParamAngleX', dx * 24, 1)
          m.internalModel.coreModel.setParameterValueById('ParamAngleY', dy * 18, 1)
          m.internalModel.coreModel.setParameterValueById('ParamEyeBallX', dx, 1)
          m.internalModel.coreModel.setParameterValueById('ParamEyeBallY', dy, 1)
        } catch {
          // Parameter ids vary per model; ignore unknown ones.
        }
      }
      window.addEventListener('mousemove', onMove)
    }

    boot().catch((error) => {
      console.error('[dsh-live2d-pet] boot failed', error)
    })
    return () => {
      disposed = true
      if (onMove) window.removeEventListener('mousemove', onMove)
      try {
        app?.destroy(true)
      } catch {
        // Already destroyed.
      }
      modelRef.current = null
    }
  }, [size])

  // Switch the expression when the phase changes.
  useEffect(() => {
    const m = modelRef.current
    if (!m) return
    try {
      m.expression(PHASE_EXPRESSION[props.phase ?? 'idle'] ?? 'f00')
    } catch {
      // Ignore unknown expression names.
    }
  }, [props.phase])

  return createElement('canvas', {
    ref: canvasRef,
    width: size,
    height: size,
    style: {
      position: 'fixed',
      right: `${props.right ?? 24}px`,
      bottom: `${props.bottom ?? 20}px`,
      zIndex: 2147483000,
      pointerEvents: 'none',
      width: `${size}px`,
      height: `${size}px`,
    },
  })
}

/** Mount the companion when the localStorage toggle is on. */
export function apply(ctx: { on?: (event: string, cb: () => void) => void }): void {
  const mount = (): void => {
    if (typeof window === 'undefined') return
    if (window.localStorage?.getItem(STORAGE_KEY) !== '1') return
    const container = document.createElement('div')
    container.dataset.dshLive2dPet = ''
    document.body.appendChild(container)
    const root = createRoot(container)
    root.render(createElement(Live2DPet, {}))
    // Keep a handle so the effect below can unmount on disable; the root
    // lives for the page lifetime once enabled (simplest correct model).
    ;(window as any).__dshLive2dPetRoot = root
    ;(window as any).__dshLive2dPetContainer = container
  }
  const unmount = (): void => {
    if (typeof window === 'undefined') return
    const root = (window as any).__dshLive2dPetRoot
    const container = (window as any).__dshLive2dPetContainer
    if (root) {
      try { root.unmount() } catch { /* already unmounted */ }
    }
    if (container) {
      try { container.remove() } catch { /* already removed */ }
    }
    ;(window as any).__dshLive2dPetRoot = null
    ;(window as any).__dshLive2dPetContainer = null
  }
  // Toggle listener: flip the key in console and the pet appears/disappears
  // on the next storage change.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      if (e.newValue === '1') mount()
      else unmount()
    })
  }
  mount()
}
