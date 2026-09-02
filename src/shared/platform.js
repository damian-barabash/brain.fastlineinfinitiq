// ── Warstwa platformy FIQ: sesja, API panelu, produkty ──────────────────────
// ŹRÓDŁO PRAWDY: repozytorium fiq-shared. Kopie w produktach (src/shared/)
// są generowane przez `npm run sync:shared` — nie edytuj ich ręcznie.
//
// Kolejność wejścia klienta jest jedna dla wszystkich produktów:
//   login → PRODUKT → workspace → projekt
// Produkty widzi ten, którego workspace ma je przypisane (admin widzi wszystkie).
// Workspace'y, projekty i baza wiedzy są WSPÓLNE dla produktów — ten sam klient
// w Brain i w Hand pracuje na tych samych danych, tylko innym narzędziem.

export const FN_BASE = 'https://ogxajgbrbkfwsactlsyj.supabase.co/functions/v1'

const LS = {
  token: 'brain_token', // nazwy historyczne — zmiana wylogowałaby wszystkich
  user: 'brain_user',
  ws: 'brain_ws',
  proj: 'brain_proj',
  theme: 'brain_theme',
  product: 'fiq_product',
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
  get product() {
    try {
      return JSON.parse(localStorage.getItem(LS.product) || 'null')
    } catch {
      return null
    }
  },
  setProduct(p) {
    if (p) localStorage.setItem(LS.product, JSON.stringify(p))
    else localStorage.removeItem(LS.product)
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
    for (const k of [LS.token, LS.user, LS.ws, LS.proj, LS.product]) localStorage.removeItem(k)
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
  // platforma
  'products.mine',
  'products.list',
  'ws.products',
  'user.projects',
  // LeadEngine (hand-api ma własny klient, ale współdzieli reguły cache)
  'hand.config',
  'hand.leads',
  'hand.lead',
  'hand.messages',
  'hand.stats',
  'hand.runs',
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


// ── przejście między domenami produktów bez ponownego logowania ──────────────
// Domeny są różne, więc localStorage się nie współdzieli: token przekazujemy
// we fragmencie URL (#sso=…), który nie trafia do serwera, i od razu czyścimy.
export function gotoProduct(product) {
  const url = `https://${product.domain}/#sso=${encodeURIComponent(session.token)}`
  location.href = url
}

export async function consumeSso() {
  const m = location.hash.match(/[#&]sso=([^&]+)/)
  if (!m) return false
  const token = decodeURIComponent(m[1])
  history.replaceState(null, '', location.pathname + location.search)
  if (!token) return false
  localStorage.setItem(LS.token, token)
  try {
    const me = await api('me')
    if (!me?.user) throw new Error('zła sesja')
    localStorage.setItem(LS.user, JSON.stringify(me.user))
    return true
  } catch {
    localStorage.removeItem(LS.token)
    return false
  }
}

// ── produkty dostępne dla zalogowanego ──────────────────────────────────────
export async function loadProducts() {
  const d = await api('products.mine')
  return d.products ?? []
}

// Czy klient ma dostęp do TEGO produktu (wywoływane przy starcie aplikacji).
export async function ensureProductAccess(productKey) {
  const products = await loadProducts()
  const found = products.find((p) => p.key === productKey)
  return { ok: !!found, product: found ?? null, products }
}

// ── motyw (ciemny/jasny) — wspólny przełącznik dla produktów ────────────────
export function getTheme() {
  return localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark'
}
export function setTheme(t) {
  localStorage.setItem(LS.theme, t)
  document.documentElement.dataset.theme = t
}
