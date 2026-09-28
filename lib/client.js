// dsh-halo — client half (browser).
//
// Two surfaces:
//   1. A "发布对话" button in conversation.input.right (left of the model
//      selector): confirm, then post the current session's Q&A to Halo.
//   2. A dshmarket-style collapsible settings card (HaloCard) in the 插件
//      (Plugins) section, registered in two seats:
//        - settings.plugins.tab (the "Halo Blog" tab of the Plugins settings
//          section), and
//        - plugins.bundle.config (the keyed bundle-configuration seat of the
//          official plugin-manager page, keyed by this bundle's package name).
//      The card is a click-to-expand dropdown: the header (name + description
//      + a rotating chevron) toggles a body that holds the blogUrl / username /
//      publish-immediately form. The style mirrors dshmarket's SettingsCard.

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
      publishModeLabel: 'Publish mode',
      publishModeOn: 'Publish immediately after creating the article',
      publishModeOff: 'Only create a draft, do not publish',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved ✓',
      saveFailed: 'Some fields were not saved — ',
      unavailable: 'Settings are unavailable on this page.',
      restartBannerText: 'dsh-halo was just installed. Restart DSH for it to take effect.',
      restartBannerDismiss: 'Dismiss',
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
      publishModeLabel: '发布模式',
      publishModeOn: '创建文章后立即发布',
      publishModeOff: '仅创建草稿，不发布',
      save: '保存',
      saving: '保存中…',
      saved: '已保存 ✓',
      saveFailed: '部分字段未保存 — ',
      unavailable: '当前页面不可用设置。',
      restartBannerText: 'dsh-halo 刚刚安装完成，重启 DSH 后生效。',
      restartBannerDismiss: '知道了',
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
.dhalo-input{background:var(--dsh-bg-base,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:8px;color:inherit;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:7px 10px;outline:none;width:100%;box-sizing:border-box}
.dhalo-input:focus{border-color:var(--dsh-state-business-primary,#4f8ef7)}
.dhalo-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#7c828a);min-height:16px}
.dhalo-statusOk{color:#3fb96f}
.dhalo-statusErr{color:#e06c5f;word-break:break-all}
.dhalo-overlay{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.dhalo-modal{width:min(380px,calc(100vw - 48px));background:var(--dsh-bg-elevated,#20242b);border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--dsw-alias-label-primary,#e5e7eb);box-shadow:0 12px 40px rgba(0,0,0,.4)}
.dhalo-modalTitle{font-weight:600;font-size:13.5px}
.dhalo-modalRow{display:flex;justify-content:flex-end;gap:10px}
.dhalo-modalBtn{border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));background:none;color:inherit;font-size:12.5px;padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit}
.dhalo-modalBtn:hover{border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.6))}
.dhalo-modalBtnPrimary{background:var(--dsh-state-business-primary,#4f8ef7);border:none;color:#fff}
/* dshmarket-style settings card (the 插件 section entry). Class names are
   prefixed dhalo-set* so they never collide with dshmarket's own hashed
   nUhMVa_set* classes when both plugins are loaded on the same page. */
.dhalo-setCard{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:12px;list-style:none;margin:0;transition:border-color .16s,background .16s}
.dhalo-setCard:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}
.dhalo-setCardOpen{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}
.dhalo-setHeader{-webkit-appearance:none;appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dhalo-setHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}
.dhalo-setHeadText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dhalo-setName{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}
.dhalo-setDesc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}
.dhalo-setChevron{color:var(--dsw-alias-label-tertiary,#8b93a1);flex:none;transition:transform .16s;display:inline-flex}
.dhalo-setChevronOpen{transform:rotate(180deg)}
.dhalo-setBody{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding-bottom:8px}
.dhalo-setRow{align-items:center;gap:12px;padding:12px 0;display:flex}
.dhalo-setRow+.dhalo-setRow{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb)}
.dhalo-setLabelBox{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}
.dhalo-setLabel{font-size:13px;line-height:20px}
.dhalo-setHint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}
.dhalo-setActions{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.dhalo-setInput{background:var(--dsh-bg-base,rgba(128,128,128,.08));border:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.4));border-radius:8px;color:inherit;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:7px 10px;outline:none;width:100%;max-width:340px;box-sizing:border-box}
.dhalo-setInput:focus{border-color:var(--dsh-state-business-primary,#4f8ef7)}
.dhalo-setSwitch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;flex:none}
.dhalo-setSwitch input{margin:0}
.dhalo-setSave{border:none;border-radius:8px;background:var(--dsh-state-business-primary,#4f8ef7);color:#fff;font-size:13px;padding:6px 18px;cursor:pointer;font-family:inherit}
.dhalo-setSave:hover:not(:disabled){opacity:.9}
.dhalo-setSave:disabled{opacity:.5;cursor:default}
.dhalo-restartBanner{position:fixed;top:0;left:0;right:0;z-index:10001;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;background:var(--dsh-state-business-primary,#4f8ef7);color:#fff;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,.2)}
.dhalo-restartBannerText{flex:1;min-width:0}
.dhalo-restartBannerClose{border:none;background:none;color:inherit;font-size:18px;cursor:pointer;padding:0 4px;line-height:1}
.dhalo-restartBannerClose:hover{opacity:.8}
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
      // Self-contained card: fetches its own server API endpoints directly,
      // no configForms dependency. Degrade to a "not ready" view when the
      // server is unreachable. (Previously used the 0.1.7-rc.2 `configForms`
      // service, which never became ready on some hosts, leaving the form
      // stuck on "unavailable".)
      const [snap, setSnap] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        const load = async () => {
          try {
          const res = await fetch('/dsh-halo/settings', { cache: 'no-store' })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          const body = await res.json()
          if (alive && body && body.ok) setSnap(body.config || {})
        } catch (e) {
          if (alive) setSnap(null)
        }
        }
        load()
        return () => { alive = false }
      }, [])

      const ready = !!snap
      const value = ready ? snap : {}
      const writable = true

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
        try {
          const res = await fetch('/dsh-halo/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(draft),
          })
          const body = await res.json()
          if (!body || !body.ok) throw new Error(body && body.error ? (body.error.message || body.error.message) : 'save failed')
          setSnap(body.config || draft)
          setSaved(true)
        } catch (e) {
          setErr(t('saveFailed') + String(e && e.message ? e.message : e))
        }
        setBusy(false)
      }

      if (!ready) {
        return React.createElement('div', { className: 'dhalo-status' }, t('unavailable'))
      }

      const d = draft || {}
      // One label + hint block with an optional action, the host's row shape
      // (mirrors dshmarket's SettingsCard `row` helper).
      const row = (label, hint, action) => React.createElement('div', { className: 'dhalo-setRow' },
        React.createElement('div', { className: 'dhalo-setLabelBox' },
          React.createElement('div', { className: 'dhalo-setLabel' }, label),
          React.createElement('div', { className: 'dhalo-setHint' }, hint),
        ),
        action,
      )

      return React.createElement(React.Fragment, null,
        row(t('urlLabel'), t('urlPlaceholder'),
          React.createElement('input', {
            className: 'dhalo-setInput', type: 'text', value: d.blogUrl || '', disabled: !writable,
            placeholder: t('urlPlaceholder'), spellCheck: false,
            onChange: (e) => setDraft(Object.assign({}, d, { blogUrl: e.target.value })),
          }),
        ),
        row(t('usernameLabel'), t('usernamePlaceholder'),
          React.createElement('input', {
            className: 'dhalo-setInput', type: 'text', value: d.username || '', disabled: !writable,
            placeholder: t('usernamePlaceholder'), spellCheck: false, autoComplete: 'off',
            onChange: (e) => setDraft(Object.assign({}, d, { username: e.target.value })),
          }),
        ),
        row(t('publishModeLabel'), d.publishImmediately !== false ? t('publishModeOn') : t('publishModeOff'),
          React.createElement('label', { className: 'dhalo-setSwitch' },
            React.createElement('input', {
              type: 'checkbox', checked: d.publishImmediately !== false, disabled: !writable,
              onChange: (e) => setDraft(Object.assign({}, d, { publishImmediately: e.target.checked })),
            }),
          ),
        ),
        React.createElement('div', { className: 'dhalo-setHint', style: { padding: '10px 0 4px' } }, t('passwordHint')),
        React.createElement('div', { className: 'dhalo-setActions' },
          saved && !err ? React.createElement('span', { className: 'dhalo-status dhalo-statusOk' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dhalo-status dhalo-statusErr' }, err) : null,
          React.createElement('button', { type: 'button', className: 'dhalo-setSave', disabled: !writable || busy, onClick: save },
            busy ? t('saving') : t('save')),
        ),
      )
    }

    

    // The dshmarket-style collapsible settings card. It is the entry point for
    // the Halo Blog settings in the 插件 (Plugins) section, registered in two
    // seats: the `settings.plugins.tab` tab and the `plugins.bundle.config`
    // keyed bundle-configuration seat. The header (name + description + a
    // rotating chevron) toggles a body that holds the `HaloSection` form.
    function HaloCard(props) {
      const t = (props && props.t) || moduleT
      const [open, setOpen] = React.useState(false)
      return React.createElement('div', { className: 'dhalo-setCard' + (open ? ' dhalo-setCardOpen' : '') },
        React.createElement('button', {
          type: 'button', className: 'dhalo-setHeader', 'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          React.createElement('div', { className: 'dhalo-setHeadText' },
            React.createElement('div', { className: 'dhalo-setName' }, t('title')),
            React.createElement('div', { className: 'dhalo-setDesc' }, t('settingsHint')),
          ),
          // A single chevron that rotates 180° when open (dshmarket's pattern).
          React.createElement('span', {
            className: 'dhalo-setChevron' + (open ? ' dhalo-setChevronOpen' : ''),
            'aria-hidden': 'true',
          }, '▾'),
        ),
        // HaloSection must be rendered as an element (createElement), never called
        // as a plain function — calling it inline would run its hooks inside this
        // card's fiber and change the hook count between renders (React #310).
        open ? React.createElement('div', { className: 'dhalo-setBody' }, React.createElement(HaloSection, props)) : null,
      )
    }

    // ------------------------------------------- market restart detection
    // When dsh-halo is installed through the dsh-market panel but is NOT
    // hot-mounted, the market parks it behind a restart and records that in
    // its own sessionStorage key `dshm-restart` (a boot-scoped snapshot of
    // the pending-restart state). The key's shape is:
    //   { boot, doneUrls: [url, …], updated: [name, …],
    //     restartNames: [name, …], removed: n, toggled: n }
    // The install flow parks a non-hot plugin in `doneUrls` (by URL); the
    // update flow parks a restart-pending plugin in `restartNames` (by
    // name). We match either, so the banner covers both entry points. The
    // key is removed by the market when the boot id changes (a restart
    // happened) or when every pending item clears, so a stale key can never
    // re-raise the banner after a restart.
    function readMarketRestart() {
      try {
      const raw = sessionStorage.getItem('dshm-restart')
      if (!raw) return null
      const obj = JSON.parse(raw)
      return (obj && typeof obj === 'object') ? obj : null
      } catch (e) { return null }
    }
    function marketBootId() {
      const obj = readMarketRestart()
      return (obj && obj.boot !== undefined && obj.boot !== null) ? String(obj.boot) : null
    }
    function marketNeedsRestart() {
      const obj = readMarketRestart()
      if (!obj) return false
      if (Array.isArray(obj.restartNames) && obj.restartNames.indexOf('dsh-halo') !== -1) return true
      if (Array.isArray(obj.doneUrls)) {
        for (const url of obj.doneUrls) {
          if (typeof url === 'string' && url.indexOf('dsh-halo') !== -1) return true
        }
      }
      return false
    }

    // A thin, fixed bar pinned to the top of the viewport, shown only while
    // the user is on the market page and dsh-halo is parked behind a
    // restart. It is a plain DOM node (not a React component) so it does not
    // depend on any seat being rendered on the market page; a short poll
    // keeps it in sync with the market's sessionStorage state and with page
    // navigation. Dismissal is remembered per boot id, so a dismissed banner
    // stays gone until the next host process (i.e. until after a restart).
    function setupRestartBanner() {
      if (typeof document === 'undefined') return () => {}
      const banner = document.createElement('div')
      banner.className = 'dhalo-restartBanner'
      banner.style.display = 'none'
      const textEl = document.createElement('span')
      textEl.className = 'dhalo-restartBannerText'
      const closeBtn = document.createElement('button')
      closeBtn.className = 'dhalo-restartBannerClose'
      closeBtn.type = 'button'
      closeBtn.textContent = '×'
      banner.appendChild(textEl)
      banner.appendChild(closeBtn)
      document.body.appendChild(banner)

      // The dismissal is read from sessionStorage on every tick (not a boot-time
      // snapshot): the close button writes the current boot id there, and a
      // stale snapshot would let the next 500ms tick resurrect a banner the
      // user just dismissed. A dismissal is scoped to the boot it was made in,
      // so a later restart (a new boot id) re-arms the banner automatically.
      const isDismissedForBoot = (boot) => {
        if (boot === null) return false
        try {
          return sessionStorage.getItem('dsh-halo-restart-dismissed') === boot
        } catch (e) { return false }
      }

      closeBtn.addEventListener('click', () => {
        const boot = marketBootId()
        if (boot !== null) {
          try { sessionStorage.setItem('dsh-halo-restart-dismissed', boot) } catch (e) {}
        }
        banner.style.display = 'none'
      })

      const tick = () => {
        const onMarket = !!document.querySelector('[data-dsh-market-root]')
        const needsRestart = marketNeedsRestart()
        const boot = marketBootId()
        const dismissed = isDismissedForBoot(boot)
        banner.style.display = (onMarket && needsRestart && !dismissed) ? 'flex' : 'none'
        textEl.textContent = moduleT('restartBannerText')
        closeBtn.title = moduleT('restartBannerDismiss')
      }
      const interval = setInterval(tick, 500)
      tick()

      return () => {
        clearInterval(interval)
        if (banner.parentNode) banner.remove()
      }
    }

    // ------------------------------------------------------------- apply
    // The settings tab (HaloSection) is a self-contained card that fetches
    // its own server API endpoints directly, so it has no dependency on the
    // host's `configForms` service (which never became ready on some hosts).
    // The publish button (which does not need settings) is also independent.
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

      // Top-of-market "restart required" banner: a plain-DOM bar shown while
      // the user is on the dsh-market page and dsh-halo is parked behind a
      // restart (see marketNeedsRestart). Registered as an effect so its
      // poll interval and DOM node are torn down with the client.
      ctx.effect(() => setupRestartBanner(), 'dsh-halo: restart banner')

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

      // Settings → Plugins: the "Halo Blog" tab. The section owner renders
      // localized entry labels as tabs and mounts each contribution inside its
      // corresponding tab panel. The label is a static string on purpose: it is
      // resolved while the page renders. The tab now renders the dshmarket-style
      // collapsible card (HaloCard) so the entry is a click-to-expand dropdown.
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
        {
          name: 'settings.plugins.tab',
          id: 'dsh-halo',
          order: 70,
          label: () => moduleT('title'),
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        (props) => React.createElement(HaloCard, { ctx: props.ctx, t: moduleT }),
      ))

      // Official plugin-manager page: the keyed bundle-configuration seat,
      // keyed by this bundle's package name (`dsh-halo`). The host renders one
      // page per installed bundle and dispatches this seat on that bundle's
      // page. A `view: "summary"` render (the compact list row) is skipped —
      // the full card only appears on the bundle's detail page, mirroring
      // dshmarket's own registration.
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
        {
          name: 'plugins.bundle.config',
          key: 'dsh-halo',
          locale: NS,
          inject: () => ({ ctx: ctx }),
        },
        (ownerProps = {}) => ownerProps.view === 'summary'
          ? null
          : React.createElement(HaloCard, { ctx: ownerProps.ctx || ctx, t: moduleT }),
      ))
    }

    return module.exports
  },
})
