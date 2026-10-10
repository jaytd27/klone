// Runs Kwoon's tests: builds the fixture PDFs, runs the engine tests (the
// PDF worker in Node), then the browser tests (Playwright driving a local
// Chrome against a Vite dev server). Usage: npm test [-- name ...]
//
// Most tests print what they found rather than asserting; a test fails if
// it exits non-zero or reports browser errors. Read its log in tests/.out/
// when changing behaviour. The OCR tests need internet access the first
// time (Tesseract downloads its engine and language data).

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(root, '.out')
fs.mkdirSync(out, { recursive: true })
const only = process.argv.slice(2)

function node(args, label) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', ...args], { cwd: path.dirname(root), encoding: 'utf8', timeout: 600_000 })
  const log = (result.stdout ?? '') + (result.stderr ?? '')
  fs.writeFileSync(path.join(out, `${label}.log`), log)
  const errors = /^errors \[\s*\]$/m.test(log) || !/^errors /m.test(log) ? null : log.match(/^errors .*$/m)?.[0]
  return { ok: result.status === 0 && !errors, log, errors }
}

const fixture = (name) => path.join(out, name)
const steps = [
  ['fixture: test.pdf', ['tests/fixtures/test-pdf.mjs', fixture('test.pdf')]],
  ['fixture: form.pdf', ['tests/fixtures/form-pdf.mjs', fixture('form.pdf')]],
  ['fixture: scan.pdf', ['tests/fixtures/scan-pdf.mjs', fixture('test.pdf'), fixture('scan.pdf')]],
  ['fixture: shapes.png', ['tests/fixtures/shapes-png.mjs', fixture('shapes.png')]],
]
const engine = [
  ['engine: content', ['tests/engine/content.mjs', fixture('test.pdf'), fixture('content-out.pdf')]],
  ['engine: edit-text', ['tests/engine/edit-text.mjs', fixture('test.pdf'), fixture('edit')]],
  ['engine: ocr-text', ['tests/engine/ocr-text.mjs', fixture('test.pdf'), fixture('scan.pdf'), fixture('ocr-p1.png')]],
  ['engine: redaction', ['tests/engine/redaction.mjs', fixture('test.pdf')]],
  ['engine: redaction-forms', ['tests/engine/redaction-forms.mjs', fixture('form.pdf')]],
  ['engine: acrobat-compat', ['tests/engine/acrobat-compat.mjs', fixture('test.pdf')]],
]
const browser = ['viewer', 'pages', 'annotations', 'forms', 'content', 'redaction', 'edit-text', 'ocr', 'ocr-rotate', 'visual'].map(
  (name) => [`browser: ${name}`, [`tests/e2e/${name}.mjs`, out]],
)

let failed = 0
const run = ([label, args]) => {
  if (only.length && !label.startsWith('fixture') && !only.some((o) => label.includes(o))) return
  const started = Date.now()
  const { ok, log, errors } = node(args, label.replace(/[^a-z0-9-]+/gi, '_'))
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  if (!ok) {
    failed++
    console.log((errors ?? log.trim().split('\n').slice(-8).join('\n')).replace(/^/gm, '      '))
  }
}

steps.forEach(run)
engine.forEach(run)

// Browser tests need the app: reuse a running dev server, or start one.
const base = process.env.KWOON_URL ?? 'http://localhost:5199/'
const up = await fetch(base).then(
  (r) => r.ok,
  () => false,
)
let server = null
if (!up && !process.env.KWOON_URL) {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.dirname(root), server: { port: 5199, strictPort: true }, logLevel: 'error' })
  await server.listen()
}
browser.forEach(run)
await server?.close()

console.log(failed ? `\n${failed} failed (logs in tests/.out/)` : '\nAll passed (logs in tests/.out/)')
process.exit(failed ? 1 : 0)
