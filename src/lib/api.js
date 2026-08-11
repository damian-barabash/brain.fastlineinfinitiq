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
  },
}

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
  return data
}

// Czat SSE: onDelta(tekst), onDone({conversation_id,...}); zwraca AbortController.
export function chatStream({ key, message, conversationId, visitorId }, { onDelta, onDone, onError }) {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const r = await fetch(`${FN_BASE}/brain-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, message, conversation_id: conversationId, visitor_id: visitorId }),
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
