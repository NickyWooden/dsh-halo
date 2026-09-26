// dsh-halo — client half (browser).
//
// Two surfaces:
//   1. A "发布对话" button in conversation.input.right (left of the model
//      selector): confirm, then post the current session's Q&A to Halo.
//   2. A "Halo Blog" page in Settings → Plugins (plugins.item seat) with:
//      blogUrl, username/password login, and a publish-immediately switch.

window.__ModuleLoader__.load({
  id: 'dsh-halo',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    let React = require('react')

    const NS = 'dsh-halo'

    // ------------------------------------------------------------- locale
    const en = {
      publishBtn: 'Publish to Halo',
      confirmPublish: 'Publish this conversation to the Halo blog?',
      publishing: 'Publishing…',
      publishedDraft: 'Saved as draft ✓',
      publishedLive: 'Published ✓',
      openArticle: 'Open article',
      errorPrefix: 'Failed:',
      settingsHint: 'One-click publish DSH conversations as articles on a Halo blog',
      title: 'Halo Blog',
      urlLabel: 'Blog URL',
      urlPlaceholder: 'https://blog.example.com',
      usernameLabel: 'Console username',
      usernamePlaceholder: 'admin',
      passwordPrompt: 'Enter the Halo console password:',
      pwOk: 'OK',
      pwCancel: 'Cancel',
      passwordHint: 'No password is stored — you will be asked to type it on every publish.',
      publishModeOn: 'Publish immediately after creating the article',
      publishModeOff: 'Only create a draft, do not publish',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved ✓',
      saveFailed: 'Some fields were not saved — ',
      unavailable: 'Settings are unavailable on this page.',
    }
    const zh = {
      publishBtn: '发布对话',
      confirmPublish: '是否发布到halo?',
      publishing: '正在发布…',
      publishedDraft: '已存为草稿 ✓',
      publishedLive: '已发布 ✓',
      openArticle: '打开文章',
      errorPrefix: '失败：',
      settingsHint: '一键把 DSH 问答对话发布到 Halo 博客成为文章',
      title: 'Halo 博客',
      urlLabel: '博客地址',
      urlPlaceholder: 'https://blog.example.com',
      usernameLabel: '控制台用户名',
      usernamePlaceholder: 'admin',
      passwordPrompt: '请输入 Halo 控制台密码：',
      pwOk: '确定',
      pwCancel: '取消',
      passwordHint: '密码不会被保存——每次发布时都会要求手动输入（输入内容自动隐藏，防窥视）。',
      publishModeOn: '创建文章后立即发布',
      publishModeOff: '仅创建草稿，不发布',
      save: '保存',
      saving: '保存中…',
      saved: '已保存 ✓',
      saveFailed: '部分字段未保存 — ',
      unavailable: '当前页面不可用设置。',
    }

    let moduleT = (key) => en[key] || key

    // ---------------------------------------------------------------- css
    const CSS = `
.dhalo-btn{display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsh-bg-elevated,transparent);color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;line-height:18px;padding:3px 10px;border-radius:999px;cursor:pointer;font-family:inherit}
.dhalo-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary,#e5e7eb);border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.5))}
.dhalo-btn:disabled{opacity:.6;cursor:default}
.dhalo-btnBusy{color:var(--dsh-state-business-primary,#4f8ef7)}
.dhalo-btnOk{color:#3fb96f;border-color:rgba(63,185,111,.5)}
.dhalo-btnErr{color:#e06c5f;border-color:rgba(224,108,95,.5);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dhalo-link{color:inherit;text-decoration:underline;margin-left:2px}
.dhalo-page{display:flex;flex-direction:column;gap:14px;padding:8px 2px;max-width:640px;font-size:13px;color:var(--dsw-alias-label-primary,#e5e7eb)}
.dhalo-field{display:flex;flex-direction:column;gap:6px}
.dhalo-label{font-weight:500;color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px}
.dhalo-input,.dhalo-textarea{background:var(--dsh-bg-base,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:8px;color:inherit;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:7px 10px;outline:none;width:100%;box-sizing:border-box}
.dhalo-input:focus,.dhalo-textarea:focus{border-color:var(--dsh-state-business-primary,#4f8ef7)}
.dhalo-textarea{min-height:72px;resize:vertical;line-height:1.5}
.dhalo-switchRow{display:flex;align-items:center;gap:10px;padding:4px 0}
.dhalo-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#7c828a);min-height:16px}
.dhalo-statusOk{color:#3fb96f}
.dhalo-statusErr{color:#e06c5f;word-break:break-all}
.dhalo-saveRow{display:flex;align-items:center;gap:12px}
.dhalo-save{border:none;border-radius:8px;background:var(--dsh-state-business-primary,#4f8ef7);color:#fff;font-size:13px;padding:6px 18px;cursor:pointer;font-family:inherit}
.dhalo-save:hover:not(:disabled){opacity:.9}
.dhalo-save:disabled{opacity:.5;cursor:default}
.dhalo-card{list-style:none;margin:0 0 12px;border-radius:14px;background:var(--dsh-bg-elevated,rgba(128,128,128,.07));border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
.dhalo-cardhead{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:14px 18px;background:none;border:none;color:inherit;font-family:inherit;text-align:left;cursor:pointer;border-radius:14px}
.dhalo-cardtext{display:flex;flex-direction:column;gap:3px;min-width:0}
.dhalo-cardtitle{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#e5e7eb)}
.dhalo-carddesc{font-size:12.5px;color:var(--dsh-state-business-primary,#c98a4b);opacity:.9}
.dhalo-chev{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:13px;flex:none}
.dhalo-cardbody{padding:2px 18px 16px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
.dhalo-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.dhalo-modal{width:min(380px,calc(100vw - 48px));background:var(--dsh-bg-elevated,#20242b);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--dsw-alias-label-primary,#e5e7eb);box-shadow:0 12px 40px rgba(0,0,0,.4)}
.dhalo-modalTitle{font-weight:600;font-size:13.5px}
.dhalo-modalRow{display:flex;justify-content:flex-end;gap:10px}
.dhalo-modalBtn{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));background:none;color:inherit;font-size:12.5px;padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit}
.dhalo-modalBtn:hover{border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.6))}
.dhalo-modalBtnPrimary{background:var(--dsh-state-business-primary,#4f8ef7);border:none;color:#fff}
`

    function injectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="dsh-halo"]')) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-halo'
      tag.dataset.pluginCss = 'dsh-halo'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // Imperative password modal with a MASKED input. window.prompt would show
    // the typed characters in plaintext, so this keeps them hidden (dots) for
    // anti-shoulder-surfing. Resolves with the trimmed password, or null when
    // cancelled / left empty.
    function askPassword(t) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(null); return }
        injectCss()
        let settled = false
        const overlay = document.createElement('div')
        overlay.className = 'dhalo-overlay'
        const modal = document.createElement('div')
        modal.className = 'dhalo-modal'
        modal.setAttribute('role', 'dialog')
        modal.setAttribute('aria-modal', 'true')
        const title = document.createElement('div')
        title.className = 'dhalo-modalTitle'
        title.textContent = t('passwordPrompt')
        const input = document.createElement('input')
        input.type = 'password' // masked: typed characters render as dots
        input.className = 'dhalo-input'
        input.spellCheck = false
        input.autocomplete = 'new-password'
        const row = document.createElement('div')
        row.className = 'dhalo-modalRow'
        const cancelBtn = document.createElement('button')
        cancelBtn.type = 'button'
        cancelBtn.className = 'dhalo-modalBtn'
        cancelBtn.textContent = t('pwCancel')
        const okBtn = document.createElement('button')
        okBtn.type = 'button'
        okBtn.className = 'dhalo-modalBtn dhalo-modalBtnPrimary'
        okBtn.textContent = t('pwOk')
        row.append(cancelBtn, okBtn)
        modal.append(title, input, row)
        overlay.appendChild(modal)

        const finish = (value) => {
          if (settled) return
          settled = true
          document.removeEventListener('keydown', onKey, true)
          overlay.remove()
          resolve(value)
        }
        const onKey = (e) => {
          if (e.key === 'Escape') { e.stopPropagation(); finish(null) }
          else if (e.key === 'Enter' && document.activeElement === input) {
            e.preventDefault()
            finish(input.value.trim() || null)
          }
        }
        cancelBtn.addEventListener('click', () => finish(null))
        okBtn.addEventListener('click', () => finish(input.value.trim() || null))
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(null) })

        document.body.appendChild(overlay)
        document.addEventListener('keydown', onKey, true)
        input.focus()
      })
    }

    // ------------------------------------------------- composer dock button
    function PublishButton(props) {
      const t = (props && props.t) || moduleT
      const sessionId = props && props.sessionId
      const [state, setState] = React.useState('idle') // idle | busy | ok | err
      const [info, setInfo] = React.useState(null)

      React.useEffect(() => { injectCss() }, [])

      // Reset transient states after a while so the button returns to normal.
      React.useEffect(() => {
        if (state !== 'ok' && state !== 'err') return undefined
        const timer = setTimeout(() => { setState('idle'); setInfo(null) }, 12000)
        return () => clearTimeout(timer)
      }, [state])

      async function onClick() {
        if (!sessionId || state === 'busy') return
        // Confirm before publishing — the article is created on the blog for real.
        let confirmed = false
        try { confirmed = window.confirm(t('confirmPublish')) } catch { confirmed = true }
        if (!confirmed) return
        // The password is never stored: ask for it on every publish in a modal
        // with a masked input. Cancelling or leaving it empty aborts without
        // publishing anything.
        const pw = await askPassword(t)
        if (!pw) return
        setState('busy')
        setInfo(null)
        try {
          const res = await fetch('/dsh-halo/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, password: pw }),
          })
          const data = (await res.json().catch(() => ({}))) || {}
          if (data.ok) { setState('ok'); setInfo(data) }
          else { setState('err'); setInfo(data) }
        } catch (e) {
          setState('err')
          setInfo({ error: { message: String(e && e.message ? e.message : e) } })
        }
      }

      let cls = 'dhalo-btn'
      let label = t('publishBtn')
      if (state === 'busy') { cls += ' dhalo-btnBusy'; label = t('publishing') }
      else if (state === 'ok') {
        cls += ' dhalo-btnOk'
        label = info && info.published ? t('publishedLive') : t('publishedDraft')
      } else if (state === 'err') {
        cls += ' dhalo-btnErr'
        const msg = info && info.error ? String(info.error.message || '') : ''
        label = t('errorPrefix') + (msg.length > 80 ? msg.slice(0, 80) + '…' : msg)
      }

      return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        React.createElement('button', {
          type: 'button',
          className: cls,
          disabled: state === 'busy' || !sessionId,
          title: state === 'err' && info && info.error ? String(info.error.message || '') : t('settingsHint'),
          onClick: onClick,
        }, label),
        (state === 'ok' && info && info.url)
          ? React.createElement('a', { className: 'dhalo-link dhalo-btn', href: info.url, target: '_blank', rel: 'noopener noreferrer' }, t('openArticle'))
          : null,
      )
    }

    // ------------------------------------------------------- settings page
function HaloSection(props) {
      const t = (props && props.t) || moduleT
      const ctx = props.ctx
      // 0.1.7-line hosts serve neither `lanSettings` nor a top-level
      // `settingsScope` (the latter is an rc.7+ injection key); dsh-web-all
      // serves the same binder as `webUiSettings`. Degrade to a "not ready"
      // view instead of throwing on `undefined.bind` and blanking the page.
      const scopeService = (ctx.get && (ctx.get('lanSettings') || ctx.get('webUiSettings'))) || ctx.settingsScope
      const scope = scopeService ? scopeService.bind({ namespace: NS }) : null
      const [snap, setSnap] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        const render = () => { if (alive && scope) setSnap(scope.getSnapshot()) }
        if (scope) render()
        const off = scope ? scope.subscribe(render) : null
        return () => { alive = false; if (off) off() }
      }, [])

      const ready = !!snap && snap.status === 'ready'
      const value = ready && snap.value ? snap.value : {}
      const writable = ready && snap.writable !== false

      React.useEffect(() => {
        if (!ready) return undefined
        let tries = 0
        const timer = setInterval(() => {
          if (tries >= 15) { clearInterval(timer); return }
          tries += 1
          try { ctx.settingsScope.describe().load() } catch (e) { /* service not up yet */ }
        }, 1000)
        return () => clearInterval(timer)
      }, [ready])

      React.useEffect(() => {
        if (!ready || draft !== null) return
        // No password field: the console password is asked interactively at
        // publish time and never persisted.
        setDraft({
          blogUrl: String(value.blogUrl || ''),
          username: String(value.username || ''),
          publishImmediately: value.publishImmediately !== false,
        })
      }, [ready, value])

      const save = async () => {
        if (!draft || busy) return
        setBusy(true); setErr(''); setSaved(false)
        const failed = []
        for (const k of ['blogUrl', 'username', 'publishImmediately']) {
          try { await scope.set(k, draft[k]) } catch (e) { failed.push(k + ': ' + String(e && e.message ? e.message : e)) }
        }
        setBusy(false)
        if (failed.length) setErr(t('saveFailed') + failed.join('; '))
        else setSaved(true)
      }

      if (!ready) {
        return React.createElement('div', { className: 'dhalo-status' }, t('unavailable'))
      }

      const d = draft || {}
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dhalo-field' },
          React.createElement('label', { className: 'dhalo-label' }, t('urlLabel')),
          React.createElement('input', {
            className: 'dhalo-input', type: 'text', value: d.blogUrl || '', disabled: !writable,
            placeholder: t('urlPlaceholder'), spellCheck: false,
            onChange: (e) => setDraft(Object.assign({}, d, { blogUrl: e.target.value })),
          }),
        ),
        React.createElement('div', { className: 'dhalo-field' },
          React.createElement('label', { className: 'dhalo-label' }, t('usernameLabel')),
          React.createElement('input', {
            className: 'dhalo-input', type: 'text', value: d.username || '', disabled: !writable,
            placeholder: t('usernamePlaceholder'), spellCheck: false, autoComplete: 'off',
            onChange: (e) => setDraft(Object.assign({}, d, { username: e.target.value })),
          }),
        ),
        React.createElement('div', { className: 'dhalo-status' }, t('passwordHint')),
        React.createElement('div', { className: 'dhalo-switchRow' },
          React.createElement('input', {
            id: 'dhalo-publish-immediately', type: 'checkbox', checked: d.publishImmediately !== false, disabled: !writable,
            onChange: (e) => setDraft(Object.assign({}, d, { publishImmediately: e.target.checked })),
          }),
          React.createElement('label', { htmlFor: 'dhalo-publish-immediately' },
            d.publishImmediately !== false ? t('publishModeOn') : t('publishModeOff')),
        ),
        React.createElement('div', { className: 'dhalo-saveRow' },
          React.createElement('button', { type: 'button', className: 'dhalo-save', disabled: !writable || busy, onClick: save },
            busy ? t('saving') : t('save')),
          saved && !err ? React.createElement('span', { className: 'dhalo-status dhalo-statusOk' }, t('saved')) : null,
        ),
        err ? React.createElement('div', { className: 'dhalo-status dhalo-statusErr' }, err) : null,
      )
    }

    

    // Card seat (settings.plugin.item / plugins.row.config): the Plugins
    // settings tab dispatches one keyed card per served namespace, so this is
    // where the "Halo Blog" entry appears in 设置 → 插件 → 插件配置.
    function HaloCard(props) {
      const t = (props && props.t) || moduleT
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', { className: 'dhalo-card' + (open ? ' dhalo-cardOpen' : '') },
        React.createElement('button', {
          type: 'button', className: 'dhalo-cardhead', 'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          React.createElement('span', { className: 'dhalo-cardtext' },
            React.createElement('span', { className: 'dhalo-cardtitle' }, t('title')),
            React.createElement('span', { className: 'dhalo-carddesc' }, t('settingsHint')),
          ),
          React.createElement('span', { className: 'dhalo-chev', 'aria-hidden': 'true' }, open ? '▴' : '▾'),
        ),
        // HaloSection must be rendered as an element (createElement), never called
        // as a plain function — calling it inline would run its hooks inside this
        // card's fiber and change the hook count between renders (React #310).
        open ? React.createElement('div', { className: 'dhalo-cardbody' }, React.createElement(HaloSection, props)) : null,
      )
    }

    function HaloPage(props) {
      const t = (props && props.t) || moduleT
      if (props && props.view === 'summary') {
        return React.createElement('span', null, t('settingsHint'))
      }
      if (props && props.view === 'page') {
        return React.createElement('div', { className: 'dhalo-page' }, React.createElement(HaloSection, props))
      }
      // No view prop = card seat.
      return React.createElement(HaloCard, { ctx: props.ctx })
    }

    // ------------------------------------------------------------- apply
    // `settingsScope` is an rc.7+ injection key that 0.1.7-line hosts do not
    // serve; requiring it here would keep the whole plugin unmounted on those
    // hosts, so resolve it lazily in HaloSection (lanSettings / webUiSettings
    // / settingsScope fallback chain) instead of at activation time.
    exports.inject = ['slots', 'locale']
    exports.apply = function apply(ctx) {
      const addLocale = (locale, dictionary) => {
        try { return ctx.locale.register(NS, locale, dictionary) } catch (alreadyTaken) { return () => {} }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-halo: locale dictionaries')
      moduleT = ctx.locale.bind(NS)

      // Input bar trailing area: the "发布对话" button sits in the list slot
      // rendered immediately LEFT of the model selector dropdown. The inject
      // face receives the session id of the seat's scope (same as any
      // session-scoped list entry).
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'dsh-halo-publish',
          order: 10,
          locale: NS,
          label: () => moduleT('publishBtn'),
          inject: (sessionId) => ({ sessionId }),
        },
        (props) => React.createElement(PublishButton, { ctx: ctx, sessionId: props.sessionId }),
      ))

      // Settings → Plugins → 插件配置: the official tab dispatches one keyed
      // card per served settings namespace through `settings.plugin.item`, so
      // the key must be our namespace for the "Halo Blog" card to appear.
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
        {
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        HaloPage,
      ))

      // Row-seat fallback (deployments that render plugins.row.config).
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
        {
          name: 'plugins.row.config',
          key: NS + '#' + NS,
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        HaloPage,
      ))

      // Settings → Plugins: the "Halo Blog" page. The label is a static string
      // on purpose: it is resolved while the page renders.
      ctx.slots.inject('plugins.item', () => ctx.slots.register(
        {
          name: 'plugins.item',
          id: 'dsh-halo',
          order: 70,
          label: () => 'Halo Blog',
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        HaloPage,
      ))
    }

    return module.exports
  },
})
