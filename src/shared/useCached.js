// Stale-while-revalidate: dane z pamięci/localStorage renderują się natychmiast,
// świeże dociągają się w tle. Mutacje w api() czyszczą cały cache (patrz platform.js).
// Wspólne dla wszystkich produktów — jeden mechanizm, jedno zachowanie.
import { useCallback, useEffect, useState } from 'react'
import { api, cacheRead, cacheWrite, invalidateCache } from './platform.js'

export const invalidate = invalidateCache

export function useCached(action, payload, fetcher) {
  const key = action + '|' + JSON.stringify(payload ?? {})
  const [data, setData] = useState(() => cacheRead(key))
  const call = fetcher || api

  const refresh = useCallback(async () => {
    const d = await call(action, JSON.parse(key.slice(action.length + 1)))
    cacheWrite(key, d)
    setData(d)
    return d
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    setData(cacheRead(key))
    call(action, JSON.parse(key.slice(action.length + 1)))
      .then((d) => {
        if (!alive) return
        cacheWrite(key, d)
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
export function warm(action, payload, fetcher) {
  const key = action + '|' + JSON.stringify(payload ?? {})
  ;(fetcher || api)(action, payload)
    .then((d) => cacheWrite(key, d))
    .catch(() => {})
}
