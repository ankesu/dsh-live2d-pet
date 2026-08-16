/**
 * tsdown config for dsh-live2d-pet — emits the node half (lib/index.js) and
 * the browser client bundle (lib/client.js). The client bundle:
 * - is CJS with the harness loader handoff (window.__ModuleLoader__.load)
 * - inlines pixi + pixi-live2d-display (no dynamic chunks: the DSH module
 *   table cannot load split chunks)
 * - uses the url shim (see dsh-client-url-shim) so @pixi/utils's node:url
 *   import compiles to a browser-safe module instead of require("url")
 */
import { urlShim } from './scripts/url-shim.js'

const PLATFORM_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
]

export default [
  {
    name: 'dsh-live2d-pet',
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    clean: false,
    external: ['@deepseek-ai/cordis'],
  },
  {
    name: 'dsh-live2d-pet/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...PLATFORM_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    noExternal: (id: string) => (PLATFORM_EXTERNALS.includes(id) ? undefined : true),
    plugins: [urlShim()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-live2d-pet", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
