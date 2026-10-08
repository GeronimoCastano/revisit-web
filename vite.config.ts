/// <reference types="vitest/config" />
import preact from '@preact/preset-vite'
import { createReadStream, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { type Plugin, defineConfig, loadEnv } from 'vite'

const types: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.pdf': 'application/pdf',
}

/**
 * While developing, shares a folder of courses (REVISIT_LIBRARY in .env.local) at /local-library/
 * so the app can be tried without importing gigabytes into the browser. Never part of a build.
 */
function localLibrary(dir: string | undefined): Plugin {
  return {
    name: 'revisit-local-library',
    apply: 'serve',
    configureServer(server) {
      if (!dir) return
      const root = resolve(dir)
      const walk = (d: string): string[] =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) => {
          if (e.name.startsWith('.')) return []
          const p = join(d, e.name)
          return e.isDirectory() ? walk(p) : types[extname(e.name).toLowerCase()] ? [p] : []
        })
      server.middlewares.use('/local-library', (req, res) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0])
        if (url === '/index.json') {
          const files = walk(root).map((p) => ({ path: relative(root, p).split(sep).join('/'), size: statSync(p).size }))
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ files }))
          return
        }
        const file = resolve(root, '.' + url.replace(/^\/files/, ''))
        if (!url.startsWith('/files/') || !file.startsWith(root + sep)) {
          res.statusCode = 404
          res.end()
          return
        }
        let size: number
        try {
          size = statSync(file).size
        } catch {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', types[extname(file).toLowerCase()] ?? 'application/octet-stream')
        res.setHeader('Accept-Ranges', 'bytes')
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
        if (range) {
          const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
          if (start >= size || start > end) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${size}`)
            res.end()
            return
          }
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', String(end - start + 1))
          createReadStream(file, { start, end }).pipe(res)
        } else {
          res.setHeader('Content-Length', String(size))
          createReadStream(file).pipe(res)
        }
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Relative paths so the build works from any GitHub Pages sub-path.
    base: command === 'build' ? './' : '/',
    plugins: [preact(), localLibrary(env.REVISIT_LIBRARY)],
    build: { target: 'es2022' },
    test: { environment: 'node' },
  }
})
