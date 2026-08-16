/**
 * dsh-live2d-pet host half — injects the Cubism core script into the
 * document head (before the client bundle evaluates, because
 * pixi-live2d-display checks window.Live2DCubismCore at module time) and
 * serves the model assets under /pet/live2d/*.
 * @module dsh-live2d-pet
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Browser-facing base path of Live2D model assets. */
export const LIVE2D_PREFIX = '/pet/live2d'

/** MIME map for model assets (served by extension). */
const LIVE2D_MIME: Record<string, string> = {
  '.json': 'application/json',
  '.moc3': 'application/octet-stream',
  '.png': 'image/png',
  '.js': 'application/javascript',
}

/** Absolute package root, resolved from this module's own location (lib/). */
export function packageRoot(importMetaUrl: string): string {
  return fileURLToPath(new URL('../', importMetaUrl))
}

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'live2d-pet'

/** Services required before the plugin can mount its surfaces. */
export const inject = ['webServer']

/** Default model path relative to assets/live2d/. */
export const DEFAULT_MODEL = 'haru/haru_greeter_t03.model3.json'

export function apply(ctx: Context, config: { model?: string; size?: number; right?: number; bottom?: number } = {}): void {
  const model = config.model ?? DEFAULT_MODEL
  const root = packageRoot(import.meta.url)

  // 1. Serve the Cubism core and the model assets.
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      // No trailing slash: the webserver matches prefixes with `${prefix}/`,
      // so a trailing slash would never match.
      path: LIVE2D_PREFIX,
      handler: async (req, res): Promise<void> => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        const url = new URL(req.url ?? '', 'http://local')
        const rel = decodeURIComponent(url.pathname.slice(LIVE2D_PREFIX.length + 1))
        const filePath = join(root, 'assets', 'live2d', rel)
        const rootPath = join(root, 'assets', 'live2d')
        if (filePath !== rootPath && !filePath.startsWith(rootPath + '\\') && !filePath.startsWith(rootPath + '/')) {
          res.writeHead(403)
          res.end()
          return
        }
        try {
          const body = await readFile(filePath)
          const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
          res.writeHead(200, {
            'content-type': LIVE2D_MIME[ext] ?? 'application/octet-stream',
            'content-length': String(body.byteLength),
            'cache-control': 'no-cache',
          })
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          res.end(body)
        } catch {
          res.writeHead(404)
          res.end()
        }
      },
    })
    return () => { dispose() }
  }, 'live2d-pet: asset routes')

  // 2. Inject the Cubism core script into the document head — before the
  // client bundle runs — so window.Live2DCubismCore exists at module time.
  ctx.effect(() => {
    const dispose = ctx.webServer.tapIndex((html) => {
      const injected = `<script src="${LIVE2D_PREFIX}/live2dcubismcore.min.js"></script>`
      return html.replace(/<head[^>]*>/, (m) => m + injected)
    })
    return () => { dispose() }
  }, 'live2d-pet: core injection')

  // 3. Expose the resolved model path for the client (same-origin JSON).
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: '/pet/live2d/config',
      handler: (req, res): void => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        const body = JSON.stringify({ model: `${LIVE2D_PREFIX}/${model}`, size: config.size ?? 320, right: config.right ?? 24, bottom: config.bottom ?? 20 })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        res.end(body)
      },
    })
    return () => { dispose() }
  }, 'live2d-pet: config route')
}
