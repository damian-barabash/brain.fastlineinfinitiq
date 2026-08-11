// Stale-while-revalidate: dane z pamięci/localStorage renderują się natychmiast,
// świeże dociągają się w tle. Panel nie każe czekać na sieć.
import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'

const mem = new Map()
const PREFIX = 'bc:'

function readStore(key) {
  if (mem.has(key)) return mem.get(key)
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const v = JSON.parse(raw)
      mem.set(key, v)
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeStore(key, data) {
  mem.set(key, data)
  try {
    const raw = JSON.stringify(data)
    if (raw.length < 500_000) localStorage.setItem(PREFIX + key, raw)
  } catch {
    /* quota — pomiń */
  }
}

export function invalidate(prefix = '') {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX + prefix)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}

export function useCached(action, payload) {
  const key = action + '|' + JSON.stringify(payload ?? {})
  const [data, setData] = useState(() => readStore(key))

  const refresh = useCallback(async () => {
    const d = await api(action, JSON.parse(key.slice(action.length + 1)))
    writeStore(key, d)
    setData(d)
    return d
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    setData(readStore(key))
    api(action, JSON.parse(key.slice(action.length + 1)))
      .then((d) => {
        if (!alive) return
        writeStore(key, d)
        setData(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return [data, refresh]
}

// Podgrzanie cache w tle (po wyborze projektu) — nawigacja jest potem natychmiastowa.
export function warm(action, payload) {
  const key = action + '|' + JSON.stringify(payload ?? {})
  api(action, payload)
    .then((d) => writeStore(key, d))
    .catch(() => {})
}
