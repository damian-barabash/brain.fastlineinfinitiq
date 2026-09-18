// Baza wiedzy: dane firmy (ogólne) + produkty (każdy z własną wiedzą i opiekunem sprzedaży).
// WSPÓLNA dla wszystkich produktów platformy — ten sam projekt widzi tę samą wiedzę
// w Brain i w Hand, a AI Łowca Leadów układa z niej pierwszą wiadomość do leada.
import { useState } from 'react'
import { api, session } from './platform.js'
import { useCached } from './useCached.js'
import {
  IcPlus,
  IcTrash,
  IcEdit,
  IcText,
  IcLink,
  IcFile,
  IcRefresh,
  IcBox,
  IcX,
  IcCheck,
} from './Icons.jsx'
import { SkelPage } from './Skeleton.jsx'

export default function Knowledge() {
  const proj = session.proj
  const [data, load] = useCached('kb.list', { project_id: proj.id })
  const [modal, setModal] = useState(null) // {kind:'item', productId} | {kind:'product', product?}

  if (!data) return <SkelPage cards={2} />
  const products = data.products
  const items = data.items
  const firmItems = items.filter((i) => !i.product_id)

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // źródło prawdy doradcy
          </div>
          <h1>Baza wiedzy</h1>
          <p className="sub">To, co tu wpiszesz, jest dla AI jedyną prawdą o firmie i produktach.</p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 16 }}>Dane firmy</h2>
        <button className="btn sm right" onClick={() => setModal({ kind: 'item', productId: null })}>
          <IcPlus /> Dodaj wiedzę
        </button>
      </div>
      <div className="grid g3">
        {firmItems.map((it) => (
          <KbCard key={it.id} it={it} onChanged={load} />
        ))}
        {!firmItems.length && (
          <div className="card muted">Brak ogólnej wiedzy o firmie. Dodaj tekst, link do strony albo plik.</div>
        )}
      </div>

      <div className="spacer" />
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 16 }}>Produkty</h2>
        <button className="btn sm right" onClick={() => setModal({ kind: 'product' })}>
          <IcPlus /> Dodaj produkt
        </button>
      </div>
      <div className="grid g2">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            items={items.filter((i) => i.product_id === p.id)}
            onChanged={load}
            onEdit={() => setModal({ kind: 'product', product: p })}
            onAddItem={() => setModal({ kind: 'item', productId: p.id })}
          />
        ))}
        {!products.length && <div className="card muted">Brak produktów. Dodaj pierwszy — AI będzie o nim opowiadać i podawać link do zakupu.</div>}
      </div>

      {modal?.kind === 'item' && <ItemModal projId={proj.id} productId={modal.productId} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
      {modal?.kind === 'product' && (
        <ProductModal
          projId={proj.id}
          product={modal.product}
          hasSources={!!modal.product && items.some((i) => i.product_id === modal.product.id)}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load() }}
        />
      )}
    </>
  )
}

const TYPE_ICON = { text: <IcText />, url: <IcLink />, file: <IcFile /> }
const TYPE_LABEL = { text: 'Tekst', url: 'Strona WWW', file: 'Plik' }

function KbCard({ it, onChanged, compact }) {
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const [title, setTitle] = useState(it.title)
  const [content, setContent] = useState(it.content)

  async function del() {
    if (!confirm('Usunąć ten wpis wiedzy?')) return
    await api('kb.delete', { id: it.id })
    onChanged()
  }
  const [check, setCheck] = useState(null) // null | {state:'loading'} | {state:'done', res} | {state:'history', res}
  async function refresh() {
    setBusy(true)
    setCheck({ state: 'loading' })
    try {
      const res = await api('kb.refresh', { id: it.id })
      setCheck({ state: 'done', res })
    } catch (e) {
      setCheck({ state: 'done', res: { ok: false, error: e.message || 'Nie udało się sprawdzić strony' } })
    } finally {
      setBusy(false)
    }
  }
  const recentChange = it.changed_at && Date.now() - new Date(it.changed_at).getTime() < 7 * 864e5 && it.last_change
  async function save() {
    await api('kb.update', { id: it.id, title, content })
    setEdit(false)
    onChanged()
  }
  async function openFile() {
    const { url } = await api('kb.fileUrl', { id: it.id })
    if (url) window.open(url, '_blank')
  }

  return (
    <div className="card" style={compact ? { padding: 12 } : undefined}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span style={{ color: 'var(--acid)', width: 16, height: 16 }}>{TYPE_ICON[it.type]}</span>
        <b style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || TYPE_LABEL[it.type]}</b>
        <span className="right row" style={{ gap: 4 }}>
          {it.type === 'url' && (
            <button className="btn sm" onClick={refresh} disabled={busy} title="Sprawdź stronę teraz i pokaż, co się zmieniło">
              <IcRefresh />
            </button>
          )}
          {it.type === 'file' && it.file_path && (
            <button className="btn sm" onClick={openFile} title="Otwórz plik">
              <IcFile />
            </button>
          )}
          {it.type !== 'file' && (
            <button className="btn sm" onClick={() => setEdit(!edit)} title="Edytuj">
              <IcEdit />
            </button>
          )}
          <button className="btn sm danger" onClick={del} title="Usuń">
            <IcTrash />
          </button>
        </span>
      </div>
      {edit ? (
        <>
          <label className="f">
            <span className="mono">Tytuł</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {it.type === 'text' && (
            <label className="f">
              <span className="mono">Treść</span>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} />
            </label>
          )}
          <div className="row">
            <button className="btn primary sm" onClick={save}>
              <IcCheck /> Zapisz
            </button>
            <button className="btn sm" onClick={() => setEdit(false)}>
              Anuluj
            </button>
          </div>
        </>
      ) : (
        <>
          {it.url && (
            <a href={it.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 10.5, display: 'block', marginBottom: 6 }}>
              {it.url}
            </a>
          )}
          <p className="muted" style={{ fontSize: 12.5, maxHeight: 60, overflow: 'hidden' }}>
            {it.content ? it.content.slice(0, 180) + (it.content.length > 180 ? '…' : '') : 'Plik binarny — treść nie trafia do promptu.'}
          </p>
          <div className="mono" style={{ marginTop: 8, fontSize: 9.5 }}>
            {TYPE_LABEL[it.type]} • {it.chars.toLocaleString('pl-PL')} znaków
            {it.type === 'url' && (
              <>
                {' • '}
                {it.checked_at ? `sprawdzono ${fmtWhen(it.checked_at)}` : 'jeszcze nie sprawdzano'} • auto co 24 h
              </>
            )}
          </div>
          {it.type === 'url' && it.fetch_error && (
            <div className="kb-flag warn" title="Poprzednia treść została w bazie wiedzy — doradca nadal z niej korzysta">
              Ostatnie sprawdzenie nieudane: {it.fetch_error}
            </div>
          )}
          {it.type === 'url' && !it.fetch_error && recentChange && (
            <button type="button" className="kb-flag" onClick={() => setCheck({ state: 'history', res: { ok: true, changed: true, ...it.last_change, checked_at: it.last_change.at } })}>
              Treść zmieniła się {fmtWhen(it.changed_at)}{it.last_change.auto ? ' (automatycznie)' : ''} — zobacz, co
            </button>
          )}
        </>
      )}
      {check && (
        <RefreshModal
          url={it.url}
          check={check}
          onClose={() => {
            const wasRun = check.state === 'done'
            setCheck(null)
            if (wasRun) onChanged()
          }}
        />
      )}
    </div>
  )
}

function fmtWhen(iso) {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? `dziś ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Okno sprawdzania strony: najpierw „trwa", potem wynik — bez zmian / co doszło i co znikło / dlaczego się nie udało.
function RefreshModal({ url, check, onClose }) {
  const loading = check.state === 'loading'
  const res = check.res || {}
  return (
    <div className="modal-bg" onClick={(e) => !loading && e.target === e.currentTarget && onClose()}>
      <div className="modal kb-check">
        <h2>{loading ? 'Sprawdzam stronę…' : check.state === 'history' ? 'Ostatnia zmiana treści' : 'Wynik sprawdzenia'}</h2>
        <div className="mono kb-check-url">{url}</div>
        {loading && (
          <div className="kb-check-wait">
            <span className="kb-spin" />
            <p className="muted">Pobieram aktualną treść i porównuję z tym, co doradca ma w bazie wiedzy. To trwa do kilkunastu sekund.</p>
          </div>
        )}
        {!loading && !res.ok && (
          <div className="note warn">
            <b>Nie udało się pobrać strony.</b> {res.error}
            <br />
            Poprzednia treść została w bazie wiedzy — nic nie zostało skasowane.
          </div>
        )}
        {!loading && res.ok && !res.changed && (
          <div className="note">
            <b>Bez zmian.</b> Treść strony jest taka sama jak w bazie wiedzy ({(res.chars_after ?? 0).toLocaleString('pl-PL')} znaków).
          </div>
        )}
        {!loading && res.ok && res.changed && (
          <>
            <div className="note">
              <b>{check.state === 'history' ? 'Treść została zaktualizowana' : 'Zaktualizowano bazę wiedzy'}.</b>{' '}
              {(res.chars_before ?? 0).toLocaleString('pl-PL')} → {(res.chars_after ?? 0).toLocaleString('pl-PL')} znaków
              {res.checked_at ? ` • ${fmtWhen(res.checked_at)}` : ''}. Doradca korzysta z nowej treści od następnej rozmowy.
            </div>
            <DiffList title="Doszło" sign="+" cls="add" items={res.added} total={res.added_count} />
            <DiffList title="Zniknęło" sign="−" cls="del" items={res.removed} total={res.removed_count} />
            {!res.added?.length && !res.removed?.length && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Zmienił się tylko układ albo kolejność tekstu — fragmenty są te same.</p>}
          </>
        )}
        {!loading && res.description && <DescResult d={res.description} />}
        {!loading && (
          <div className="acts">
            <button className="btn primary sm" onClick={onClose}>
              <IcCheck /> OK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Opis produktu po synchronizacji ze źródłami: było → jest (+ co z opisu wypadło / co doszło).
function DescResult({ d }) {
  if (!d) return null
  return (
    <div className="kb-desc">
      <div className="mono kb-diff-h">Opis produktu</div>
      {d.skipped && <div className="note">Opis bez zmian — {d.skipped}.</div>}
      {!d.skipped && !d.ok && (
        <div className="note warn">
          <b>Opisu nie udało się odświeżyć.</b> {d.error} Poprzedni opis został.
        </div>
      )}
      {!d.skipped && d.ok && !d.changed && <div className="note">Opis produktu zgadza się ze źródłami — bez zmian.</div>}
      {d.ok && d.changed && (
        <>
          <div className="note">
            <b>Opis produktu został zaktualizowany ze źródeł.</b> Doradca i sprzedawca korzystają z nowego opisu od następnej rozmowy.
          </div>
          {d.before && (
            <div className="kb-desc-box was">
              <span className="mono">Było</span>
              <p>{d.before}</p>
            </div>
          )}
          <div className="kb-desc-box now">
            <span className="mono">Jest</span>
            <p>{d.after}</p>
          </div>
          <DiffList title="Z opisu zniknęło" sign="−" cls="del" items={d.removed} total={d.removed_count} />
          <DiffList title="Do opisu doszło" sign="+" cls="add" items={d.added} total={d.added_count} />
        </>
      )}
    </div>
  )
}

// Przycisk ↻ na karcie produktu: wszystkie strony produktu + opis złożony od nowa ze źródeł.
function ProductSyncModal({ name, state, onClose }) {
  const loading = state.state === 'loading'
  const res = state.res || {}
  return (
    <div className="modal-bg" onClick={(e) => !loading && e.target === e.currentTarget && onClose()}>
      <div className="modal kb-check">
        <h2>{loading ? 'Synchronizuję produkt…' : state.state === 'history' ? 'Ostatnia zmiana opisu' : 'Wynik synchronizacji'}</h2>
        <div className="mono kb-check-url">{name}</div>
        {loading && (
          <div className="kb-check-wait">
            <span className="kb-spin" />
            <p className="muted">Sprawdzam strony produktu, porównuję je z bazą wiedzy i składam opis od nowa ze źródeł. To trwa do pół minuty.</p>
          </div>
        )}
        {!loading && res.error && <div className="note warn">{res.error}</div>}
        {!loading &&
          (res.pages || []).map((pg, i) => (
            <div key={i} className="kb-page">
              <div className="mono kb-check-url" style={{ margin: '0 0 6px' }}>{pg.url}</div>
              {!pg.ok && (
                <div className="note warn">
                  <b>Nie udało się pobrać strony.</b> {pg.error} Poprzednia treść została.
                </div>
              )}
              {pg.ok && !pg.changed && <div className="note">Strona bez zmian ({(pg.chars_after ?? 0).toLocaleString('pl-PL')} znaków).</div>}
              {pg.ok && pg.changed && (
                <>
                  <div className="note">
                    <b>Strona się zmieniła.</b> {(pg.chars_before ?? 0).toLocaleString('pl-PL')} → {(pg.chars_after ?? 0).toLocaleString('pl-PL')} znaków.
                  </div>
                  <DiffList title="Na stronie doszło" sign="+" cls="add" items={pg.added} total={pg.added_count} />
                  <DiffList title="Ze strony zniknęło" sign="−" cls="del" items={pg.removed} total={pg.removed_count} />
                </>
              )}
            </div>
          ))}
        {!loading && res.description && <DescResult d={res.description} />}
        {!loading && (
          <div className="acts">
            <button className="btn primary sm" onClick={onClose}>
              <IcCheck /> OK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function DiffList({ title, sign, cls, items, total }) {
  if (!items?.length) return null
  return (
    <div className="kb-diff">
      <div className="mono kb-diff-h">
        {title}: {total ?? items.length}
        {total > items.length ? ` (pokazuję pierwsze ${items.length})` : ''}
      </div>
      {items.map((x, i) => (
        <div key={i} className={`kb-diff-row ${cls}`}>
          <span className="kb-diff-sign">{sign}</span>
          <span>{x}</span>
        </div>
      ))}
    </div>
  )
}

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF']

function fmtPrice(p) {
  if (p.price === null || p.price === undefined) return ''
  return `${Number(p.price).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${p.price_currency || 'PLN'} ${p.price_mode === 'brutto' ? 'brutto' : 'netto'}`
}

function ProductCard({ p, items, onChanged, onEdit, onAddItem }) {
  const [sync, setSync] = useState(null) // null | {state:'loading'} | {state:'done', res} | {state:'history', res}
  async function runSync() {
    setSync({ state: 'loading' })
    try {
      setSync({ state: 'done', res: await api('product.sync', { id: p.id }) })
    } catch (e) {
      setSync({ state: 'done', res: { error: e.message || 'Nie udało się zsynchronizować produktu' } })
    }
  }
  const lastDesc = p.desc_last_change && Date.now() - new Date(p.desc_last_change.at).getTime() < 7 * 864e5 ? p.desc_last_change : null
  async function del() {
    if (!confirm(`Usunąć produkt „${p.name}" wraz z jego wiedzą?`)) return
    await api('product.delete', { id: p.id })
    onChanged()
  }
  return (
    <div className="card">
      <span className="corner tl" />
      <span className="corner br" />
      <div className="row" style={{ marginBottom: 8 }}>
        <IcBox style={{ width: 17, height: 17, color: 'var(--acid)' }} />
        <b>{p.name}</b>
        <span className="right row" style={{ gap: 4 }}>
          {items.length > 0 && (
            <button className="btn sm" onClick={runSync} disabled={sync?.state === 'loading'} title="Sprawdź strony produktu i zsynchronizuj opis ze źródłami">
              <IcRefresh />
            </button>
          )}
          <button className="btn sm" onClick={onEdit} title="Edytuj produkt">
            <IcEdit />
          </button>
          <button className="btn sm danger" onClick={del} title="Usuń">
            <IcTrash />
          </button>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{p.description || 'Brak opisu.'}</p>
      {items.length > 0 && (
        <div className="mono" style={{ fontSize: 9.5, marginBottom: 10 }}>
          Opis ze źródeł • {p.desc_synced_at ? `zsynchronizowano ${fmtWhen(p.desc_synced_at)}` : 'jeszcze niesynchronizowany — naciśnij ↻'} • auto codziennie rano
        </div>
      )}
      {lastDesc && (
        <button type="button" className="kb-flag" style={{ marginTop: 0, marginBottom: 10 }} onClick={() => setSync({ state: 'history', res: { description: { ok: true, changed: true, ...lastDesc } } })}>
          Opis zmienił się {fmtWhen(lastDesc.at)}{lastDesc.auto ? ' (automatycznie)' : ''} — zobacz, co
        </button>
      )}
      {p.manual_notes && (
        <p style={{ fontSize: 12.5, marginBottom: 10 }}>
          <span className="mono" style={{ fontSize: 9.5, display: 'block', marginBottom: 3 }}>Opis ręczny</span>
          {p.manual_notes}
        </p>
      )}
      {sync && (
        <ProductSyncModal
          name={p.name}
          state={sync}
          onClose={() => {
            const wasRun = sync.state === 'done'
            setSync(null)
            if (wasRun) onChanged()
          }}
        />
      )}
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {p.price !== null && p.price !== undefined ? (
          <span className="badge acid">{fmtPrice(p)}</span>
        ) : (
          <span className="badge warn">Brak ceny</span>
        )}
        {p.buy_url ? <span className="badge acid">Link do zakupu</span> : <span className="badge danger">Brak linku do zakupu</span>}
        {p.sales_name || p.sales_phone ? (
          <span className="badge">Sprzedaż: {[p.sales_name, p.sales_phone].filter(Boolean).join(' • ')}</span>
        ) : (
          <span className="badge warn">Brak opiekuna sprzedaży</span>
        )}
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="mono">Wiedza o produkcie ({items.length})</span>
        <button className="btn sm right" onClick={onAddItem}>
          <IcPlus /> Dodaj
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((it) => (
          <KbCard key={it.id} it={it} onChanged={onChanged} compact />
        ))}
      </div>
    </div>
  )
}

function ItemModal({ projId, productId, onClose, onDone }) {
  const [type, setType] = useState('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true)
    setErr('')
    try {
      const payload = { project_id: projId, product_id: productId, type, title }
      if (type === 'text') payload.content = content
      if (type === 'url') payload.url = url
      if (type === 'file') {
        if (!file) throw new Error('Wybierz plik')
        if (file.size > 5 * 1024 * 1024) throw new Error('Plik maks. 5 MB')
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(String(r.result).split(',')[1])
          r.onerror = rej
          r.readAsDataURL(file)
        })
        payload.file_name = file.name
        payload.file_type = file.type
        payload.file_base64 = b64
      }
      await api('kb.create', payload)
      onDone()
    } catch (e) {
      setErr(e.message || 'Błąd zapisu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Dodaj wiedzę {productId ? '(produkt)' : '(firma)'}</h2>
        <div className="chips" style={{ marginBottom: 16 }}>
          {[
            ['text', 'Tekst'],
            ['url', 'Link do strony'],
            ['file', 'Plik'],
          ].map(([k, l]) => (
            <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="f">
          <span className="mono">Tytuł (opcjonalnie)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {type === 'text' && (
          <label className="f">
            <span className="mono">Treść</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ minHeight: 140 }} placeholder="Fakty, cennik, zasady, FAQ — wszystko, co doradca ma wiedzieć." />
          </label>
        )}
        {type === 'url' && (
          <label className="f">
            <span className="mono">Adres strony</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              Treść strony zostanie pobrana i zapisana jako wiedza. Możesz ją później odświeżyć.
            </span>
          </label>
        )}
        {type === 'file' && (
          <label className="f">
            <span className="mono">Plik (txt / md / csv / html — treść trafia do wiedzy; inne są tylko przechowywane)</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        )}
        {err && <p className="err">{err}</p>}
        <div className="acts">
          <button className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Dodaj'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductModal({ projId, product, hasSources, onClose, onDone }) {
  const [f, setF] = useState({
    name: product?.name || '',
    description: product?.description || '',
    manual_notes: product?.manual_notes || '',
    buy_url: product?.buy_url || '',
    sales_name: product?.sales_name || '',
    sales_phone: product?.sales_phone || '',
    price: product?.price ?? '',
    price_mode: product?.price_mode || 'netto',
    price_currency: product?.price_currency || 'PLN',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    if (!f.name.trim()) return
    const priceRaw = String(f.price).trim()
    if (priceRaw && !Number.isFinite(Number(priceRaw.replace(/\s+/g, '').replace(',', '.')))) {
      setErr('Cena musi być liczbą, np. 3200 albo 349,99.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      if (product) await api('product.update', { id: product.id, ...f })
      else await api('product.create', { project_id: projId, ...f })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{product ? 'Edytuj produkt' : 'Nowy produkt'}</h2>
        <label className="f">
          <span className="mono">Nazwa produktu</span>
          <input value={f.name} onChange={set('name')} />
        </label>
        <label className="f">
          <span className="mono">Opis (co to jest, dla kogo){hasSources ? ' — automatyczny' : ''}</span>
          <textarea value={f.description} onChange={set('description')} readOnly={hasSources} className={hasSources ? 'locked' : undefined} />
          <span className="hint">
            {hasSources
              ? 'Ten opis powstaje sam ze stron i dokumentów produktu, dlatego jest zablokowany. Odświeża się przyciskiem ↻ na karcie produktu i codziennie rano. Własne dopiski wpisz niżej.'
              : 'Gdy dodasz do produktu stronę WWW, plik albo notatkę, opis zacznie powstawać z nich automatycznie i to pole się zablokuje.'}
          </span>
        </label>
        <label className="f">
          <span className="mono">Opis ręczny — dodatkowe informacje (opcjonalnie)</span>
          <textarea value={f.manual_notes} onChange={set('manual_notes')} placeholder="Wszystko, czego nie ma na stronie ani w dokumentach, a doradca ma wiedzieć." />
        </label>
        <label className="f">
          <span className="mono">Link do zakupu</span>
          <input value={f.buy_url} onChange={set('buy_url')} placeholder="https://…" />
        </label>
        <div className="fgrid">
          <label className="f">
            <span className="mono">Cena (puste = brak)</span>
            <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="np. 3200 lub 349,99" />
          </label>
          <label className="f">
            <span className="mono">Netto / brutto</span>
            <select value={f.price_mode} onChange={set('price_mode')}>
              <option value="netto">Netto</option>
              <option value="brutto">Brutto</option>
            </select>
          </label>
          <label className="f">
            <span className="mono">Waluta</span>
            <select value={f.price_currency} onChange={set('price_currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="fgrid">
          <label className="f">
            <span className="mono">Opiekun sprzedaży — imię</span>
            <input value={f.sales_name} onChange={set('sales_name')} />
          </label>
          <label className="f">
            <span className="mono">Telefon opiekuna</span>
            <input value={f.sales_phone} onChange={set('sales_phone')} placeholder="+48 …" />
          </label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="acts">
          <button className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  )
}
