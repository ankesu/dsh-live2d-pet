/**
 * Inlined copy of the dsh-client-url-shim plugin (see
 * https://github.com/ankesu/dsh-client-url-shim). Kept in-repo so the
 * package builds standalone; once the shim ships on npm this can become a
 * regular dependency.
 */
const VIRTUAL_ID = '\0dsh-builtin:url'

const SHIM_SOURCE = [
  'const g = globalThis;',
  'export const URL = g.URL ?? class URL { constructor(h){ this.href = String(h); } toString(){ return this.href; } };',
  'export const URLSearchParams = g.URLSearchParams;',
  'export const fileURLToPath = (p) => (typeof p === "string" ? p.replace(/^file:\\/\\//, "") : String(p));',
  'export const pathToFileURL = (p) => new URL("file:///" + String(p).replace(/\\\\/g, "/"));',
  'export const parse = (s) => { try { const u = new URL(String(s), "file:///"); return { protocol: u.protocol, host: u.host, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, query: u.search.slice(1), hash: u.hash, href: u.href }; } catch { return { pathname: String(s), href: String(s) }; } };',
  'export const format = (o) => String(o?.href ?? o?.pathname ?? "");',
  'export const resolve = (from, to) => {',
  '  if (!to) return String(from ?? "");',
  '  try { return new URL(String(to)).href; } catch {}',
  '  try { return new URL(String(to), String(from)).href; } catch {}',
  '  const base = String(from ?? "").split("/").slice(0, -1).join("/");',
  '  const parts = [];',
  '  for (const seg of String(to).split("/")) {',
  '    if (seg === "..") parts.pop();',
  '    else if (seg !== "." && seg !== "") parts.push(seg);',
  '  }',
  '  const joined = parts.join("/");',
  '  return base ? base + "/" + joined : joined;',
  '};',
  'export default { URL, URLSearchParams, fileURLToPath, pathToFileURL, parse, format, resolve };',
].join('\n')

export function urlShim() {
  return {
    name: 'dsh-client-browser-url-shim',
    resolveId(source) {
      if (source === 'url' || source === 'node:url') return VIRTUAL_ID
      return null
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null
      return SHIM_SOURCE
    },
  }
}
