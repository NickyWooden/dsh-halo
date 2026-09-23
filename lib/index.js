// dsh-halo — host half.
//
// One-click publishing of DSH conversations as articles on a Halo blog:
//   POST /dsh-halo/publish  { sessionId } -> { ok, url?, published?, error? }
//
// The route reads the session's durable JSONL log (zstd), extracts the real
// Q&A turns (user messages, assistant replies, ask_user_question exchanges),
// renders them to Markdown + HTML, logs into the Halo console with the stored
// username plus a password supplied in each publish request (never persisted)
// and creates a post through the Halo console API. A fresh login happens on
// every publish, so there is no long-lived credential to expire or leak.

// The DSH-ecosystem schema validator (same import as other host-plane plugins,
// e.g. @goodandready/dsh-voice). Declared as a peer dependency so pnpm links it
// in the consumer's profile; a local node_modules symlink keeps it resolvable
// when this package is installed via `link:` from outside the profile tree.
import z from '@deepseek-ai/schemastery'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

export const name = 'dsh-halo'
export const NS = 'dsh-halo'
export const inject = ['webServer', 'settings']

/** Plugin config, validated by the same-named schemastery schema.
 * Note: the console password is intentionally NOT part of the config — it is
 * entered interactively at publish time and never persisted anywhere. */
export const Config = z.object({
  blogUrl: z.string().default('')
    .description('Halo 博客地址，例如 https://blog.example.com'),
  username: z.string().default('')
    .description('Halo 控制台登录用户名'),
  publishImmediately: z.boolean().default(true)
    .description('true=创建文章后立即发布；false=仅创建草稿不发布'),
})

// ------------------------------------------------------------------- helpers

function dshHome() {
  const raw = process.env.DSH_HOME
  if (raw && raw.trim() !== '') return raw.trim()
  return join(homedir(), '.dsh')
}

/** Locate the durable log of one session: $DSH_HOME/sessions/<ws>/session-<id>/*.zstd */
function findSessionFile(sessionId) {
  const id = String(sessionId || '').trim()
  if (!/^session-[0-9a-f-]{36}$/i.test(id)) return null
  const sessionsRoot = join(dshHome(), 'sessions')
  let workspaces = []
  try { workspaces = readdirSync(sessionsRoot) } catch { return null }
  for (const ws of workspaces) {
    const dir = join(sessionsRoot, ws, id)
    if (!existsSync(dir)) continue
    let files = []
    try { files = readdirSync(dir) } catch { continue }
    const log = files.find((f) => f.endsWith('.jsonl.zstd'))
    if (log) return join(dir, log)
  }
  return null
}

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decompress a zstd buffer. DSH session logs are multi-frame streams (one
 * frame per write batch); Node's one-shot `zstdDecompressSync` only decodes
 * up to the first frame end, so split on the frame magic and decode each
 * chunk individually before falling back to the system binary.
 */
function decompressZstd(buf) {
  try {
    const bounds = []
    let i = 0
    while (true) {
      const j = buf.indexOf(ZSTD_MAGIC, i)
      if (j < 0) break
      bounds.push(j)
      i = j + 4
    }
    if (bounds.length > 1) {
      const chunks = []
      for (let k = 0; k < bounds.length; k++) {
        const start = bounds[k]
        const end = k + 1 < bounds.length ? bounds[k + 1] : buf.length
        try { chunks.push(zlib.zstdDecompressSync(buf.subarray(start, end))) } catch { /* skip bad chunk */ }
      }
      if (chunks.length) return Buffer.concat(chunks).toString('utf8')
    }
    return zlib.zstdDecompressSync(buf).toString('utf8')
  } catch { /* fall through to binary */ }
  const candidates = ['zstd', '/usr/bin/zstd', join(homedir(), '.local/bin/zstd'), join(homedir(), 'anaconda3/bin/zstd')]
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['-dc'], { input: buf, maxBuffer: 256 * 1024 * 1024 })
      if (r.status === 0 && r.stdout) return r.stdout.toString('utf8')
    } catch { /* try next */ }
  }
  throw new Error('zstd decompression unavailable (no built-in zlib.zstd and no zstd binary found)')
}

// ---------------------------------------------------------------- extraction

/** Extract the visible Q&A flow from a session JSONL document.
 *
 * Filtering rule: only user questions and generated results are published —
 * the model's thinking process is dropped. Concretely, per "span" (from one
 * real user message until the next):
 *   - `reasoning` blocks (chain of thought) are never included;
 *   - assistant text blocks that accompany tool calls are intermediate
 *     progress narration and are dropped;
 *   - a span's answer is its final reply — the last text block(s) from
 *     messages containing no tool call. If a span ends without such a final
 *     message (work continued into the next user prompt), its last visible
 *     text block is used as the fallback result.
 *   - AI questions (ask_user_question) and the user's choices stay, since
 *     they are part of the visible dialogue. */
export function extractConversation(jsonlText) {
  let title = ''
  const turns = []

  // Current span: queued questions + ordered visible events + buffered texts.
  let pendingQs = []
  let spanEvents = []   // { kind: 'ai_q' | 'choice', text } in event order
  let spanTexts = []    // { text, final } assistant text blocks

  const flushSpan = () => {
    if (!pendingQs.length && !spanTexts.length) { pendingQs = []; spanEvents = []; spanTexts = []; return }
    for (const q of pendingQs) turns.push({ kind: 'q', text: q })
    for (const ev of spanEvents) turns.push(ev)
    const finals = spanTexts.filter((x) => x.final).map((x) => x.text)
    let answer = ''
    if (finals.length) answer = finals.join('\n\n')
    else if (spanTexts.length) answer = spanTexts[spanTexts.length - 1].text
    if (answer.trim()) turns.push({ kind: 'a', text: answer.trim() })
    pendingQs = []
    spanEvents = []
    spanTexts = []
  }

  for (const line of jsonlText.split('\n')) {
    if (!line.trim()) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    const t = o.type
    const d = o.data || {}
    if (t === 'session/title') {
      const v = typeof d.title === 'string' ? d.title.trim() : ''
      if (v && !title) title = v.slice(0, 120)
      continue
    }
    if (t === 'user/message') {
      const src = d.source || {}
      if (!(src.kind === 'user')) continue
      const texts = []
      const c = d.content
      if (Array.isArray(c)) {
        for (const b of c) if (b && b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
      } else if (typeof c === 'string') texts.push(c)
      const text = texts.join('\n').trim()
      // A new real user message closes the previous span; image-only
      // messages carry no extractable text and continue the current span.
      if (!text) continue
      flushSpan()
      pendingQs.push(text)
    } else if (t === 'assistant/message') {
      const m = d.message || {}
      const c = m.content
      if (!Array.isArray(c)) continue
      // A message without tool calls is a terminal reply to the user; one
      // with tool calls is intermediate narration around the work.
      const hasToolCall = c.some((b) => b && b.type === 'tool-call')
      for (const b of c) {
        if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          spanTexts.push({ text: b.text.trim(), final: !hasToolCall })
        }
      }
    } else if (t === 'tool/call') {
      if (d.name !== 'ask_user_question') continue
      let qs = []
      try {
        const args = JSON.parse(d.arguments || '{}')
        qs = (args.questions || []).map((q) => String(q.question || '').trim()).filter(Boolean)
      } catch { /* ignore */ }
      if (qs.length) spanEvents.push({ kind: 'ai_q', text: qs.join('\n') })
    } else if (t === 'tool/result') {
      const msg = d.message || {}
      const src = msg.source || {}
      if (!(src.kind === 'tool')) continue
      const c = msg.content || []
      for (const b of c) {
        if (!b || b.type !== 'tool-result') continue
        for (const ib of b.content || []) {
          if (!ib || ib.type !== 'text' || typeof ib.text !== 'string') continue
          const s = ib.text.trim()
          if (!s.startsWith('{"answers"')) continue
          let parts = []
          try {
            const ans = JSON.parse(s)
            for (const a of ans.answers || []) {
              const v = String(a.custom || (Array.isArray(a.selected) ? a.selected.join(', ') : '')).trim()
              if (v) parts.push(v)
            }
          } catch { /* ignore */ }
          if (parts.length) spanEvents.push({ kind: 'choice', text: parts.join('\n') })
        }
      }
    }
  }
  flushSpan()
  return { title, turns }
}

/** Render the extracted turns as a Markdown article. */
export function renderMarkdown(title, turns) {
  const md = []
  md.push('> 本文是一次 DeepSeek Harness（DSH）AI 编程助手的问答对话实录，由 dsh-halo 插件自动生成。')
  md.push('')
  md.push('## 💬 对话实录')
  md.push('')
  let qn = 0
  for (const turn of turns) {
    if (turn.kind === 'q') {
      qn += 1
      md.push('**🙋 用户：**')
      md.push('')
      md.push(turn.text)
      md.push('')
    } else if (turn.kind === 'a') {
      md.push('**🤖 AI：**')
      md.push('')
      md.push(turn.text)
      md.push('')
    } else if (turn.kind === 'ai_q') {
      for (const q of turn.text.split('\n')) {
        const s = q.trim()
        if (s) md.push(`> ❓ **AI 提问：** ${s}`)
      }
      md.push('')
    } else {
      md.push('**🙋 用户的选择：**')
      md.push('')
      md.push(turn.text)
      md.push('')
    }
  }
  if (turns.length === 0) {
    md.push('_（本次会话还没有可提取的问答内容。）_')
    md.push('')
  }
  return md.join('\n')
}

// ------------------------------------------------------------- markdown -> html

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Minimal built-in Markdown → HTML (fallback when pandoc is unavailable). */
export function markdownToHtmlFallback(md) {
  const lines = md.split('\n')
  const out = []
  let inCode = false
  let codeLang = ''
  let codeBuf = []
  let para = []
  let listType = null

  const inline = (s) => {
    let t = escapeHtml(s)
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    return t
  }

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] }
  }
  const flushList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (/^```/.test(line.trim())) {
      if (!inCode) {
        flushPara(); flushList()
        inCode = true
        codeLang = line.trim().slice(3).trim()
        codeBuf = []
      } else {
        out.push(`<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
        inCode = false
        codeLang = ''
        codeBuf = []
      }
      continue
    }
    if (inCode) { codeBuf.push(raw); continue }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue }
    if (/^\s*>/.test(line)) {
      flushPara(); flushList()
      const q = line.replace(/^\s*>\s?/, '')
      out.push(`<blockquote><p>${inline(q)}</p></blockquote>`)
      continue
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) { flushPara(); if (listType !== 'ul') { flushList(); out.push('<ul>'); listType = 'ul' }; out.push(`<li>${inline(ul[1])}</li>`); continue }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) { flushPara(); if (listType !== 'ol') { flushList(); out.push('<ol>'); listType = 'ol' }; out.push(`<li>${inline(ol[1])}</li>`); continue }
    if (line.trim() === '') { flushPara(); flushList(); continue }
    para.push(line.trim())
  }
  if (inCode && codeBuf.length) out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  flushPara(); flushList()
  return out.join('\n')
}

/** Convert Markdown to HTML: prefer pandoc, fall back to the built-in converter. */
function markdownToHtml(md) {
  const candidates = ['pandoc', '/usr/bin/pandoc', join(homedir(), '.local/bin/pandoc'), join(homedir(), 'anaconda3/bin/pandoc')]
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['-f', 'markdown', '-t', 'html5'], { input: md, maxBuffer: 64 * 1024 * 1024 })
      if (r.status === 0 && r.stdout && String(r.stdout).trim()) return { html: String(r.stdout), engine: 'pandoc' }
    } catch { /* try next */ }
  }
  return { html: markdownToHtmlFallback(md), engine: 'builtin' }
}

// ------------------------------------------------------------------- halo api

const HALO_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Extract the CSRF token from a Halo /login page (several known shapes). */
function extractCsrf(html) {
  const patterns = [
    /name="_csrf"[^>]*value="([^"]+)"/,
    /value="([^"]+)"[^>]*name="_csrf"/,
    /"csrfToken"\s*:\s*"([^"]+)"/,
    /_csrf=([A-Za-z0-9_%\-]+)/,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return m[1]
  }
  return ''
}

/** Parse `name=value` pairs out of a Cookie header string. */
function parseCookieHeader(cookieStr) {
  const out = {}
  for (const part of String(cookieStr || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

/**
 * Extract the Base64 RSA public key embedded in a Halo login page. The theme's
 * inline script declares `const publicKey = "MIIC..."` (JS string escapes like
 * \/ are unescaped here); some deployments also expose GET /login/public-key.
 */
function extractPublicKey(html) {
  // The inline script declares `const publicKey = "MIIC..."`; the Base64 body
  // may contain JS-escaped slashes (\/), which are unescaped below.
  const m = html.match(/publicKey\s*=\s*"([^"]{100,})"/) || html.match(/"base64Format"\s*:\s*"([A-Za-z0-9+\/=]{100,})"/)
  if (m && m[1]) return m[1].replace(/\\\//g, '/')
  return ''
}

/**
 * Encrypt a plaintext password the way the Halo console does: RSA PKCS#1 v1.5
 * with the login page's public key, Base64-encoded (JSEncrypt equivalent).
 */
function encryptPassword(plainPassword, publicKeyB64) {
  const der = Buffer.from(publicKeyB64.replace(/\\\//g, '/'), 'base64')
  let keyObj
  try {
    keyObj = crypto.createPublicKey({ key: der, format: 'der', type: 'pkcs8' })
  } catch {
    // Some deployments serve a SubjectPublicKeyInfo (X.509) key instead.
    keyObj = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
  }
  const cipher = crypto.publicEncrypt(
    { key: keyObj, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(String(plainPassword), 'utf8'),
  )
  return cipher.toString('base64')
}

/**
 * Log into the Halo console and return a ready-to-use Cookie header string.
 * Flow (verified against Halo 2.x): GET /login to obtain the per-page _csrf
 * value, the XSRF-TOKEN cookie and the RSA public key; encrypt the password
 * with it (the server Base64-decodes then decrypts the submitted password);
 * POST /login as urlencoded form data. A failed login redirects to
 * /login?error=invalid-credential; a successful one sets the SESSION cookie.
 */
async function haloLogin(cfg) {
  const base = cfg.blogUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) throw new Error('blogUrl must start with http:// or https://')

  const res1 = await fetch(`${base}/login`, { headers: { 'User-Agent': HALO_UA, Accept: 'text/html' } })
  if (res1.status >= 400) throw new Error(`Halo login page returned HTTP ${res1.status}`)
  const html = await res1.text()
  const csrf = extractCsrf(html)
  if (!csrf) throw new Error('could not find a CSRF token on the Halo login page (unexpected page layout?)')

  // The password must be RSA-encrypted client-side; get the public key from
  // the dedicated endpoint first, falling back to the inline script.
  let publicKeyB64 = ''
  try {
    const pkRes = await fetch(`${base}/login/public-key`, { headers: { 'User-Agent': HALO_UA, Accept: 'application/json' } })
    if (pkRes.ok) {
      const pkBody = await pkRes.json()
      publicKeyB64 = String((pkBody && (pkBody.base64Format || pkBody.publicKey)) || '')
    }
  } catch { /* fall back to HTML parsing */ }
  if (!publicKeyB64) publicKeyB64 = extractPublicKey(html)
  let passwordField
  try {
    passwordField = encryptPassword(cfg.password, publicKeyB64)
  } catch (e) {
    throw new Error(`could not encrypt the login password (${String(e && e.message || e)}) — no usable public key found on the Halo login page?`)
  }

  // Keep the XSRF-TOKEN cookie from step 1 in our little jar.
  const jar = []
  for (const c of res1.headers.getSetCookie ? res1.headers.getSetCookie() : []) {
    if (/^XSRF-TOKEN=/i.test(c)) jar.push(c.split(';')[0])
  }

  const form = new URLSearchParams({ username: String(cfg.username || ''), password: passwordField, _csrf: csrf })
  const res2 = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'User-Agent': HALO_UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: base,
      Referer: `${base}/login`,
      ...(jar.length ? { Cookie: jar.join('; ') } : {}),
    },
    body: form.toString(),
  })

  const location = String(res2.headers.get('location') || '')
  if (res2.status >= 400) throw new Error(`Halo login returned HTTP ${res2.status}`)
  if (/error=/.test(location)) {
    let code = 'login-failed'
    try { code = new URLSearchParams(location.split('?')[1] || '').get('error') || code } catch { /* keep default */ }
    throw new Error(code === 'invalid-credential' ? 'Halo 登录失败：用户名或密码不正确（invalid-credential）' : `Halo 登录失败（${code}），请检查博客地址与账号`)
  }

  for (const c of res2.headers.getSetCookie ? res2.headers.getSetCookie() : []) {
    const nv = c.split(';')[0]
    if (!nv) continue
    // Drop any stale entry with the same name, then append.
    const name = nv.split('=')[0]
    for (let i = jar.length - 1; i >= 0; i--) {
      if (jar[i].split('=')[0] === name) jar.splice(i, 1)
    }
    jar.push(nv)
  }

  const cookieHeader = jar.join('; ')
  if (!parseCookieHeader(cookieHeader).SESSION) {
    throw new Error('Halo login did not return a SESSION cookie — the account may be locked or the response was unexpected')
  }
  return cookieHeader
}

function makeSlug() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `dsh-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Create a post on the Halo blog. Returns { url, published }. */
async function createHaloPost(base, cookieHeader, publishImmediately, title, markdown) {
  if (!/^https?:\/\//i.test(base)) throw new Error('blogUrl must start with http:// or https://')
  const cookies = parseCookieHeader(cookieHeader)
  const now = new Date().toISOString()
  const slug = makeSlug()
  const { html } = markdownToHtml(markdown)
  const body = {
    post: {
      apiVersion: 'content.halo.run/v1alpha1',
      kind: 'Post',
      metadata: {
        name: crypto.randomUUID(),
        annotations: { 'content.halo.run/preferred-editor': 'bytemd' },
      },
      spec: {
        title,
        slug,
        deleted: false,
        publish: !!publishImmediately,
        ...(publishImmediately ? { published: now } : {}),
        allowComment: true,
        pinned: false,
        visible: 'PUBLIC',
        excerpt: { autoGenerate: true, raw: '' },
        priority: 0,
      },
    },
    content: { raw: markdown, content: html, rawType: 'markdown' },
  }
  const res = await fetch(`${base}/apis/api.console.halo.run/v1alpha1/posts`, {
    method: 'POST',
    headers: {
      'User-Agent': HALO_UA,
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(cookies['XSRF-TOKEN'] ? { 'X-XSRF-TOKEN': cookies['XSRF-TOKEN'] } : {}),
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 400)
    try { detail = String(JSON.parse(text).detail || text).slice(0, 400) } catch { /* keep raw */ }
    throw new Error(`Halo API HTTP ${res.status}: ${detail}`)
  }
  // Halo redirects unauthenticated API calls to /login (200 + HTML); a redirect
  // must never be mistaken for success.
  const contentType = String(res.headers.get('content-type') || '')
  if (!contentType.includes('application/json')) {
    throw new Error(`Halo API did not return JSON (got ${contentType || 'no content-type'} at ${res.url}) — the login session was rejected, please check the username/password in settings`)
  }
  let created = null
  try { created = JSON.parse(text) } catch { /* fall through */ }
  if (!created || !created.metadata || !created.spec) {
    throw new Error(`Halo API returned an unexpected response: ${text.slice(0, 200)}`)
  }
  return { url: `${base}/archives/${slug}`, published: !!publishImmediately }
}

// ----------------------------------------------------------------------- route

function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket may already be closed */ }
}

/** Fail-closed caller guard: loopback or same-origin browser requests only. */
function isTrustedCaller(req) {
  const remote = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || ''
  const clean = String(remote).replace(/^::ffff:/, '')
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true
  const secSite = String((req.headers && req.headers['sec-fetch-site']) || '').toLowerCase()
  if (secSite === 'same-origin' || secSite === 'same-site') return true
  if (secSite === 'cross-site') return false
  const origin = String((req.headers && req.headers.origin) || '').trim().toLowerCase()
  const host = String((req.headers && req.headers.host) || '').toLowerCase()
  if (origin && host) {
    try {
      const u = new URL(origin)
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && `${u.hostname}:${u.port}` === host) return true
    } catch { /* fall through */ }
  }
  return false
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function apply(ctx, baseConfig) {
  let scope = null
  let getConfig = () => baseConfig
  const live = () => Config(structuredClone(getConfig() ?? {})) || (baseConfig || {})

  ctx.inject(['settings'], (sctx) => {
    scope = sctx.settings.register(NS, Config, { base: baseConfig })
    getConfig = () => scope.get() ?? baseConfig
    sctx.effect(() => () => { getConfig = () => baseConfig; scope = null }, 'dsh-halo: settings cleanup')
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-halo/publish',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'untrusted caller' } }); return }
      let payload = {}
      try {
        const raw = await readBody(req)
        if (raw.length) payload = JSON.parse(raw.toString('utf8'))
      } catch (e) { writeJson(res, 400, { ok: false, error: { code: 'bad-body', message: String(e && e.message || e) } }); return }

      const cfg = live()
      if (!cfg.blogUrl || !String(cfg.blogUrl).trim()) {
        writeJson(res, 200, { ok: false, error: { code: 'not-configured', message: '未配置博客地址：请在 设置 → Plugins → Halo Blog 中填写 blogUrl' } })
        return
      }
      if (!cfg.username || !String(cfg.username).trim()) {
        writeJson(res, 200, { ok: false, error: { code: 'not-configured', message: '未配置登录用户名：请在 设置 → Plugins → Halo Blog 中填写控制台用户名' } })
        return
      }
      // The password is never stored — it arrives with each publish request.
      const password = String(payload.password || '').trim()
      if (!password) {
        writeJson(res, 200, { ok: false, error: { code: 'password-required', message: '未输入登录密码：发布时需要手动输入 Halo 控制台密码' } })
        return
      }

      const file = findSessionFile(payload.sessionId || '')
      if (!file) {
        writeJson(res, 200, { ok: false, error: { code: 'session-not-found', message: `找不到会话 ${payload.sessionId || '(empty)'} 的日志文件` } })
        return
      }

      let jsonlText = ''
      try { jsonlText = decompressZstd(readFileSync(file)) } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'read-failed', message: String(e && e.message || e) } })
        return
      }

      const { title, turns } = extractConversation(jsonlText)
      if (!turns.length) {
        writeJson(res, 200, { ok: false, error: { code: 'empty-conversation', message: '会话中没有可提取的问答内容' } })
        return
      }
      const articleTitle = title || `DSH 对话 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
      const markdown = renderMarkdown(articleTitle, turns)

      // Fresh login on every publish with the just-entered password — nothing
      // is stored, so there is no long-lived credential to expire or leak.
      let cookieHeader = ''
      try {
        const loginCfg = Object.assign({}, cfg, { password })
        cookieHeader = await haloLogin(loginCfg)
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'login-failed', message: String(e && e.message || e) } })
        return
      }

      try {
        const result = await createHaloPost(cfg.blogUrl.replace(/\/+$/, ''), cookieHeader, cfg.publishImmediately !== false, articleTitle, markdown)
        writeJson(res, 200, { ok: true, ...result, title: articleTitle })
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'halo-error', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-halo: /publish route')
}
