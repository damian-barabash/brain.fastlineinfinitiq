// Klient API panelu Brain. Sesja, cache i wywołania brain-admin są WSPÓLNE dla
// całej platformy (fiq-shared/src/platform.js) — tutaj zostają tylko rzeczy
// wyłącznie Brainowe: strumień czatu (brain-chat) i akcje sprzedawcy (brain-sales).
export {
  FN_BASE,
  session,
  api,
  cacheRead,
  cacheWrite,
  invalidateCache,
  loadProducts,
  ensureProductAccess,
  gotoProduct,
  consumeSso,
  getTheme,
  setTheme,
} from '../shared/platform.js'
import { FN_BASE, session } from '../shared/platform.js'

export const PANEL_ORIGIN = 'https://brain.fastlineinfinitiq.pl'

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
