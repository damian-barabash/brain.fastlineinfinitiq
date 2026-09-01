// Klient API panelu (brain-admin) + czat SSE (brain-chat).
export const FN_BASE = 'https://ogxajgbrbkfwsactlsyj.supabase.co/functions/v1'
export const PANEL_ORIGIN = 'https://brain.fastlineinfinitiq.pl'

const LS = {
  token: 'brain_token',
  user: 'brain_user',
  ws: 'brain_ws',
  proj: 'brain_proj',
  theme: 'brain_theme',
}

export const session = {
  get token() {
    return localStorage.getItem(LS.token) || ''
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(LS.user) || 'null')
    } catch {
      return null
    }
  },
  get ws() {
    try {
      return JSON.parse(localStorage.getItem(LS.ws) || 'null')
    } catch {
      return null
    }
  },
  get proj() {
    try {
      return JSON.parse(localStorage.getItem(LS.proj) || 'null')
    } catch {
      return null
    }
  },
  login(token, user) {
    localStorage.setItem(LS.token, token)
    localStorage.setItem(LS.user, JSON.stringify(user))
  },
  setWs(ws) {
    if (ws) localStorage.setItem(LS.ws, JSON.stringify(ws))
    else localStorage.removeItem(LS.ws)
    localStorage.removeItem(LS.proj)
  },
  setProj(p) {
    if (p) localStorage.setItem(LS.proj, JSON.stringify(p))
    else localStorage.removeItem(LS.proj)
  },
  clear() {
    for (const k of [LS.token, LS.user, LS.ws, LS.proj]) localStorage.removeItem(k)
    // cache danych innego użytkownika nie może przetrwać wylogowania
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k?.startsWith('bc:')) localStorage.removeItem(k)
      }
    } catch {
      /* ignore */
    }
  },
}

// ── cache SWR (pamięć + localStorage) ─────────────────────────────────────
const cacheMem = new Map()
const CACHE_PREFIX = 'bc:'

export function cacheRead(key) {
  if (cacheMem.has(key)) return cacheMem.get(key)
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (raw) {
      const v = JSON.parse(raw)
      cacheMem.set(key, v)
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

export function cacheWrite(key, data) {
  cacheMem.set(key, data)
  try {
    const raw = JSON.stringify(data)
    if (raw.length < 500_000) localStorage.setItem(CACHE_PREFIX + key, raw)
  } catch {
    /* quota — pomiń */
  }
}

export function invalidateCache(prefix = '') {
  for (const k of [...cacheMem.keys()]) if (k.startsWith(prefix)) cacheMem.delete(k)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_PREFIX + prefix)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}

// akcje tylko-do-odczytu; wszystko inne = mutacja → cache leci w całości,
// żeby po edycji NIGDZIE nie dało się zobaczyć starych danych
const READ_ACTIONS = new Set([
  'login',
  'me',
  'ws.list',
  'proj.list',
  'users.list',
  'kb.list',
  'kb.fileUrl',
  'advisor.get',
  // channels.list i sales.get NIE są cache'owane: zawierają tokeny kanałów
  // (page_token, wa_token, klucz Resend) — nie chcemy ich w localStorage.
  'settings.get',
  'stats',
  'conv.list',
  'conv.messages',
  'sales.get',
  'sales.stats',
  'leads.list',
  'lead.messages',
])

export async function api(action, payload = {}) {
  const r = await fetch(`${FN_BASE}/brain-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: session.token, ...payload }),
  })
  const data = await r.json().catch(() => ({}))
  if (r.status === 401 && action !== 'login') {
    session.clear()
    window.location.href = '/login'
    throw new Error('auth')
  }
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  if (!READ_ACTIONS.has(action)) invalidateCache()
  return data
}

// Akcje sprzedawcy wykonywane bezpośrednio na brain-sales (autoryzacja hook_key z sales.get):
// preview / send / test — długie (generacja AI, wysyłka), nie przechodzą przez brain-admin.
export async function salesApi(hookKey, action, payload = {}) {
  const r = await fetch(`${FN_BASE}/brain-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, key: hookKey, ...payload }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  if (action === 'send') invalidateCache()
  return data
}

// Testowy czat sprzedawcy (SSE na brain-sales, autoryzacja demo_key). Nic nie zapisuje w bazie.
export function salesChatStream(body, { onDelta, onDone, onError }) {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const r = await fetch(`${FN_BASE}/brain-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', ...body }),
        signal: ctrl.signal,
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${r.status}`)
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            const jd = JSON.parse(line.slice(5).trim())
            if (jd.d) onDelta?.(jd.d)
            else if (jd.done) onDone?.(jd)
            else if (jd.error) onError?.(new Error(jd.error))
          } catch {
            /* niepełny chunk */
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e)
    }
  })()
  return ctrl
}

export async function salesHello(key) {
  const r = await fetch(`${FN_BASE}/brain-sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hello', key }),
  })
  if (!r.ok) throw new Error('invalid key')
  return r.json()
}

// Czat SSE (dowolne body: wiadomość albo action=rewrite): zwraca AbortController.
export function chatStreamRaw(body, { onDelta, onDone, onError }) {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const r = await fetch(`${FN_BASE}/brain-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${r.status}`)
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            const jd = JSON.parse(line.slice(5).trim())
            if (jd.d) onDelta?.(jd.d)
            else if (jd.done) onDone?.(jd)
            else if (jd.error) onError?.(new Error(jd.error))
          } catch {
            /* niepełny chunk */
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e)
    }
  })()
  return ctrl
}

export function chatStream({ key, message, conversationId, visitorId }, handlers) {
  return chatStreamRaw({ key, message, conversation_id: conversationId, visitor_id: visitorId }, handlers)
}

// akcje JSON czatu: rate / feedback.decide / end
export async function chatAction(key, payload) {
  const r = await fetch(`${FN_BASE}/brain-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...payload }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

export async function chatHello(key) {
  const r = await fetch(`${FN_BASE}/brain-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, action: 'hello' }),
  })
  if (!r.ok) throw new Error('invalid key')
  return r.json()
}

export function getTheme() {
  return localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
}
export function setTheme(t) {
  localStorage.setItem(LS.theme, t)
  document.documentElement.dataset.theme = t
}
