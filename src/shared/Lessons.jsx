// ── Poprawki trenera (wspólne dla doradcy i sprzedawcy) ─────────────────────
// Wszystko, co daliśmy agentowi w czatach, leży w jednym miejscu: włączone
// wskazówki dopisują się do jego instrukcji przy KAŻDEJ odpowiedzi, więc muszą
// dać się przejrzeć, poprawić i skasować. Doradca i sprzedawca mają osobne
// zbiory (scope) — ta sama uwaga potrafi być dobra dla jednego i zła dla drugiego.
import { useEffect, useState } from 'react'
import { api } from './platform.js'
import { IcThumbUp, IcEdit, IcTrash, IcCheck, IcPlus } from './Icons.jsx'

const LESSON_STATUS = {
  approved: { label: 'Działa', cls: 'acid', hint: 'Doradca stosuje tę wskazówkę w każdej odpowiedzi.' },
  pending: { label: 'Czeka', cls: 'warn', hint: 'Zapisana, ale jeszcze nie wpływa na odpowiedzi.' },
  rejected: { label: 'Odrzucona', cls: '', hint: 'Zignorowana — zostaje tylko w historii.' },
}

export default function Lessons({ projId, scope = 'advisor', title, hint }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ note: '', corrected: '' })

  const load = () =>
    api('lessons.list', { project_id: projId, scope })
      .then((d) => setRows(d.lessons ?? []))
      .catch((e) => setErr(e.message))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projId, scope])

  async function addManual() {
    const note = (draft.note || '').trim()
    if (!note) return
    setBusy('new')
    try {
      await api('lessons.create', { project_id: projId, scope, note, corrected: draft.corrected || '' })
      setDraft({ note: '', corrected: '' })
      setAdding(false)
      await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  async function setStatus(row, status) {
    setBusy(row.id)
    try {
      await api('lessons.set', { id: row.id, status })
      await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  async function save() {
    setBusy(edit.id)
    try {
      await api('lessons.set', { id: edit.id, note: edit.note ?? '', corrected: edit.corrected ?? '' })
      setEdit(null)
      await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  async function remove(row) {
    if (!confirm('Usunąć tę poprawkę na stałe? Doradca przestanie ją stosować.')) return
    setBusy(row.id)
    try {
      await api('lessons.delete', { id: row.id })
      await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const active = (rows ?? []).filter((r) => r.status === 'approved').length
  const waiting = (rows ?? []).filter((r) => r.status === 'pending').length

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <IcThumbUp style={{ width: 17, height: 17, color: 'var(--acid)' }} />
        <b>{title || 'Poprawki z czatów'}</b>
        <span className="badge acid">{active} w użyciu</span>
        {waiting > 0 && <span className="badge warn">{waiting} czeka</span>}
        <button className="btn sm right" onClick={() => setOpen(!open)}>
          {open ? 'Zwiń' : 'Pokaż i edytuj'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
        {hint ||
          'Uwagi, które dawałeś doradcy w rozmowach testowych. Włączone dopisują się do jego instrukcji i działają na wszystkich kanałach.'}
      </p>

      {open && (
        <>
          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={() => setAdding(!adding)}>
              <IcPlus /> {adding ? 'Anuluj' : 'Dopisz wskazówkę ręcznie'}
            </button>
          </div>
          {adding && (
            <div className="lesson-row">
              <label className="f">
                <span className="mono">Wskazówka</span>
                <textarea
                  rows={2}
                  autoFocus
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="np. nie zaczynaj wiadomości od Dzień dobry, jeśli już rozmawiacie"
                />
              </label>
              <label className="f">
                <span className="mono">Wzór dobrej odpowiedzi (opcjonalnie)</span>
                <textarea
                  rows={2}
                  value={draft.corrected}
                  onChange={(e) => setDraft({ ...draft, corrected: e.target.value })}
                />
              </label>
              <button className="btn sm primary" onClick={addManual} disabled={busy === 'new'}>
                <IcCheck /> Dodaj i włącz
              </button>
            </div>
          )}
          {rows === null && <p className="muted" style={{ marginTop: 12 }}>Ładowanie…</p>}
          {rows && !rows.length && (
            <p className="muted" style={{ marginTop: 12 }}>
              Jeszcze nic. Oceń odpowiedź kciukiem w dół w teście rozmowy albo dopisz wskazówkę ręcznie.
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            {rows?.map((r) => {
              const st = LESSON_STATUS[r.status] ?? LESSON_STATUS.pending
              const isEdit = edit?.id === r.id
              return (
                <div key={r.id} className="lesson-row">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={'badge ' + st.cls} title={st.hint}>{st.label}</span>
                    <span className="badge">{r.rating === 'up' ? 'kciuk w górę' : 'kciuk w dół'}</span>
                    <span className="mono right" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>
                      {new Date(r.created_at).toLocaleString('pl-PL')}
                    </span>
                  </div>

                  {isEdit ? (
                    <>
                      <label className="f">
                        <span className="mono">Wskazówka dla doradcy</span>
                        <textarea
                          rows={2}
                          value={edit.note ?? ''}
                          onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                          placeholder="np. nie podawaj ceny, dopóki klient sam nie zapyta"
                        />
                      </label>
                      <label className="f">
                        <span className="mono">Wzór dobrej odpowiedzi (opcjonalnie)</span>
                        <textarea
                          rows={3}
                          value={edit.corrected ?? ''}
                          onChange={(e) => setEdit({ ...edit, corrected: e.target.value })}
                        />
                      </label>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn sm primary" onClick={save} disabled={busy === r.id}>
                          <IcCheck /> Zapisz
                        </button>
                        <button className="btn sm" onClick={() => setEdit(null)}>Anuluj</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ marginTop: 8 }}>{r.note || <span className="muted">bez uwagi</span>}</p>
                      {r.corrected && (
                        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                          <b>Wzór:</b> {r.corrected}
                        </p>
                      )}
                      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {r.status !== 'approved' && (
                          <button className="btn sm primary" onClick={() => setStatus(r, 'approved')} disabled={busy === r.id}>
                            <IcCheck /> Włącz
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button className="btn sm" onClick={() => setStatus(r, 'rejected')} disabled={busy === r.id}>
                            Wyłącz
                          </button>
                        )}
                        <button className="btn sm" onClick={() => setEdit({ id: r.id, note: r.note, corrected: r.corrected })}>
                          <IcEdit /> Edytuj
                        </button>
                        <button className="btn sm danger" onClick={() => remove(r)} disabled={busy === r.id}>
                          <IcTrash /> Usuń
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <p className="chart-tip" style={{ marginTop: 10 }}>
            Zmiana wchodzi do rozmów w ciągu ~20 sekund (tyle żyje cache kontekstu doradcy).
          </p>
        </>
      )}
    </div>
  )
}
