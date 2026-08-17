// Baza wiedzy: dane firmy (ogólne) + produkty (każdy z własną wiedzą i opiekunem sprzedaży).
import { useState } from 'react'
import { api, session } from '../lib/api.js'
import { useCached } from '../lib/useCached.js'
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
} from '../components/Icons.jsx'

export default function Knowledge() {
  const proj = session.proj
  const [data, load] = useCached('kb.list', { project_id: proj.id })
  const [modal, setModal] = useState(null) // {kind:'item', productId} | {kind:'product', product?}

  if (!data) return <p className="muted">Ładowanie…</p>
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
      {modal?.kind === 'product' && <ProductModal projId={proj.id} product={modal.product} onClose={() => setModal(null)} onDone={() => { setModal(null); load() }} />}
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
  async function refresh() {
    setBusy(true)
    try {
      await api('kb.refresh', { id: it.id })
      onChanged()
    } finally {
      setBusy(false)
    }
  }
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
            <button className="btn sm" onClick={refresh} disabled={busy} title="Pobierz treść strony ponownie">
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
          </div>
        </>
      )}
    </div>
  )
}

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF']

function fmtPrice(p) {
  if (p.price === null || p.price === undefined) return ''
  return `${Number(p.price).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${p.price_currency || 'PLN'} ${p.price_mode === 'brutto' ? 'brutto' : 'netto'}`
}

function ProductCard({ p, items, onChanged, onEdit, onAddItem }) {
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
          <button className="btn sm" onClick={onEdit} title="Edytuj produkt">
            <IcEdit />
          </button>
          <button className="btn sm danger" onClick={del} title="Usuń">
            <IcTrash />
          </button>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{p.description || 'Brak opisu.'}</p>
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

function ProductModal({ projId, product, onClose, onDone }) {
  const [f, setF] = useState({
    name: product?.name || '',
    description: product?.description || '',
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
          <span className="mono">Opis (co to jest, dla kogo)</span>
          <textarea value={f.description} onChange={set('description')} />
        </label>
        <label className="f">
          <span className="mono">Link do zakupu</span>
          <input value={f.buy_url} onChange={set('buy_url')} placeholder="https://…" />
        </label>
        <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr' }}>
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
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
