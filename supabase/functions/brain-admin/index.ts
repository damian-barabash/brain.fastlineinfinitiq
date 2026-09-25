// brain-admin — auth + CRUD panelu Brain (workspaces/projects/users/KB/advisor/channels/stats)
// verify_jwt: off. Cały dostęp przez własne sesje (brain_sessions), service role wewnątrz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const SESSION_DAYS = 12; // sesja trzyma 12 dni od OSTATNIEJ aktywności (przesuwane okno)
const now = () => new Date();

function newToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replaceAll("-", "");
}

type User = {
  id: string;
  login: string;
  display_name: string | null;
  role: "admin" | "client";
  workspace_id: string | null;
};

async function getUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const { data } = await db
    .from("brain_sessions")
    .select("expires_at, brain_users(id, login, display_name, role, workspace_id, disabled, avatar)")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.brain_users) return null;
  const expires = new Date(data.expires_at);
  if (expires < now()) return null;
  const u = data.brain_users as unknown as User & { disabled: boolean };
  if (u.disabled) return null;
  // przesuwane okno: każda aktywność odnawia sesję do pełnych 12 dni
  // (aktualizacja najwyżej raz na ~dobę, żeby nie pisać do bazy przy każdym żądaniu)
  if (expires.getTime() - Date.now() < (SESSION_DAYS - 1) * 864e5) {
    await db
      .from("brain_sessions")
      .update({ expires_at: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() })
      .eq("token", token);
  }
  return u;
}

// Zbiory wskazówek trenera są osobne dla każdego agenta platformy: doradca (Brain),
// sprzedawca (Brain) i Łowca (Hand). Uwaga dobra dla jednego psuje drugiego.
const LESSON_SCOPES = ["advisor", "sales", "hand"];
const lessonScope = (v: unknown) => (LESSON_SCOPES.includes(String(v)) ? String(v) : "advisor");

// klient widzi tylko swój workspace
function wsAllowed(u: User, wsId: string) {
  return u.role === "admin" || u.workspace_id === wsId;
}

async function projectWs(projectId: string): Promise<string | null> {
  const { data } = await db.from("brain_projects").select("workspace_id").eq("id", projectId).maybeSingle();
  return data?.workspace_id ?? null;
}

async function assertProject(u: User, projectId: string) {
  const ws = await projectWs(projectId);
  if (!ws || !wsAllowed(u, ws)) throw new Error("forbidden");
}

// pola leada z body — trim + walidacja enumów
function leadRow(b: Record<string, unknown>) {
  return {
    name: String(b.name ?? "").trim().slice(0, 200),
    email: String(b.email ?? "").trim().toLowerCase().slice(0, 200),
    phone: String(b.phone ?? "").trim().slice(0, 40),
    company: String(b.company ?? "").trim().slice(0, 200),
    temp: b.temp === "warm" ? "warm" : "cold",
    channel: b.channel === "whatsapp" ? "whatsapp" : "email",
    notes: String(b.notes ?? "").slice(0, 2000),
  };
}

// "3 200,50" / "3200.50" / 3200 → 3200.50; puste/nieparsowalne → null
// jak agenci proponują produkt: główna oferta / zwykły / tylko na wyraźne pytanie klienta (ta sama reguła w brain-chat, brain-sales, hand-api)
function offerMode(v: unknown): string {
  const m = String(v ?? "");
  return m === "main" || m === "on_request" ? m : "normal";
}

function parsePrice(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function stripHtml(html: string): string {
  const NAMED: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    oacute: "ó", Oacute: "Ó", eacute: "é", ndash: "–", mdash: "—",
    laquo: "«", raquo: "»", bdquo: "„", rdquo: "”", hellip: "…",
  };
  // Wiedza = treść strony, nie jej menu. Wcześniej każdy wpis zaczynał się od „KUP SZKOLENIE › KUP PREZENT ›
  // DLA FIRM OFERTA KALENDARZ…" (menu i wersja mobilna menu), co zjadało limity promptu i myliło model.
  // Jest <main> → bierzemy tytuł + <main>; nie ma → wycinamy <nav> i <footer>.
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const main = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0];
  if (main && main.length > 400) html = `${title}. ${main}`;
  else html = html.replace(/<nav[\s>][\s\S]*?<\/nav>/gi, " ").replace(/<footer[\s>][\s\S]*?<\/footer>/gi, " ");
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchUrlText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });
    const html = await r.text();
    return stripHtml(html).slice(0, 20000);
  } finally {
    clearTimeout(t);
  }
}

// ── odświeżanie wpisów „Strona WWW" ─────────────────────────────────────────
// Stara wersja nadpisywała wiedzę czymkolwiek, co wróciło spod adresu — także stroną błędu 404/500
// albo pustką przy chwilowej awarii, czyli potrafiła SKASOWAĆ wiedzę doradcy. Teraz: status HTTP
// musi być 2xx, treść nie może być podejrzanie krótka, a wynik zawiera różnicę (co doszło / co znikło).
const KB_CRON_KEY = Deno.env.get("KB_CRON_KEY") ?? "";

// Warszawska data „dziś" (YYYY-MM-DD) — do odsiewania minionych terminów i do reguły „sprawdzone dziś"
function warsawDay(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function warsawHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(d));
}
// początek dzisiejszej doby w Warszawie, jako znacznik UTC
function warsawMidnightIso(): string {
  const utcMidnight = new Date(`${warsawDay()}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - warsawHour(utcMidnight) * 3600_000).toISOString();
}
// produkty ze źródłami, których opis nie nadąża za źródłami
async function staleProductDescriptions(): Promise<string[]> {
  const [{ data: prods }, { data: srcs }] = await Promise.all([
    db.from("brain_products").select("id, desc_synced_at"),
    db.from("brain_kb_items").select("product_id, changed_at, created_at").not("product_id", "is", null),
  ]);
  const last = new Map<string, string>();
  for (const r of srcs ?? []) {
    const t = String(r.changed_at ?? r.created_at ?? "");
    if (t > (last.get(r.product_id) ?? "")) last.set(r.product_id, t);
  }
  return (prods ?? []).filter((p) => last.has(p.id) && (!p.desc_synced_at || String(p.desc_synced_at) < (last.get(p.id) ?? ""))).map((p) => p.id);
}

// JSON (np. REST bazy strony klienta: terminy, sezony, wyjazdy) → linie „klucz: wartość" czytelne dla modelu.
// Pomijamy techniczne pola i wersje angielskie; wiersze z datą w przeszłości wypadają, reszta sortowana po dacie.
const JSON_HEAD = "Dane na żywo ze źródła";
const JSON_SKIP = /^(id|uuid|sort|order|visible|hidden|created_at|updated_at|photo|photos|image|images|img|color|icon|signup_url|slug|.*_en)$/i;
const JSON_DATE = /^(date|date_to|date_end|end_date|date_from|start_date|starts_at|ends_at|day_date)$/i;
function jsonToKb(raw: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const obj = data as Record<string, unknown>;
  const rows = (Array.isArray(data) ? data : Array.isArray(obj?.items) ? obj.items : Array.isArray(obj?.data) ? obj.data : [data]) as Record<string, unknown>[];
  const today = warsawDay();
  const lastDate = (r: Record<string, unknown>) => {
    const ds = Object.entries(r).filter(([k, v]) => JSON_DATE.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)).map(([, v]) => String(v).slice(0, 10));
    return ds.sort().pop() ?? "";
  };
  const firstDate = (r: Record<string, unknown>) => {
    const ds = Object.entries(r).filter(([k, v]) => JSON_DATE.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)).map(([, v]) => String(v).slice(0, 10));
    return ds.sort()[0] ?? "";
  };
  const live = rows.filter((r) => r && typeof r === "object" && (!lastDate(r) || lastDate(r) >= today))
    .sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
  // etykiety po polsku i jednoznaczne — model czytał „capacity: 8" jako „zostało 8 wolnych miejsc"
  const LABEL: Record<string, string> = {
    date: "data", date_from: "od", date_to: "do", start_date: "od", end_date: "do", starts_at: "początek", ends_at: "koniec",
    time: "godziny", title: "nazwa", label: "nazwa", name: "nazwa", type: "rodzaj", location: "miejsce", track: "tor",
    address: "adres", capacity: "wielkość grupy (miejsc łącznie; ile jest jeszcze wolnych, nie wiemy)", price: "cena",
    currency: "waluta", description: "opis", note: "uwagi", includes: "w cenie",
  };
  const fmtDate = (v: string) => {
    const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? v
      : new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  };
  const lines = live.map((r) =>
    "- " + Object.entries(r)
      .filter(([k, v]) => !JSON_SKIP.test(k) && v !== null && v !== "" && typeof v !== "object")
      .map(([k, v]) => {
        const key = k.replace(/_pl$/, "");
        const val = JSON_DATE.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v) : String(v).replace(/\s+/g, " ").slice(0, 400);
        return `${LABEL[key] ?? key}: ${val}`;
      })
      .join("; ")
  );
  // grupy po miesiącach z licznikiem („LISTOPAD 2026, 2 pozycje") — bez tego model przy pytaniu
  // „co w listopadzie?" wyłapywał jeden termin z długiej listy i mówił „mamy jeden termin"
  const out: string[] = [];
  let month = "";
  live.forEach((r, i) => {
    if (lines[i].length <= 2) return;
    const m = firstDate(r).slice(0, 7);
    if (m && m !== month) {
      month = m;
      const n = live.filter((x, j) => firstDate(x).slice(0, 7) === m && lines[j].length > 2).length;
      const name = new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00Z`));
      out.push(`\n${name.toUpperCase()}: ${n} ${n === 1 ? "pozycja" : n < 5 ? "pozycje" : "pozycji"}`);
    }
    out.push(lines[i]);
  });
  // bez godziny w nagłówku — inaczej każde sprawdzenie byłoby „zmianą treści"
  const head = `${JSON_HEAD} (odświeżane co godzinę). Lista zawiera WSZYSTKIE nadchodzące pozycje w kolejności dat, pogrupowane po miesiącach, pierwsza = najbliższa. Pozycje z datą w przeszłości są pominięte.`;
  return (out.length ? `${head}\n${out.join("\n")}` : `${head}\nBrak nadchodzących pozycji.`).slice(0, 20000);
}

async function fetchUrlChecked(url: string, attempt = 0): Promise<{ ok: boolean; text: string; status: number; error?: string; json?: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.6",
      },
    });
    const html = await r.text();
    if (!r.ok) return { ok: false, text: "", status: r.status, error: `strona odpowiedziała kodem ${r.status}` };
    // źródło danych JSON (np. kalendarz terminów z bazy strony klienta) → czytelne linie dla modelu
    const json = /json/i.test(r.headers.get("content-type") ?? "") || /^\s*[[{]/.test(html);
    if (json) {
      const t = jsonToKb(html);
      return t === null ? { ok: false, text: "", status: r.status, error: "źródło nie oddało poprawnego JSON" } : { ok: true, text: t, status: r.status, json: true };
    }
    return { ok: true, text: stripHtml(html).slice(0, 20000), status: r.status };
  } catch (e) {
    const raw = String(e);
    // zerwane połączenie / reset TLS bywa chwilowy (kilka żądań naraz do tego samego hosta) — jedna powtórka
    if (attempt === 0 && !raw.includes("abort")) {
      clearTimeout(t);
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
      return fetchUrlChecked(url, 1);
    }
    console.error("kb fetch", url, raw.slice(0, 200));
    const msg = raw.includes("abort") ? "strona nie odpowiedziała w 15 s" : `nie udało się połączyć ze stroną (${raw.replace(/^\w*Error:\s*/, "").slice(0, 90)})`;
    return { ok: false, text: "", status: 0, error: msg };
  } finally {
    clearTimeout(t);
  }
}

// fragmenty do porównania: zdania, a długie kawałki (menu, listy bez kropek) cięte co ~160 znaków
function kbFragments(text: string): string[] {
  const out: string[] = [];
  for (const sent of String(text ?? "").split(/(?<=[.!?…])\s+/)) {
    let x = sent.trim();
    while (x.length > 200) {
      const cut = x.lastIndexOf(" ", 160);
      const at = cut > 60 ? cut : 160;
      out.push(x.slice(0, at).trim());
      x = x.slice(at).trim();
    }
    if (x.length > 2) out.push(x);
  }
  // skróty („sp. z o.o.", „ul.", „tel.") tną zdanie na strzępy — krótkie kawałki doklejamy do poprzedniego
  const merged: string[] = [];
  for (const f of out) {
    if (merged.length && (f.length < 14 || merged[merged.length - 1].length < 14)) merged[merged.length - 1] += " " + f;
    else merged.push(f);
  }
  return merged;
}
const fragKey = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();

function kbDiff(before: string, after: string) {
  const a = kbFragments(before), b = kbFragments(after);
  const setA = new Set(a.map(fragKey)), setB = new Set(b.map(fragKey));
  const added = b.filter((x) => !setA.has(fragKey(x)));
  const removed = a.filter((x) => !setB.has(fragKey(x)));
  return {
    added_count: added.length, removed_count: removed.length,
    added: added.slice(0, 14).map((x) => x.slice(0, 240)), removed: removed.slice(0, 14).map((x) => x.slice(0, 240)),
  };
}

type KbRefreshResult = {
  ok: boolean; changed: boolean; error?: string; chars_before: number; chars_after: number;
  added: string[]; removed: string[]; added_count: number; removed_count: number; checked_at: string;
};
async function refreshKbItem(it: { id: string; url: string; content: string | null }, auto: boolean): Promise<KbRefreshResult> {
  const now = new Date().toISOString();
  const before = String(it.content ?? "");
  const empty = { added: [], removed: [], added_count: 0, removed_count: 0 };
  const f = await fetchUrlChecked(it.url);
  let error = f.ok ? "" : (f.error ?? "błąd pobierania");
  // strona „działa", ale oddała prawie nic (blokada bota, pusta aplikacja JS, awaria) — nie kasujemy wiedzy
  // (nie dotyczy źródeł JSON: kalendarz naturalnie się kurczy, gdy terminy mijają)
  if (!error && !f.json && (f.text.length < 80 || (before.length > 800 && f.text.length < before.length * 0.2))) {
    error = `strona oddała tylko ${f.text.length} znaków tekstu (było ${before.length}) — zostawiam poprzednią treść`;
  }
  if (error) {
    await db.from("brain_kb_items").update({ checked_at: now, fetch_error: error }).eq("id", it.id);
    return { ok: false, changed: false, error, chars_before: before.length, chars_after: before.length, checked_at: now, ...empty };
  }
  const changed = f.text !== before;
  const diff = changed ? kbDiff(before, f.text) : empty;
  const patch: Record<string, unknown> = { checked_at: now, fetch_error: null };
  if (changed) {
    Object.assign(patch, {
      content: f.text, chars: f.text.length, updated_at: now, changed_at: now,
      last_change: { at: now, auto, chars_before: before.length, chars_after: f.text.length, ...diff },
    });
  }
  await db.from("brain_kb_items").update(patch).eq("id", it.id);
  return { ok: true, changed, chars_before: before.length, chars_after: f.text.length, checked_at: now, ...diff };
}

// ── opis produktu synchronizowany ze źródłami ───────────────────────────────
// Opis produktu NIE jest już polem wpisywanym ręcznie: model składa go wyłącznie ze źródeł produktu
// (strony WWW, pliki i notatki dodane jako „wiedza o produkcie"). Dzięki temu, gdy z oferty na stronie
// coś znika, znika też z opisu — wcześniej opis żył własnym życiem i doradca sprzedawał rzeczy,
// których już nie było. Własne dopiski właściciela mają osobne pole `manual_notes` (idzie do promptu obok).

// ── koszt modelu → fiq_ai_usage (TEN SAM blok w hand-api / brain-chat / brain-sales) ───
// Cennik DeepSeek (USD za 1M tokenów, stan 2026-09): [wejście bez cache, wejście z cache, wyjście]
// w szczycie (pn–pt 01–04 i 06–10 UTC); poza szczytem połowa. Lokalny qwen (Barabash AI) = 0.
const PRICES: Record<string, [number, number, number]> = {
  "deepseek-v4-pro": [1.32, 0.044, 3.96],
  "deepseek-reasoner": [1.32, 0.044, 3.96],
  "deepseek-flash": [0.3, 0.006, 1.2],
  "deepseek-chat": [0.3, 0.006, 1.2],
  "deepseek": [0.3, 0.006, 1.2],
  "gpt-4o-mini": [0.15, 0.075, 0.6],
  "gpt-4o": [2.5, 1.25, 10],
};
function isPeakUtc(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours();
  return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}
type Usage = { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
function costUsd(model: string, u: Usage | undefined) {
  const m = model.toLowerCase();
  const k = Object.keys(PRICES).find((p) => m.includes(p));
  if (!k || !u) return 0;
  const [inMiss, inHit, out] = PRICES[k].map((x) => (isPeakUtc() ? x : x / 2));
  const pt = Number(u.prompt_tokens ?? 0);
  const hit = Number(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0);
  const miss = Number(u.prompt_cache_miss_tokens ?? Math.max(0, pt - hit));
  return +((miss / 1e6) * inMiss + (hit / 1e6) * inHit + (Number(u.completion_tokens ?? 0) / 1e6) * out).toFixed(6);
}
function usageParts(u: Usage | undefined) {
  const pt = Number(u?.prompt_tokens ?? 0);
  const hit = Number(u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0);
  const miss = Number(u?.prompt_cache_miss_tokens ?? Math.max(0, pt - hit));
  return { pt, hit, miss, ct: Number(u?.completion_tokens ?? 0), peak: isPeakUtc() };
}
const isDeepSeek = (model: string) => /deepseek/i.test(model);
async function logUsage(projectId: string | null, action: string, model: string, u: Usage | undefined) {
  if (!u) return;
  try {
    await db.from("fiq_ai_usage").insert({
      product_key: "brain", // synchronizacja bazy wiedzy — wspólna dla doradcy i sprzedawcy
      project_id: projectId,
      action,
      model,
      prompt_tokens: Number(u.prompt_tokens ?? 0),
      completion_tokens: Number(u.completion_tokens ?? 0),
      cost_usd: costUsd(model, u),
      cache_hit_tokens: usageParts(u).hit,
      cache_miss_tokens: usageParts(u).miss,
      peak: usageParts(u).peak,
    });
  } catch (e) {
    console.error("fiq_ai_usage insert", String(e).slice(0, 120));
  }
}

async function askModel(messages: { role: string; content: string }[], maxTokens = 600, meta?: { projectId: string | null; action: string }): Promise<string> {
  const { data } = await db.from("brain_settings").select("value").eq("key", "ai_provider").maybeSingle();
  const ai = (data?.value ?? {}) as Record<string, string | number>;
  let baseUrl = String(ai.base_url || Deno.env.get("BARABASH_AI_URL") || "").trim().replace(/\/+$/, "");
  if (baseUrl.endsWith("/chat/completions")) baseUrl = baseUrl.slice(0, -"/chat/completions".length);
  if (baseUrl && !baseUrl.endsWith("/v1")) baseUrl += "/v1";
  const key = String(ai.api_key || "").trim() || Deno.env.get(String(ai.key_secret || "BRAIN_AI_KEY").trim()) || "";
  const model = String(ai.model || "").trim() || "qwen3.5:9b";
  if (!baseUrl || !key) throw new Error("model AI nie jest skonfigurowany");
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.2, stream: false, messages, ...(isDeepSeek(model) ? { thinking: { type: "disabled" } } : {}) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`model: HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  const j = await r.json();
  await logUsage(meta?.projectId ?? null, meta?.action ?? "kb", model, j?.usage);
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

type DescSync = {
  ok: boolean; changed: boolean; skipped?: string; error?: string; before: string; after: string;
  added: string[]; removed: string[]; added_count: number; removed_count: number; at: string;
};
// Elementy zdania, które da się sprawdzić mechanicznie: liczby (ceny, daty, godziny) i nazwy własne.
// Model 9B poproszony o „popraw opis wg źródeł" oddaje tekst bez zmian — dlatego niezgodności szukamy
// kodem, zdanie po zdaniu, a modelowi zostaje wąskie zadanie: przepisać wskazane zdanie bez wskazanych elementów.
const compact = (t: string) => t.toLowerCase().replace(/[–—−]/g, "-").replace(/\s+/g, "");
function unsupportedTokens(sentence: string, srcCompact: string, srcLower: string): string[] {
  const bad: string[] = [];
  for (const m of sentence.matchAll(/\d[\d\s.,:–—-]*\d|\d{3,}/g)) {
    const tok = m[0].trim();
    if (tok.replace(/\D/g, "").length < 3) continue;
    if (!srcCompact.includes(compact(tok))) bad.push(tok);
  }
  const words = sentence.split(/\s+/);
  words.forEach((w, i) => {
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}\d-]+$/gu, "");
    if (i === 0 || clean.length < 5 || !/^\p{Lu}/u.test(clean)) return;
    // odmiana: „Magdaleną Piasecką" vs „Magdalena Piasecka" — porównujemy rdzeń
    const stem = clean.toLowerCase().slice(0, Math.max(4, clean.length - 3));
    if (!srcLower.includes(stem)) bad.push(clean);
  });
  return [...new Set(bad)];
}
function parseJsonLoose(raw: string): Record<string, unknown> {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}
const splitSentences = (t: string) => String(t ?? "").split(/(?<=[.!?…])\s+(?=[\p{Lu}\d„"])/u).map((x) => x.trim()).filter(Boolean);

async function syncProductDescription(productId: string, auto: boolean, addedOnPages: string[] = []): Promise<DescSync> {
  const at = new Date().toISOString();
  const none = { added: [], removed: [], added_count: 0, removed_count: 0 };
  const { data: p } = await db.from("brain_products").select("id, name, description, project_id").eq("id", productId).maybeSingle();
  if (!p) return { ok: false, changed: false, error: "produkt nie istnieje", before: "", after: "", at, ...none };
  const usageMeta = { projectId: String(p.project_id ?? "") || null, action: "kb_sync" };
  const before = String(p.description ?? "").trim();
  const { data: items } = await db.from("brain_kb_items").select("type, title, url, content").eq("product_id", productId).order("sort").order("created_at");
  const sources = (items ?? []).filter((i) => String(i.content ?? "").trim().length > 40);
  if (!sources.length) return { ok: true, changed: false, skipped: "produkt nie ma jeszcze żadnych źródeł (strony, pliku ani notatki)", before, after: before, at, ...none };
  let budget = 12000;
  const blocks: string[] = [];
  for (const it of sources) {
    if (budget <= 0) break;
    const cap = Math.min(budget, it.type === "url" ? 6500 : 4000);
    const text = String(it.content).slice(0, cap);
    budget -= text.length;
    blocks.push(`--- ŹRÓDŁO: ${it.type === "url" ? it.url : it.title || it.type} ---\n${text}`);
  }
  const srcAll = sources.map((i) => String(i.content)).join("\n");
  const srcBlock = blocks.join("\n\n");
  const srcCompact = compact(srcAll), srcLower = srcAll.toLowerCase();
  const fail = (e: unknown) => ({ ok: false, changed: false, error: `nie udało się zsynchronizować opisu: ${String((e as Error)?.message ?? e).slice(0, 140)}`, before, after: before, at, ...none });

  let after = "";
  try {
    if (before.length < 80) {
      // brak opisu → pełne wygenerowanie
      after = await askModel([
        {
          role: "system",
          content:
            "Piszesz zwięzły opis produktu do bazy wiedzy doradcy AI. Korzystasz WYŁĄCZNIE z podanych źródeł — niczego nie dopowiadasz i nie komentujesz, czego w źródłach brakuje. " +
            "Czysty tekst po polsku, 4–8 zdań, maksymalnie 900 znaków, bez markdown i bez wstępów. " +
            "Kolejność: co to jest i dla kogo; termin i miejsce (jeśli są); formuła/przebieg; pakiety i ceny DOKŁADNIE jak w źródłach (z netto/brutto); co jest w cenie. " +
            "Pomijasz menu strony, stopki, politykę prywatności, dane rejestrowe i teksty przycisków.",
        },
        { role: "user", content: `PRODUKT: ${p.name}\n\n${srcBlock}\n\nNapisz opis tego produktu.` },
      ], 700, usageMeta);
    } else {
      const sents = splitSentences(before);
      const flagged = new Map<number, string[]>();
      sents.forEach((t, i) => {
        const bad = unsupportedTokens(t, srcCompact, srcLower);
        if (bad.length) flagged.set(i, bad);
      });
      // Tylko kontrola mechaniczna (liczby, daty, ceny, nazwy własne). „Druga opinia" modelu o zdaniach bez
      // takich elementów wycinała zdania marketingowe właściciela i dawała inny wynik przy każdym przebiegu.
      const out = [...sents];
      for (const [i, bad] of [...flagged.entries()].slice(0, 6)) {
        // jedno zdanie = jedno wąskie zadanie i odpowiedź czystym tekstem (JSON z polskimi cudzysłowami model 9B psuł)
        const raw = await askModel([
          {
            role: "system",
            content:
              "Poprawiasz JEDNO zdanie opisu produktu, żeby zgadzało się ze źródłami. Elementy wskazane jako NIEOBECNE W ŹRÓDŁACH: " +
              "zastąp ich aktualnym odpowiednikiem ze źródeł (np. nowa data, godziny, cena, miejsce), a jeśli odpowiednika w źródłach nie ma — " +
              "usuń cały fragment zdania, który ich dotyczy (np. cały pakiet razem z jego ceną i osobą). Resztę zdania zostaw dosłownie. " +
              "Niczego nie dodajesz od siebie. Odpowiadasz SAMYM poprawionym zdaniem, bez komentarza i bez cudzysłowów. Jeśli nic sensownego nie zostaje, odpowiadasz jednym słowem: USUŃ",
          },
          { role: "user", content: `${srcBlock}\n\nZDANIE: ${sents[i]}\nNIEOBECNE W ŹRÓDŁACH: ${bad.join("; ")}` },
        ], 220, usageMeta).catch(() => "");
        let fixedSent = raw.split("\n").map((x) => x.trim()).filter(Boolean)[0] ?? "";
        fixedSent = fixedSent.replace(/^(zdanie|poprawione zdanie)\s*:\s*/i, "").replace(/^[„"']+|[”"']+$/g, "").trim();
        if (!fixedSent || /^usu[nń]\.?$/i.test(fixedSent)) fixedSent = "";
        // wynik też przechodzi kontrolę: gdy nadal zawiera coś, czego nie ma w źródłach — zdanie wypada
        if (fixedSent && unsupportedTokens(fixedSent, srcCompact, srcLower).length) fixedSent = "";
        console.log("desc fix:", JSON.stringify({ was: sents[i], bad, now: fixedSent }).slice(0, 500));
        out[i] = fixedSent;
      }
      // nowe fakty tylko z tego, co faktycznie DOSZŁO na stronach (bez tego opis puchłby co rano)
      const fresh = addedOnPages.filter((x) => x.length > 25).slice(0, 12);
      if (fresh.length) {
        const add = parseJsonLoose(await askModel([
          { role: "system", content: 'Na stronie produktu pojawiły się nowe fragmenty. Jeśli któryś zawiera WAŻNY fakt o produkcie (termin, miejsce, pakiet, cena, co w cenie), którego nie ma w obecnym opisie — napisz o nim 1–2 krótkie zdania, wyłącznie na podstawie tych fragmentów. Menu, stopki i hasła reklamowe ignorujesz. Zwróć WYŁĄCZNIE JSON {"dodaj":["zdanie"]} albo {"dodaj":[]}.' },
          { role: "user", content: `PRODUKT: ${p.name}\n\nOBECNY OPIS:\n${out.filter(Boolean).join(" ")}\n\nNOWE FRAGMENTY NA STRONIE:\n${fresh.map((x) => `- ${x}`).join("\n")}` },
        ], 250, usageMeta).catch(() => ""));
        for (const x of (Array.isArray(add.dodaj) ? add.dodaj : []).slice(0, 2)) {
          const t = String(x ?? "").trim();
          if (t.length > 15 && !unsupportedTokens(t, srcCompact, srcLower).length) out.push(t);
        }
      }
      after = out.filter(Boolean).join(" ");
    }
  } catch (e) {
    return fail(e);
  }
  after = after.replace(/\*\*|__|^#+\s*/gm, "").replace(/[ \t]+/g, " ").trim().slice(0, 1400);
  if (after.length < 40) return { ok: false, changed: false, error: "po sprawdzeniu ze źródłami z opisu nic nie zostało — zostawiam poprzedni, sprawdź źródła produktu", before, after: before, at, ...none };
  const changed = fragKey(after) !== fragKey(before);
  const diff = changed ? kbDiff(before, after) : none;
  const patch: Record<string, unknown> = { desc_synced_at: at };
  if (changed) Object.assign(patch, { description: after, updated_at: at, desc_last_change: { at, auto, before, after, ...diff } });
  await db.from("brain_products").update(patch).eq("id", productId);
  return { ok: true, changed, before, after: changed ? after : before, at, ...diff };
}

// ── maskowanie sekretów w odpowiedziach do panelu ───────────────────────────
const SECRET_MASK = "••••";
const SALES_SECRET_PATHS = [["email", "resend_key"], ["whatsapp", "wa_token"], ["voice", "api_key"], ["voice", "webhook_secret"]];
const CHANNEL_SECRET_PATHS = [["page_token"], ["wa_token"], ["app_secret"]];
const maskValue = (v: unknown) => {
  const str = String(v ?? "");
  return str ? `${SECRET_MASK}${str.slice(-4)}` : "";
};
function maskSecrets(cfg: Record<string, unknown>, paths: string[][]): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(cfg ?? {})) as Record<string, unknown>;
  for (const path of paths) {
    let node: Record<string, unknown> | undefined = out;
    for (let i = 0; i < path.length - 1; i++) node = node?.[path[i]] as Record<string, unknown> | undefined;
    const leaf = path[path.length - 1];
    if (node && node[leaf]) node[leaf] = maskValue(node[leaf]);
  }
  return out;
}
// wartość zamaskowana = użytkownik jej nie zmieniał → bierzemy poprzednią z bazy
function restoreSecrets(incoming: Record<string, unknown>, prev: Record<string, unknown>, paths: string[][]): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(incoming ?? {})) as Record<string, unknown>;
  for (const path of paths) {
    let node: Record<string, unknown> | undefined = out;
    let old: Record<string, unknown> | undefined = prev;
    for (let i = 0; i < path.length - 1; i++) {
      node = node?.[path[i]] as Record<string, unknown> | undefined;
      old = old?.[path[i]] as Record<string, unknown> | undefined;
    }
    const leaf = path[path.length - 1];
    if (!node) continue;
    const val = String(node[leaf] ?? "");
    if (val.startsWith(SECRET_MASK) || (!val && old?.[leaf])) node[leaf] = old?.[leaf] ?? "";
  }
  return out;
}

// ── sekrety integracji wklejane w panelu ─────────────────────────────────────
// Token Unipile i klucz Google Maps admin wkleja w Integracjach, więc leżą
// w brain_settings. Do przeglądarki wracają zamaskowane (jak klucze kanałów),
// a zapis maski oznacza „nie zmieniałem" — stara wartość zostaje.
const SETTINGS_SECRET_PATHS: Record<string, string[][]> = {
  unipile: [["api_key"]],
  maps: [["api_key"]],
  ai_provider: [["api_key"]],
};

// Klucz integracji: najpierw wklejony w panelu, potem sekret Supabase pod nazwą.
async function integrationKey(key: string, defaultSecret: string) {
  const { data } = await db.from("brain_settings").select("value").eq("key", key).maybeSingle();
  const cfg = (data?.value ?? {}) as Record<string, string>;
  const token = (cfg.api_key || "").trim() || Deno.env.get((cfg.key_secret || defaultSecret).trim()) || "";
  return { cfg, token };
}

// ── realny stan integracji platformy ────────────────────────────────────────
// Wklejony klucz nic nie znaczy: klucz Google bywa poprawny, a Places API
// wyłączone; token Unipile bywa ważny, a nie ma pod nim żadnego konta. Dlatego
// pytamy dostawcę naprawdę, a wynik trzymamy przez CHECK_TTL_MS, żeby nie robić
// tego przy każdym otwarciu panelu.
const CHECK_TTL_MS = 10 * 60_000;
const PLACES_CONSOLE = "https://console.cloud.google.com/apis/library/places.googleapis.com";
const UNIPILE_CONSOLE = "https://dashboard.unipile.com";

type Status = { ok: boolean; reason?: string; url?: string; detail?: string; checked_at?: string };

async function readStatus(key: string): Promise<Status | null> {
  const { data } = await db.from("brain_settings").select("value").eq("key", `${key}_status`).maybeSingle();
  const v = (data?.value ?? null) as Status | null;
  if (!v?.checked_at) return null;
  return Date.now() - new Date(v.checked_at).getTime() < CHECK_TTL_MS ? v : null;
}
async function writeStatus(key: string, st: Status): Promise<Status> {
  const value = { ...st, checked_at: new Date().toISOString() };
  await db.from("brain_settings").upsert({ key: `${key}_status`, value, updated_at: new Date().toISOString() });
  return value;
}

async function checkMaps(force = false): Promise<Status> {
  const { token } = await integrationKey("maps", "GOOGLE_MAPS_KEY");
  if (!token) return { ok: false, reason: "Brak klucza — wklej go poniżej", url: PLACES_CONSOLE };
  if (!force) {
    const c = await readStatus("maps");
    if (c) return c;
  }
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": token, "X-Goog-FieldMask": "places.displayName" },
      body: JSON.stringify({ textQuery: "warsztat Kraków", languageCode: "pl", maxResultCount: 1 }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      return await writeStatus("maps", { ok: true, detail: String(data?.places?.[0]?.displayName?.text ?? "") });
    }
    const msg = String(data?.error?.message ?? `HTTP ${r.status}`);
    const url = String(data?.error?.details?.[0]?.metadata?.activationUrl ?? PLACES_CONSOLE);
    const short = /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)
      ? "Places API (New) nie jest włączone w projekcie Google"
      : msg.slice(0, 200);
    return await writeStatus("maps", { ok: false, reason: short, url });
  } catch (e) {
    return { ok: false, reason: `Google nie odpowiada: ${String((e as Error).message ?? e).slice(0, 140)}`, url: PLACES_CONSOLE };
  }
}

async function checkUnipile(force = false): Promise<Status> {
  const { cfg, token } = await integrationKey("unipile", "UNIPILE_TOKEN");
  const dsn = String(cfg.dsn ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!dsn || !token) {
    return { ok: false, reason: dsn ? "Brak tokenu — wklej go poniżej" : "Brak DSN i tokenu", url: UNIPILE_CONSOLE };
  }
  if (!force) {
    const c = await readStatus("unipile");
    if (c) return c;
  }
  try {
    const r = await fetch(`https://${dsn}/api/v1/accounts`, {
      headers: { "X-API-KEY": token, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      return await writeStatus("unipile", {
        ok: false,
        reason: `Unipile ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`,
        url: UNIPILE_CONSOLE,
      });
    }
    const data = await r.json().catch(() => ({}));
    const n = ((data?.items ?? data?.accounts ?? []) as unknown[]).length;
    return await writeStatus(
      "unipile",
      n
        ? { ok: true, detail: `${n} podłączonych kont` }
        : { ok: false, reason: "Token działa, ale nie ma podłączonego żadnego konta", url: UNIPILE_CONSOLE },
    );
  } catch (e) {
    return { ok: false, reason: `Unipile nie odpowiada: ${String((e as Error).message ?? e).slice(0, 140)}`, url: UNIPILE_CONSOLE };
  }
}

// Model sprawdzamy najtańszym możliwym zapytaniem — chodzi o to, czy klucz
// i adres w ogóle odpowiadają, a nie o jakość odpowiedzi.
async function checkAi(force = false): Promise<Status> {
  const { data } = await db.from("brain_settings").select("value").eq("key", "ai_provider").maybeSingle();
  const ai = (data?.value ?? {}) as Record<string, string | number>;
  let baseUrl = String(ai.base_url || Deno.env.get("BARABASH_AI_URL") || "").trim().replace(/\/+$/, "");
  if (baseUrl.endsWith("/chat/completions")) baseUrl = baseUrl.slice(0, -"/chat/completions".length);
  if (baseUrl && !baseUrl.endsWith("/v1")) baseUrl += "/v1";
  const key = String(ai.api_key || "").trim() || Deno.env.get(String(ai.key_secret || "BRAIN_AI_KEY").trim()) || "";
  const model = String(ai.model || "").trim() || "qwen3.5:9b";
  if (!baseUrl) return { ok: false, reason: "Brak adresu (Base URL) dostawcy" };
  if (!key) return { ok: false, reason: "Brak klucza API — wklej go poniżej" };
  if (!force) {
    const c = await readStatus("ai_provider");
    if (c) return c;
  }
  try {
    const t0 = Date.now();
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1, stream: false, messages: [{ role: "user", content: "ping" }], ...(isDeepSeek(model) ? { thinking: { type: "disabled" } } : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await r.text();
    if (!r.ok) {
      return await writeStatus("ai_provider", { ok: false, reason: `${model}: HTTP ${r.status} ${body.slice(0, 160)}` });
    }
    return await writeStatus("ai_provider", { ok: true, detail: `${model}, odpowiedź w ${Date.now() - t0} ms` });
  } catch (e) {
    return { ok: false, reason: `Dostawca nie odpowiada: ${String((e as Error).message ?? e).slice(0, 140)}` };
  }
}

async function integrationsStatus(force = false) {
  const [unipile, maps, ai] = await Promise.all([checkUnipile(force), checkMaps(force), checkAi(force)]);
  return { unipile, maps, ai_provider: ai };
}

// ═══════════════════════════════════════════════════════════════════════════
// Kanały klienta przez Unipile — wspólne dla WSZYSTKICH produktów (2026-09-14)
// ═══════════════════════════════════════════════════════════════════════════
// Klient nie podaje nam haseł: admin generuje link `/connect?t=…`, klient go otwiera,
// a logowanie (QR WhatsApp, hasło+2FA Instagram/LinkedIn) robi na stronie Unipile.
// Po podłączeniu Unipile woła notify_url (brain-hook?hook=unipile-auth) z `name` =
// nasz token → konto ląduje w fiq_project_accounts PROJEKTU. Tę samą tabelę czytają
// AI Doradca, AI Sprzedawca i AI Łowca Leadów. Link Unipile żyje krótko (do ich
// dobowego restartu), więc nasz adres jest stały, a kreator mintujemy przy kliknięciu.
const PROVIDERS = ["WHATSAPP", "INSTAGRAM", "LINKEDIN", "MESSENGER", "TELEGRAM"];
const PROVIDER_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", LINKEDIN: "LinkedIn", MESSENGER: "Messenger", TELEGRAM: "Telegram",
};
const LINK_TTL_DAYS = 30;
const LINK_MAX_OPENS = 50; // zapora na bota, który w kółko generowałby kreatory
const ORIGINS = new Set([
  "https://brain.fastlineinfinitiq.pl",
  "https://hand.fastlineinfinitiq.pl",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
]);
const UNI_HOOK_KEY = Deno.env.get("UNIPILE_HOOK_KEY") ?? "";
const HOOK_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-hook`;

type ConnectLink = {
  token: string; project_id: string; kind: string; reconnect_account: string | null; providers: string[]; origin: string;
  expires_at: string | null; revoked_at: string | null; connected_at: string | null;
  account_id: string | null; account_name: string | null; accounts: unknown[]; opens: number; created_at: string;
};

async function unipileDsn() {
  const { cfg, token } = await integrationKey("unipile", "UNIPILE_TOKEN");
  const dsn = String(cfg.dsn ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { dsn, token, ready: !!(dsn && token) };
}

async function uniFetch(path: string, init: RequestInit = {}, timeout = 25_000): Promise<Record<string, unknown>> {
  const { dsn, token, ready } = await unipileDsn();
  if (!ready) throw new Error("Unipile nieskonfigurowane — wklej DSN i token w Admin → Integracje");
  const r = await fetch(`https://${dsn}/api/v1${path}`, {
    ...init,
    headers: { "X-API-KEY": token, accept: "application/json", "Content-Type": "application/json", ...((init.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(timeout),
  });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!r.ok) throw new Error(`Unipile ${r.status}: ${text.slice(0, 200)}`);
  return data;
}

const connectUrl = (l: ConnectLink) => `${l.origin}/connect?t=${l.token}`;

function linkState(l: ConnectLink | null): string {
  if (!l) return "none";
  if (l.revoked_at) return "revoked";
  if (l.expires_at && new Date(l.expires_at) < new Date()) return "expired";
  return l.connected_at ? "connected" : "waiting";
}

async function currentLink(projectId: string): Promise<ConnectLink | null> {
  const { data } = await db.from("fiq_connect_links").select("*")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data ?? null) as ConnectLink | null;
}

async function projectAccounts(projectId: string) {
  const { data } = await db.from("fiq_project_accounts")
    .select("id, provider, account_id, account_name, status, status_at, connected_at")
    .eq("project_id", projectId).order("connected_at", { ascending: false });
  return (data ?? []).map((a) => ({ ...a, label: PROVIDER_LABEL[a.provider] ?? a.provider }));
}

// Webhooki Unipile są GLOBALNE (wszystkie konta instalacji) — rejestrujemy raz i pilnujemy,
// żeby były (klient podłączył konto, a webhooka nie ma = doradca milczy bez śladu).
async function ensureUnipileWebhooks(): Promise<{ messaging: string; account_status: string }> {
  if (!UNI_HOOK_KEY) throw new Error("brak sekretu UNIPILE_HOOK_KEY");
  const wanted: Record<string, { url: string; source: string; events?: string[] }> = {
    messaging: { url: `${HOOK_BASE}?hook=unipile&key=${UNI_HOOK_KEY}`, source: "messaging", events: ["message_received"] },
    account_status: { url: `${HOOK_BASE}?hook=unipile-status&key=${UNI_HOOK_KEY}`, source: "account_status" },
  };
  const list = await uniFetch("/webhooks", {}, 15_000);
  const items = (list?.items ?? []) as Array<Record<string, unknown>>;
  const out: Record<string, string> = {};
  for (const [name, w] of Object.entries(wanted)) {
    const hit = items.find((i) => String(i.request_url ?? "") === w.url && String(i.source ?? "") === w.source);
    if (hit) {
      out[name] = String(hit.id ?? hit.webhook_id ?? "ok");
      continue;
    }
    const body: Record<string, unknown> = {
      request_url: w.url, source: w.source, name: `fiq-${name}`, format: "json", enabled: true,
      headers: [{ key: "x-hook-key", value: UNI_HOOK_KEY }],
    };
    if (w.events) body.events = w.events;
    const created = await uniFetch("/webhooks", { method: "POST", body: JSON.stringify(body) }, 20_000);
    out[name] = String(created?.webhook_id ?? created?.id ?? "created");
    console.log("unipile webhook zarejestrowany", name, out[name]);
  }
  return out as { messaging: string; account_status: string };
}

/** Świeży link kreatora Unipile — ważny 2 h. Dla kilku providerów kreator sam daje wybór. */
async function hostedAuthUrl(link: ConnectLink): Promise<string> {
  const { dsn } = await unipileDsn();
  const payload: Record<string, unknown> = {
    type: link.kind === "reconnect" ? "reconnect" : "create",
    api_url: `https://${dsn}`,
    expiresOn: new Date(Date.now() + 2 * 3600_000).toISOString(),
    name: link.token,
    notify_url: `${HOOK_BASE}?hook=unipile-auth&key=${encodeURIComponent(UNI_HOOK_KEY)}`,
    success_redirect_url: `${connectUrl(link)}&ok=1`,
    failure_redirect_url: `${connectUrl(link)}&fail=1`,
  };
  if (link.kind === "reconnect") payload.reconnect_account = link.reconnect_account;
  else {
    const provs = (link.providers ?? []).filter((p) => PROVIDERS.includes(p));
    payload.providers = provs.length ? provs : ["WHATSAPP", "INSTAGRAM", "LINKEDIN"];
    // jeden provider = jedno konto; kilka = klient może podłączyć każdy kanał po kolei tym samym linkiem
    payload.single_use = provs.length === 1;
  }
  const data = await uniFetch("/hosted/accounts/link", { method: "POST", body: JSON.stringify(payload) }, 20_000);
  const url = String(data?.url ?? "");
  if (!url) throw new Error("Unipile nie zwrócił adresu kreatora");
  return url;
}

// ═══════════════════════════════════════════════════════════════════════════
// Meta (Messenger strony firmowej + Instagram Business) — OAuth przez NASZĄ aplikację
// „Infinitiq" (2026-09-15). Unipile nie umie stron Facebooka (tylko skrzynka prywatna),
// więc klient klika „Połącz przez Facebooka", wybiera stronę, a my dostajemy Page Access
// Token, zapisujemy kanał i SAMI subskrybujemy webhook strony. Zero tokenów u klienta.
// Jedna aplikacja Meta na całą platformę: sekrety META_APP_ID / META_APP_SECRET,
// opcjonalnie META_LOGIN_CONFIG_ID (Facebook Login for Business → konfiguracja).
// ═══════════════════════════════════════════════════════════════════════════
const GRAPH = "https://graph.facebook.com/v23.0";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_LOGIN_CONFIG_ID = Deno.env.get("META_LOGIN_CONFIG_ID") ?? "";
// tylko to, co Messenger strony naprawdę potrzebuje — każde dodatkowe uprawnienie to osobny punkt App Review
// (Instagram klienci podłączają przez Unipile, business_management nie jest do niczego potrzebne)
const META_SCOPES = "pages_show_list,pages_messaging,pages_manage_metadata";
const META_STATE_TTL_MS = 15 * 60_000;

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// state = project_id.ts.nonce.podpis — bez tabeli, a nie da się podstawić cudzego projektu
async function metaState(projectId: string) {
  const body = `${projectId}.${Date.now()}.${crypto.randomUUID().slice(0, 8)}`;
  return `${body}.${await hmacHex(META_APP_SECRET, body)}`;
}
async function metaStateProject(state: string): Promise<string | null> {
  const parts = String(state ?? "").split(".");
  if (parts.length !== 4) return null;
  const [pid, ts, nonce, sig] = parts;
  if (Date.now() - Number(ts) > META_STATE_TTL_MS) return null;
  return (await hmacHex(META_APP_SECRET, `${pid}.${ts}.${nonce}`)) === sig ? pid : null;
}
function metaRedirect(origin: string) {
  const o = String(origin ?? "").replace(/\/+$/, "");
  return `${ORIGINS.has(o) ? o : "https://brain.fastlineinfinitiq.pl"}/meta/callback`;
}
async function graph(path: string, params: Record<string, string>, init: RequestInit = {}) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || data.error) {
    const e = (data.error ?? {}) as Record<string, unknown>;
    throw new Error(`Meta ${r.status}: ${String(e.message ?? JSON.stringify(data)).slice(0, 220)}`);
  }
  return data;
}
type MetaPage = { id: string; name: string; access_token: string; ig?: { id: string; username: string } | null; tasks?: string[] };
async function metaPending(projectId: string) {
  const { data } = await db.from("fiq_project_integrations").select("config").eq("project_id", projectId).eq("kind", "meta_oauth").maybeSingle();
  return (data?.config ?? null) as { pages: MetaPage[]; at: string; user_id?: string; user_name?: string } | null;
}
async function metaPagesConnected(projectId: string) {
  const { data } = await db.from("brain_channels").select("id, type, name, enabled, config, created_at").eq("project_id", projectId).in("type", ["facebook", "instagram"]);
  return (data ?? []).filter((c) => (c.config as Record<string, unknown>)?.oauth).map((c) => {
    const cfg = c.config as Record<string, string>;
    return { id: c.id, type: c.type, name: c.name, enabled: c.enabled, page_id: cfg.page_id, ig_id: cfg.ig_id ?? "", ig_username: cfg.ig_username ?? "", connected_at: cfg.connected_at ?? c.created_at };
  });
}

async function connectInfo(link: ConnectLink) {
  const { data: proj } = await db.from("brain_projects").select("name, workspace_id").eq("id", link.project_id).maybeSingle();
  const { data: ws } = proj
    ? await db.from("brain_workspaces").select("name").eq("id", proj.workspace_id).maybeSingle()
    : { data: null };
  const accounts = (Array.isArray(link.accounts) ? link.accounts : []) as Array<Record<string, unknown>>;
  return {
    ok: true, state: linkState(link), kind: link.kind,
    providers: (link.providers ?? []).map((p) => ({ key: p, label: PROVIDER_LABEL[p] ?? p })),
    project: String(proj?.name ?? ""), workspace: String(ws?.name ?? ""),
    account_name: link.account_name ?? "",
    accounts: accounts.map((a) => ({ provider: a.provider, label: PROVIDER_LABEL[String(a.provider)] ?? a.provider, name: a.name, at: a.at })),
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ error: "method" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return J({ error: "bad json" }, 400);
  }
  const action = String(body.action || "");

  try {
    // ── cron: codzienne odświeżanie stron WWW w bazie wiedzy (pg_cron co godzinę bierze zaległe) ──
    if (action === "kb.refreshDue") {
      if (!KB_CRON_KEY || req.headers.get("x-kb-key") !== KB_CRON_KEY) return J({ error: "forbidden" }, 403);
      // 2026-09-25: próg „starsze niż 20 h" przepuszczał strony dodane wczoraj w południe (o 7:00 miały 19 h)
      // — i czekały kolejną dobę. Teraz: strona WWW = sprawdzona raz w każdym dniu kalendarzowym (od 5:00
      // czasu polskiego), źródło JSON (kalendarz terminów) = co godzinę. Cron chodzi co godzinę.
      const midnight = warsawMidnightIso();
      const hourAgo = new Date(Date.now() - 50 * 60_000).toISOString();
      const sel = "id, url, content, product_id";
      const [{ data: pages }, { data: feeds }] = await Promise.all([
        warsawHour() >= 5
          ? db.from("brain_kb_items").select(sel).eq("type", "url").neq("url", "").not("content", "like", `${JSON_HEAD}%`)
            .or(`checked_at.is.null,checked_at.lt.${midnight}`).order("checked_at", { ascending: true, nullsFirst: true }).limit(24)
          : Promise.resolve({ data: [] }),
        db.from("brain_kb_items").select(sel).eq("type", "url").neq("url", "").like("content", `${JSON_HEAD}%`)
          .lt("checked_at", hourAgo).limit(24),
      ]);
      const list = [...(feeds ?? []), ...(pages ?? [])] as { id: string; url: string; content: string | null; product_id: string | null }[];
      const out = { checked: 0, changed: 0, failed: 0, descriptions: 0 };
      const touched = new Map<string, string[]>();
      for (let i = 0; i < list.length; i += 4) {
        const batch = list.slice(i, i + 4);
        const res = await Promise.all(batch.map((it) => refreshKbItem(it, true).catch(() => null)));
        res.forEach((r, k) => {
          out.checked++;
          if (!r || !r.ok) out.failed++;
          else if (r.changed) {
            out.changed++;
            const pid = batch[k].product_id;
            if (pid) touched.set(pid, [...(touched.get(pid) ?? []), ...r.added]);
          }
        });
      }
      // strona produktu się zmieniła → opis produktu idzie za nią (po kolei: bramka modelu ma limit równoległych wywołań)
      // + produkty, których opis nigdy nie był zsynchronizowany albo jest starszy od ostatniej zmiany źródła
      //   (w FRA opis Heels od 18.09 podawał stary termin, bo nikt nie nacisnął ↻)
      for (const pid of await staleProductDescriptions()) if (!touched.has(pid)) touched.set(pid, []);
      for (const [pid, added] of [...touched.entries()].slice(0, 6)) {
        const d = await syncProductDescription(pid, true, added).catch(() => null);
        if (d?.changed) out.descriptions++;
      }
      console.log("kb.refreshDue", JSON.stringify(out));
      return J({ ok: true, ...out });
    }

    // ── login (bez sesji) ────────────────────────────────────────────────
    if (action === "login") {
      const login = String(body.login || "").trim();
      const password = String(body.password || "");
      const { data: u } = await db
        .from("brain_users")
        .select("id, login, display_name, role, workspace_id, pass_hash, disabled, avatar")
        .eq("login", login)
        .maybeSingle();
      if (!u || u.disabled || !bcrypt.compareSync(password, u.pass_hash)) {
        return J({ error: "invalid" }, 401);
      }
      const token = newToken();
      const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
      await db.from("brain_sessions").insert({ token, user_id: u.id, expires_at: expires });
      await db.from("brain_users").update({ last_login_at: new Date().toISOString() }).eq("id", u.id);
      return J({
        token,
        user: { id: u.id, login: u.login, display_name: u.display_name, role: u.role, workspace_id: u.workspace_id, avatar: u.avatar },
      });
    }

    // ── strona /connect?t=… (publiczna: klient nie ma konta w panelu, autoryzuje token) ──
    if (action === "connect.info" || action === "connect.start") {
      const t = String(body.t ?? "");
      const { data } = t ? await db.from("fiq_connect_links").select("*").eq("token", t).maybeSingle() : { data: null };
      const link = (data ?? null) as ConnectLink | null;
      const state = linkState(link);
      if (!link || state === "revoked" || state === "expired") return J({ ok: false, state: link ? state : "none" });
      const info = await connectInfo(link);
      if (action === "connect.info") return J(info);
      if (link.kind === "reconnect" && state === "connected") return J({ ...info, already: true });
      if ((link.opens ?? 0) >= LINK_MAX_OPENS) return J({ ok: false, state: "revoked" });
      try {
        // zanim klient podłączy konto, webhooki muszą istnieć — inaczej pierwsze wiadomości przepadną
        await ensureUnipileWebhooks().catch((e) => console.error("ensureUnipileWebhooks", String(e).slice(0, 200)));
        const url = await hostedAuthUrl(link);
        await db.from("fiq_connect_links").update({
          opens: (link.opens ?? 0) + 1, last_open_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("token", t);
        return J({ ...info, url });
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        console.error("hosted auth:", msg.slice(0, 200));
        return J({ ok: false, state, error: msg.slice(0, 200) });
      }
    }

    const user = await getUser(body.token as string | undefined);
    if (!user) return J({ error: "auth" }, 401);
    const admin = user.role === "admin";

    switch (action) {
      // ── kanały klienta (Unipile) — wspólne dla produktów ─────────────────
      case "accounts.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        return J({ accounts: await projectAccounts(pid) });
      }
      case "connect.get": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const link = await currentLink(pid);
        return J({
          state: linkState(link),
          kind: link?.kind ?? "create",
          url: link ? connectUrl(link) : "",
          providers: link?.providers ?? [],
          expires_at: link?.expires_at ?? null,
          opens: link?.opens ?? 0,
          connected_at: link?.connected_at ?? null,
          account_name: link?.account_name ?? "",
          link_accounts: Array.isArray(link?.accounts) ? link!.accounts : [],
          accounts: await projectAccounts(pid),
        });
      }
      case "connect.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        if (!admin) return J({ error: "forbidden" }, 403);
        const kind = String(body.kind ?? "create") === "reconnect" ? "reconnect" : "create";
        const originRaw = String(body.origin ?? "").replace(/\/+$/, "");
        const origin = ORIGINS.has(originRaw) ? originRaw : "https://brain.fastlineinfinitiq.pl";
        let reconnect: string | null = null;
        let providers = (Array.isArray(body.providers) ? body.providers : []).map((p) => String(p).toUpperCase()).filter((p) => PROVIDERS.includes(p));
        if (kind === "reconnect") {
          reconnect = String(body.account_id ?? "") || null;
          if (!reconnect) return J({ error: "Podaj konto do ponownego podłączenia" }, 400);
          const { data: acc } = await db.from("fiq_project_accounts").select("provider").eq("project_id", pid).eq("account_id", reconnect).maybeSingle();
          if (!acc) return J({ error: "To konto nie należy do projektu" }, 400);
          providers = [String(acc.provider)];
        }
        if (!providers.length) return J({ error: "Wybierz przynajmniej jeden kanał" }, 400);
        // stary, niewykorzystany link przestaje działać w chwili wydania nowego
        await db.from("fiq_connect_links")
          .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("project_id", pid).is("revoked_at", null).is("connected_at", null);
        const token = newToken();
        const { error } = await db.from("fiq_connect_links").insert({
          token, project_id: pid, kind, reconnect_account: reconnect, providers, origin, created_by: user.id,
          expires_at: new Date(Date.now() + LINK_TTL_DAYS * 86400_000).toISOString(),
        });
        if (error) return J({ error: `Nie udało się zapisać linku: ${error.message}` }, 500);
        return J({ ok: true, url: `${origin}/connect?t=${token}`, state: "waiting", kind, providers });
      }
      case "connect.revoke": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        if (!admin) return J({ error: "forbidden" }, 403);
        await db.from("fiq_connect_links")
          .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("project_id", pid).is("revoked_at", null);
        return J({ ok: true, state: "none" });
      }
      // Odłączenie: kasujemy konto u Unipile (sesja klienta ginie) i u nas.
      case "accounts.disconnect": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const id = String(body.id ?? "");
        const { data: acc } = await db.from("fiq_project_accounts").select("*").eq("id", id).maybeSingle();
        if (!acc) return J({ error: "not found" }, 404);
        await assertProject(user, acc.project_id);
        try {
          await uniFetch(`/accounts/${encodeURIComponent(acc.account_id)}`, { method: "DELETE" }, 20_000);
        } catch (e) {
          const msg = String((e as Error).message ?? e);
          if (!/404|not found/i.test(msg)) return J({ error: `Unipile nie odłączył konta: ${msg.slice(0, 160)}` }, 400);
        }
        await db.from("brain_channels").delete().eq("project_id", acc.project_id).eq("type", "unipile").contains("config", { account_id: acc.account_id });
        if (acc.provider === "LINKEDIN") {
          const { data: hc } = await db.from("hand_config").select("config").eq("project_id", acc.project_id).maybeSingle();
          const cfg = (hc?.config ?? {}) as Record<string, unknown>;
          if (String(cfg.unipile_account_id ?? "") === acc.account_id) {
            await db.from("hand_config").upsert({ project_id: acc.project_id, config: { ...cfg, unipile_account_id: "" }, updated_at: new Date().toISOString() });
          }
        }
        await db.from("fiq_project_accounts").delete().eq("id", id);
        await db.from("brain_settings").delete().eq("key", "unipile_status");
        return J({ ok: true });
      }
      // ── Meta: Messenger strony + Instagram Business przez OAuth naszej aplikacji ──
      case "meta.status": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const pending = await metaPending(pid);
        return J({
          configured: !!(META_APP_ID && META_APP_SECRET),
          app_id: META_APP_ID,
          pages: await metaPagesConnected(pid),
          pending: pending ? pending.pages.map((p) => ({ id: p.id, name: p.name, ig: p.ig ?? null })) : [],
        });
      }
      case "meta.oauth.url": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        if (!META_APP_ID || !META_APP_SECRET) return J({ error: "Aplikacja Meta nie jest skonfigurowana (META_APP_ID / META_APP_SECRET)" }, 400);
        const redirect = metaRedirect(String(body.origin ?? ""));
        const u = new URL("https://www.facebook.com/v23.0/dialog/oauth");
        u.searchParams.set("client_id", META_APP_ID);
        u.searchParams.set("redirect_uri", redirect);
        u.searchParams.set("state", await metaState(pid));
        u.searchParams.set("response_type", "code");
        // Facebook Login for Business: zestaw uprawnień i zasobów siedzi w konfiguracji aplikacji
        if (META_LOGIN_CONFIG_ID) {
          u.searchParams.set("config_id", META_LOGIN_CONFIG_ID);
          u.searchParams.set("override_default_response_type", "true");
        } else u.searchParams.set("scope", META_SCOPES);
        return J({ url: u.toString(), redirect_uri: redirect });
      }
      // kod z powrotu → token użytkownika (długi) → lista stron z tokenami → do wyboru w panelu
      case "meta.oauth.exchange": {
        const pid = await metaStateProject(String(body.state ?? ""));
        if (!pid) return J({ error: "Nieprawidłowy albo przeterminowany stan logowania — spróbuj ponownie" }, 400);
        await assertProject(user, pid);
        const code = String(body.code ?? "");
        if (!code) return J({ error: "Brak kodu z Facebooka" }, 400);
        const redirect = metaRedirect(String(body.origin ?? ""));
        try {
          const tok = await graph("/oauth/access_token", { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: redirect, code });
          const longTok = await graph("/oauth/access_token", {
            grant_type: "fb_exchange_token", client_id: META_APP_ID, client_secret: META_APP_SECRET, fb_exchange_token: String(tok.access_token ?? ""),
          }).catch(() => tok);
          const userToken = String(longTok.access_token ?? tok.access_token ?? "");
          const me = await graph("/me", { fields: "id,name", access_token: userToken });
          const acc = await graph("/me/accounts", {
            fields: "id,name,access_token,tasks", limit: "100", access_token: userToken,
          });
          const pages: MetaPage[] = ((acc.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
            id: String(p.id), name: String(p.name ?? ""), access_token: String(p.access_token ?? ""), tasks: (p.tasks as string[]) ?? [],
            // instagram_business_account wymagałby uprawnień IG — Instagram podłączamy przez Unipile
            ig: null,
          }));
          // tokeny stron zostają po stronie serwera; panel dostaje tylko nazwy
          await db.from("fiq_project_integrations").upsert({
            project_id: pid, kind: "meta_oauth", updated_at: new Date().toISOString(),
            config: { pages, at: new Date().toISOString(), user_id: String(me.id ?? ""), user_name: String(me.name ?? "") },
          });
          return J({ ok: true, project_id: pid, user: String(me.name ?? ""), pages: pages.map((p) => ({ id: p.id, name: p.name, ig: p.ig ?? null, can: (p.tasks ?? []).includes("MODERATE") || (p.tasks ?? []).includes("MANAGE") })) });
        } catch (e) {
          const msg = String((e as Error).message ?? e);
          console.error("meta exchange", msg.slice(0, 300));
          return J({ error: msg.slice(0, 240) }, 400);
        }
      }
      // wybrana strona → kanał facebook (+ instagram, jeśli strona ma konto IG) + subskrypcja webhooka
      case "meta.connect": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const pending = await metaPending(pid);
        const page = pending?.pages.find((p) => p.id === String(body.page_id ?? ""));
        if (!page) return J({ error: "Najpierw zaloguj się przez Facebooka i wybierz stronę" }, 400);
        const withIg = body.with_instagram !== false && !!page.ig;
        try {
          await graph(`/${page.id}/subscribed_apps`, { subscribed_fields: "messages,messaging_postbacks", access_token: page.access_token }, { method: "POST" });
        } catch (e) {
          return J({ error: `Nie udało się zasubskrybować webhooka strony: ${String((e as Error).message ?? e).slice(0, 200)}` }, 400);
        }
        const now = new Date().toISOString();
        const base = { page_id: page.id, page_token: page.access_token, page_name: page.name, oauth: true, connected_at: now, connected_by: pending?.user_name ?? "" };
        const upsertChannel = async (type: string, name: string, cfg: Record<string, unknown>, matchField: string, matchVal: string) => {
          const { data: ex } = await db.from("brain_channels").select("id, config").eq("project_id", pid).eq("type", type).contains("config", { [matchField]: matchVal }).limit(1);
          if (ex?.length) {
            await db.from("brain_channels").update({ name, enabled: true, config: { ...(ex[0].config as Record<string, unknown>), ...cfg } }).eq("id", ex[0].id);
            return ex[0].id as string;
          }
          const { data: ins, error } = await db.from("brain_channels").insert({ project_id: pid, type, name, enabled: true, config: cfg }).select("id").single();
          if (error) throw error;
          return ins.id as string;
        };
        const fbId = await upsertChannel("facebook", `Messenger · ${page.name}`, base, "page_id", page.id);
        let igId: string | null = null;
        if (withIg && page.ig) {
          igId = await upsertChannel("instagram", `Instagram · @${page.ig.username || page.ig.id}`, { ...base, ig_id: page.ig.id, ig_username: page.ig.username }, "ig_id", page.ig.id);
        }
        // strona wybrana — reszta listy nie jest już potrzebna (tokeny nie leżą dłużej niż trzeba)
        await db.from("fiq_project_integrations").delete().eq("project_id", pid).eq("kind", "meta_oauth");
        return J({ ok: true, facebook: fbId, instagram: igId, pages: await metaPagesConnected(pid) });
      }
      case "meta.disconnect": {
        const id = String(body.id ?? "");
        const { data: ch } = await db.from("brain_channels").select("id, project_id, type, config").eq("id", id).maybeSingle();
        if (!ch) return J({ error: "not found" }, 404);
        await assertProject(user, ch.project_id);
        const cfg = (ch.config ?? {}) as Record<string, string>;
        // odsubskrybowujemy stronę tylko, gdy to ostatni nasz kanał tej strony (IG i Messenger dzielą page_id)
        const { data: siblings } = await db.from("brain_channels").select("id").eq("project_id", ch.project_id).contains("config", { page_id: cfg.page_id ?? "" }).neq("id", id);
        if (!siblings?.length && cfg.page_id && cfg.page_token) {
          await graph(`/${cfg.page_id}/subscribed_apps`, { access_token: cfg.page_token }, { method: "DELETE" }).catch((e) => console.error("meta unsubscribe", String(e).slice(0, 160)));
        }
        await db.from("brain_channels").delete().eq("id", id);
        return J({ ok: true, pages: await metaPagesConnected(ch.project_id) });
      }
      case "meta.pending.clear": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        await db.from("fiq_project_integrations").delete().eq("project_id", pid).eq("kind", "meta_oauth");
        return J({ ok: true });
      }

      // Rejestracja webhooków Unipile (idempotentna) + ich lista — do sprawdzenia w panelu admina.
      case "unipile.webhooks": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const ensured = body.ensure === false ? null : await ensureUnipileWebhooks();
        const list = await uniFetch("/webhooks", {}, 15_000);
        const items = ((list?.items ?? []) as Array<Record<string, unknown>>).map((w) => ({
          id: w.id ?? w.webhook_id, source: w.source, url: String(w.request_url ?? "").replace(/key=[^&]+/, "key=•••"), enabled: w.enabled, name: w.name,
        }));
        return J({ ensured, webhooks: items });
      }

      case "me":
        return J({ user });
      case "logout": {
        await db.from("brain_sessions").delete().eq("token", body.token as string);
        return J({ ok: true });
      }

      // ── workspaces ────────────────────────────────────────────────────
      case "ws.list": {
        let q = db.from("brain_workspaces").select("id, name, created_at").order("created_at");
        if (!admin) q = q.eq("id", user.workspace_id ?? "00000000-0000-0000-0000-000000000000");
        const { data } = await q;
        return J({ workspaces: data ?? [] });
      }
      case "ws.create": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data, error } = await db
          .from("brain_workspaces")
          .insert({ name: String(body.name || "").trim() })
          .select()
          .single();
        if (error) throw error;
        return J({ workspace: data });
      }
      case "ws.rename": {
        if (!admin) return J({ error: "forbidden" }, 403);
        await db.from("brain_workspaces").update({ name: String(body.name || "").trim() }).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "ws.delete": {
        if (!admin) return J({ error: "forbidden" }, 403);
        await db.from("brain_workspaces").delete().eq("id", body.id as string);
        return J({ ok: true });
      }

      // ── projects ──────────────────────────────────────────────────────
      case "proj.list": {
        const ws = String(body.workspace_id || "");
        if (!wsAllowed(user, ws)) return J({ error: "forbidden" }, 403);
        const { data } = await db
          .from("brain_projects")
          .select("id, name, created_at")
          .eq("workspace_id", ws)
          .order("created_at");
        // typ jawny: dokładamy `product_keys`, a wnioskowanie z selecta by na to nie pozwoliło
        type ProjRow = { id: string; name: string; created_at: string; product_keys?: string[] };
        let projects = (data ?? []) as ProjRow[];
        // klient może być zawężony do wybranych projektów (brain_user_projects);
        // brak wierszy = pełny dostęp do workspace'u, jak dotąd
        if (!admin) {
          const { data: allow } = await db.from("brain_user_projects").select("project_id").eq("user_id", user.id);
          const ids = new Set((allow ?? []).map((r: { project_id: string }) => r.project_id));
          if (ids.size) projects = projects.filter((p) => ids.has(p.id));
        }

        // Przypisanie projektu do produktów: w jednym workspace bywa projekt pod
        // doradcę i osobny pod sprzedawcę. Projekt BEZ wierszy należy do wszystkich
        // produktów — inaczej dotychczasowe projekty zniknęłyby po tej zmianie.
        const projIds = projects.map((p) => p.id);
        const links: Record<string, string[]> = {};
        if (projIds.length) {
          const { data: pp } = await db
            .from("fiq_project_products").select("project_id, product_key").in("project_id", projIds);
          for (const r of pp ?? []) {
            const row = r as { project_id: string; product_key: string };
            (links[row.project_id] ??= []).push(row.product_key);
          }
        }
        projects = projects.map((p) => ({ ...p, product_keys: links[p.id] ?? [] }));

        // Panel prosi o projekty konkretnego produktu (wybór w Pickerze).
        const wantKey = String(body.product_key || "");
        if (wantKey) {
          projects = projects.filter((p) =>
            !p.product_keys?.length || p.product_keys.includes(wantKey));
        }
        return J({ projects });
      }
      case "proj.create": {
        const ws = String(body.workspace_id || "");
        if (!wsAllowed(user, ws)) return J({ error: "forbidden" }, 403);
        const { data, error } = await db
          .from("brain_projects")
          .insert({ workspace_id: ws, name: String(body.name || "").trim() })
          .select()
          .single();
        if (error) throw error;
        // domyślny kanał widget + pusty advisor
        await db.from("brain_channels").insert({
          project_id: data.id,
          type: "widget",
          name: "Widget WWW",
          config: { color: "#B8FF00", position: "left" },
        });
        await db.from("brain_advisor").insert({ project_id: data.id });
        return J({ project: data });
      }
      case "proj.rename": {
        await assertProject(user, body.id as string);
        await db.from("brain_projects").update({ name: String(body.name || "").trim() }).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "proj.delete": {
        await assertProject(user, body.id as string);
        await db.from("brain_projects").delete().eq("id", body.id as string);
        return J({ ok: true });
      }

      // ── koszty modelu per projekt (admin) ──────────────────────────────
      // Liczone dokładnie jak rozlicza DeepSeek: cache hit / cache miss / wyjście, szczyt po czasie
      // żądania (UTC). Suma za okres dla modeli deepseek-* = kwota z panelu DeepSeeka dla tego klucza.
      case "usage.report": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
        const since = body.days === "today"
          ? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString()
          : new Date(Date.now() - days * 864e5).toISOString();
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 5000) {
          const { data } = await db
            .from("fiq_ai_usage")
            .select("project_id, product_key, model, action, prompt_tokens, completion_tokens, cache_hit_tokens, cache_miss_tokens, cost_usd, created_at")
            .gte("created_at", since).order("created_at").range(from, from + 4999);
          rows.push(...(data ?? []));
          if (!data || data.length < 5000) break;
        }
        const { data: projs } = await db.from("brain_projects").select("id, name, workspace_id");
        const { data: wss } = await db.from("brain_workspaces").select("id, name");
        const wsName = new Map((wss ?? []).map((w) => [w.id, w.name]));
        const projName = new Map((projs ?? []).map((p) => [p.id, { name: p.name, ws: wsName.get(p.workspace_id) ?? "" }]));
        type Agg = { project_id: string | null; project: string; workspace: string; product_key: string; model: string; calls: number; prompt: number; hit: number; miss: number; completion: number; cost: number };
        const agg = new Map<string, Agg>();
        const daily = new Map<string, number>();
        for (const r of rows) {
          const k = `${r.project_id}|${r.product_key}|${r.model}`;
          const pi = projName.get(String(r.project_id)) ?? { name: r.project_id ? "(usunięty projekt)" : "(bez projektu)", ws: "" };
          const a = agg.get(k) ?? { project_id: (r.project_id as string) ?? null, project: pi.name, workspace: pi.ws, product_key: String(r.product_key), model: String(r.model), calls: 0, prompt: 0, hit: 0, miss: 0, completion: 0, cost: 0 };
          a.calls++; a.prompt += Number(r.prompt_tokens ?? 0); a.hit += Number(r.cache_hit_tokens ?? 0); a.miss += Number(r.cache_miss_tokens ?? 0);
          a.completion += Number(r.completion_tokens ?? 0); a.cost += Number(r.cost_usd ?? 0);
          agg.set(k, a);
          const d = String(r.created_at).slice(0, 10);
          daily.set(d, (daily.get(d) ?? 0) + Number(r.cost_usd ?? 0));
        }
        const list = [...agg.values()].map((a) => ({ ...a, cost: +a.cost.toFixed(6) })).sort((x, y) => y.cost - x.cost);
        const total = +list.reduce((s, a) => s + a.cost, 0).toFixed(6);
        const deepseek = +list.filter((a) => /deepseek/i.test(a.model)).reduce((s, a) => s + a.cost, 0).toFixed(6);
        return J({ since, rows: list, total, deepseek, daily: [...daily.entries()].sort().map(([d, c]) => ({ d, cost: +c.toFixed(6) })) });
      }
      // Saldo konta DeepSeek — to samo, co właściciel widzi w ich panelu (klucz tylko z sekretu, nie wraca do panelu)
      case "usage.balance": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("brain_settings").select("value").eq("key", "ai_provider").maybeSingle();
        const ai = (data?.value ?? {}) as Record<string, string>;
        const key = String(ai.api_key || "").trim() || Deno.env.get(String(ai.key_secret || "BRAIN_AI_KEY").trim()) || "";
        if (!/deepseek/i.test(String(ai.base_url || "")) || !key) return J({ ok: false, reason: "Dostawca to nie DeepSeek albo brak klucza" });
        try {
          const r = await fetch("https://api.deepseek.com/user/balance", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return J({ ok: false, reason: `DeepSeek ${r.status}` });
          const b = (j?.balance_infos ?? [])[0] ?? {};
          return J({ ok: true, available: !!j?.is_available, currency: b.currency ?? "USD", total: Number(b.total_balance ?? 0), topped_up: Number(b.topped_up_balance ?? 0), granted: Number(b.granted_balance ?? 0), model: ai.model ?? "" });
        } catch (e) {
          return J({ ok: false, reason: String((e as Error).message ?? e).slice(0, 120) });
        }
      }

      // ── users (admin only) ────────────────────────────────────────────
      case "users.list": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db
          .from("brain_users")
          .select("id, login, display_name, role, workspace_id, disabled, created_at, last_login_at, avatar")
          .order("created_at");
        return J({ users: data ?? [] });
      }
      case "users.create": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const pass = String(body.password || "");
        if (pass.length < 6) return J({ error: "short password" }, 400);
        const { data, error } = await db
          .from("brain_users")
          .insert({
            login: String(body.login || "").trim(),
            pass_hash: bcrypt.hashSync(pass, 10),
            display_name: String(body.display_name || "").trim() || null,
            role: body.role === "admin" ? "admin" : "client",
            workspace_id: (body.workspace_id as string) || null,
          })
          .select("id, login, display_name, role, workspace_id, disabled, avatar")
          .single();
        if (error) throw error;
        return J({ user: data });
      }
      case "users.update": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const patch: Record<string, unknown> = {};
        if (body.password) patch.pass_hash = bcrypt.hashSync(String(body.password), 10);
        if (body.display_name !== undefined) patch.display_name = String(body.display_name).trim() || null;
        if (body.workspace_id !== undefined) patch.workspace_id = body.workspace_id || null;
        if (body.disabled !== undefined) patch.disabled = !!body.disabled;
        await db.from("brain_users").update(patch).eq("id", body.id as string);
        if (body.disabled) await db.from("brain_sessions").delete().eq("user_id", body.id as string);
        return J({ ok: true });
      }
      case "users.delete": {
        if (!admin) return J({ error: "forbidden" }, 403);
        if (body.id === user.id) return J({ error: "self" }, 400);
        await db.from("brain_users").delete().eq("id", body.id as string);
        return J({ ok: true });
      }
      case "users.password": {
        // zmiana własnego hasła
        const old = String(body.old_password || "");
        const nw = String(body.new_password || "");
        if (nw.length < 6) return J({ error: "short password" }, 400);
        const { data: u } = await db.from("brain_users").select("pass_hash").eq("id", user.id).single();
        if (!bcrypt.compareSync(old, u!.pass_hash)) return J({ error: "invalid" }, 401);
        await db.from("brain_users").update({ pass_hash: bcrypt.hashSync(nw, 10) }).eq("id", user.id);
        return J({ ok: true });
      }

      // ── knowledge base ────────────────────────────────────────────────
      case "kb.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const [{ data: products }, { data: items }] = await Promise.all([
          db.from("brain_products").select("*").eq("project_id", pid).order("sort").order("created_at"),
          db
            .from("brain_kb_items")
            .select("id, product_id, type, title, content, url, file_path, chars, sort, created_at, updated_at, checked_at, changed_at, last_change, fetch_error")
            .eq("project_id", pid)
            .order("sort")
            .order("created_at"),
        ]);
        return J({ products: products ?? [], items: items ?? [] });
      }
      case "product.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data, error } = await db
          .from("brain_products")
          .insert({
            project_id: pid,
            name: String(body.name || "").trim(),
            description: String(body.description || ""),
            manual_notes: String(body.manual_notes || "").slice(0, 4000),
            offer_mode: offerMode(body.offer_mode),
            buy_url: String(body.buy_url || ""),
            sales_name: String(body.sales_name || ""),
            sales_phone: String(body.sales_phone || ""),
            price: parsePrice(body.price),
            price_mode: body.price_mode === "brutto" ? "brutto" : "netto",
            price_currency: String(body.price_currency || "PLN").toUpperCase().slice(0, 8),
          })
          .select()
          .single();
        if (error) throw error;
        return J({ product: data });
      }
      case "product.update": {
        const { data: p } = await db.from("brain_products").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!p) return J({ error: "not found" }, 404);
        await assertProject(user, p.project_id);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["name", "buy_url", "sales_name", "sales_phone", "sort"]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (body.manual_notes !== undefined) patch.manual_notes = String(body.manual_notes || "").slice(0, 4000);
        if (body.offer_mode !== undefined) patch.offer_mode = offerMode(body.offer_mode);
        // opis jest zablokowany, gdy produkt ma źródła (powstaje z nich automatycznie) — ręcznie tylko bez źródeł
        if (body.description !== undefined) {
          const { count } = await db.from("brain_kb_items").select("id", { count: "exact", head: true }).eq("product_id", body.id as string);
          if (!count) patch.description = body.description;
        }
        if (body.price !== undefined) patch.price = parsePrice(body.price);
        if (body.price_mode !== undefined) patch.price_mode = body.price_mode === "brutto" ? "brutto" : "netto";
        if (body.price_currency !== undefined) {
          patch.price_currency = String(body.price_currency || "PLN").toUpperCase().slice(0, 8);
        }
        await db.from("brain_products").update(patch).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "product.delete": {
        const { data: p } = await db.from("brain_products").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!p) return J({ error: "not found" }, 404);
        await assertProject(user, p.project_id);
        await db.from("brain_products").delete().eq("id", body.id as string);
        return J({ ok: true });
      }
      case "kb.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const type = String(body.type || "text");
        const row: Record<string, unknown> = {
          project_id: pid,
          product_id: (body.product_id as string) || null,
          type,
          title: String(body.title || "").trim(),
        };
        if (type === "text") {
          row.content = String(body.content || "");
        } else if (type === "url") {
          const url = String(body.url || "").trim();
          row.url = url;
          const f = await fetchUrlChecked(url); // treść strony = wiedza
          if (!f.ok || f.text.length < 80) return J({ error: `Nie udało się pobrać strony: ${f.error ?? "prawie brak tekstu (strona budowana skryptem albo blokuje boty)"}` }, 400);
          row.content = f.text;
          row.checked_at = new Date().toISOString();
          if (!row.title) row.title = url.replace(/^https?:\/\//, "").slice(0, 80);
        } else if (type === "file") {
          const name = String(body.file_name || "plik.txt");
          const b64 = String(body.file_base64 || "");
          if (b64.length > 7_000_000) return J({ error: "file too big" }, 400);
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const path = `${pid}/${Date.now()}-${name.replace(/[^\w.\-]+/g, "_")}`;
          const { error: se } = await db.storage.from("brain-kb").upload(path, bytes, {
            contentType: String(body.file_type || "application/octet-stream"),
          });
          if (se) throw se;
          row.file_path = path;
          if (!row.title) row.title = name;
          // tekstowe pliki wchodzą do wiedzy wprost
          if (/\.(txt|md|csv|json|html?)$/i.test(name)) {
            let text = new TextDecoder().decode(bytes);
            if (/\.html?$/i.test(name)) text = stripHtml(text);
            row.content = text.slice(0, 20000);
          }
        }
        row.chars = String(row.content || "").length;
        const { data, error } = await db.from("brain_kb_items").insert(row).select().single();
        if (error) throw error;
        // nowe źródło produktu (strona, plik, notatka) → opis produktu składa się od nowa
        const description = row.product_id ? await syncProductDescription(String(row.product_id), false).catch(() => null) : null;
        return J({ item: data, description });
      }
      case "kb.update": {
        const { data: it } = await db.from("brain_kb_items").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!it) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["title", "content", "sort", "product_id"]) if (body[k] !== undefined) patch[k] = body[k];
        if (patch.content !== undefined) patch.chars = String(patch.content).length;
        const { data: upd } = await db.from("brain_kb_items").update(patch).eq("id", body.id as string).select("product_id").maybeSingle();
        const description = patch.content !== undefined && upd?.product_id ? await syncProductDescription(upd.product_id, false).catch(() => null) : null;
        return J({ ok: true, description });
      }
      case "kb.refresh": {
        // ponowne pobranie treści z URL
        const { data: it } = await db.from("brain_kb_items").select("id, project_id, product_id, url, content").eq("id", body.id as string).maybeSingle();
        if (!it || !it.url) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        const res = await refreshKbItem(it as { id: string; url: string; content: string | null }, false);
        // wpis należy do produktu → jego opis ma iść za stroną (także przy pierwszym sprawdzeniu, gdy opis był jeszcze „ręczny")
        let description: DescSync | null = null;
        if (it.product_id && res.ok) {
          const { data: pr } = await db.from("brain_products").select("desc_synced_at").eq("id", it.product_id).maybeSingle();
          if (res.changed || !pr?.desc_synced_at) description = await syncProductDescription(it.product_id, false, res.added);
        }
        return J({ ...res, chars: res.chars_after, url: it.url, description });
      }
      case "product.sync": {
        // przycisk ↻ na karcie produktu: sprawdza wszystkie strony produktu i składa opis od nowa
        const { data: p } = await db.from("brain_products").select("id, project_id").eq("id", body.id as string).maybeSingle();
        if (!p) return J({ error: "not found" }, 404);
        await assertProject(user, p.project_id);
        const { data: urls } = await db.from("brain_kb_items").select("id, url, content").eq("product_id", p.id).eq("type", "url").neq("url", "").limit(6);
        const pages: Record<string, unknown>[] = [];
        const addedAll: string[] = [];
        for (const u of (urls ?? []) as { id: string; url: string; content: string | null }[]) {
          const r = await refreshKbItem(u, false);
          if (r.ok && r.changed) addedAll.push(...r.added);
          pages.push({ url: u.url, ...r });
        }
        const description = await syncProductDescription(p.id, false, addedAll);
        return J({ ok: true, pages, description });
      }
      case "kb.delete": {
        const { data: it } = await db
          .from("brain_kb_items")
          .select("project_id, product_id, file_path")
          .eq("id", body.id as string)
          .maybeSingle();
        if (!it) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        if (it.file_path) await db.storage.from("brain-kb").remove([it.file_path]);
        await db.from("brain_kb_items").delete().eq("id", body.id as string);
        // źródło produktu zniknęło → opis nie może dalej powtarzać tego, co z niego pochodziło
        const description = it.product_id ? await syncProductDescription(it.product_id, false).catch(() => null) : null;
        return J({ ok: true, description });
      }
      case "kb.fileUrl": {
        const { data: it } = await db
          .from("brain_kb_items")
          .select("project_id, file_path")
          .eq("id", body.id as string)
          .maybeSingle();
        if (!it?.file_path) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        const { data } = await db.storage.from("brain-kb").createSignedUrl(it.file_path, 3600);
        return J({ url: data?.signedUrl });
      }

      // ── sprzedawca (AI sales) ─────────────────────────────────────────
      // Sekrety kanałów nie wracają do przeglądarki w jawnej postaci: panel cache'uje
      // odpowiedzi w localStorage, a pole input pokazuje wartość w DevTools.
      // Zamiast wartości wysyłamy maskę; przy zapisie maska = „zostaw jak było".
      case "sales.get": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data } = await db.from("brain_sales").select("config, updated_at").eq("project_id", pid).maybeSingle();
        let config = (data?.config ?? {}) as Record<string, unknown>;
        if (!config.hook_key || !config.demo_key) {
          // hook_key = sekret webhooków/akcji, demo_key = publiczny link testowego czatu
          config = { ...config, hook_key: config.hook_key ?? newToken(), demo_key: config.demo_key ?? newToken() };
          await db.from("brain_sales").upsert({ project_id: pid, config, updated_at: new Date().toISOString() });
        }
        return J({ config: maskSecrets(config, SALES_SECRET_PATHS) });
      }
      case "sales.set": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const incoming = (body.config ?? {}) as Record<string, unknown>;
        const { data: cur } = await db.from("brain_sales").select("config").eq("project_id", pid).maybeSingle();
        const prev = (cur?.config ?? {}) as Record<string, unknown>;
        const hook_key = prev.hook_key ?? newToken();
        const demo_key = prev.demo_key ?? newToken();
        const merged = restoreSecrets(incoming, prev, SALES_SECRET_PATHS);
        await db
          .from("brain_sales")
          .upsert({ project_id: pid, config: { ...merged, hook_key, demo_key, _last_tick: prev._last_tick }, updated_at: new Date().toISOString() });
        return J({ ok: true });
      }
      case "sales.rotateDemo": {
        // nowy publiczny link testowego czatu — stary natychmiast przestaje działać
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data: cur } = await db.from("brain_sales").select("config").eq("project_id", pid).maybeSingle();
        const config = { ...((cur?.config ?? {}) as Record<string, unknown>), demo_key: newToken() };
        await db.from("brain_sales").upsert({ project_id: pid, config, updated_at: new Date().toISOString() });
        return J({ demo_key: config.demo_key });
      }
      case "leads.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        let q = db
          .from("brain_leads")
          .select("*")
          .eq("project_id", pid)
          .order("updated_at", { ascending: false })
          .limit(Math.min(Number(body.limit) || 500, 1000));
        if (body.status) q = q.eq("status", String(body.status));
        const { data } = await q;
        return J({ leads: data ?? [] });
      }
      case "leads.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const row = leadRow(body);
        if (!row.email && !row.phone) return J({ error: "lead musi mieć e-mail albo telefon" }, 400);
        const { data, error } = await db.from("brain_leads").insert({ project_id: pid, ...row }).select().single();
        if (error) return J({ error: error.message.includes("duplicate") ? "taki lead już istnieje" : error.message }, 400);
        return J({ lead: data });
      }
      case "leads.import": {
        // bulk: [{name,email,phone,company,temp,notes}] — duplikaty (e-mail/telefon) pomijane
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 2000).map(leadRow).filter((r) => r.email || r.phone);
        // PostgREST domyślnie oddaje maks. 1000 wierszy — przy większej bazie dedup po cichu przestawał działać
        const { data: existing } = await db.from("brain_leads").select("email, phone").eq("project_id", pid).range(0, 99_999);
        const seenE = new Set((existing ?? []).map((l) => l.email.toLowerCase()).filter(Boolean));
        const seenP = new Set((existing ?? []).map((l) => l.phone.replace(/[^\d]/g, "")).filter(Boolean));
        const fresh: typeof rows = [];
        let skipped = 0;
        for (const r of rows) {
          const e = r.email.toLowerCase();
          const p = r.phone.replace(/[^\d]/g, "");
          if ((e && seenE.has(e)) || (p && seenP.has(p))) {
            skipped++;
            continue;
          }
          if (e) seenE.add(e);
          if (p) seenP.add(p);
          fresh.push(r);
        }
        if (fresh.length) {
          const { error } = await db.from("brain_leads").insert(fresh.map((r) => ({ project_id: pid, ...r })));
          if (error) throw error;
        }
        return J({ added: fresh.length, skipped });
      }
      case "leads.update": {
        const { data: l } = await db.from("brain_leads").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!l) return J({ error: "not found" }, 404);
        await assertProject(user, l.project_id);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["name", "email", "phone", "company", "temp", "status", "channel", "notes", "unread"]) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        // ręczne zamknięcie/wstrzymanie kasuje zaplanowany follow-up
        if (["won", "lost", "opt_out", "paused", "handoff"].includes(String(patch.status ?? ""))) patch.next_at = null;
        if (patch.status === "new") {
          patch.attempts = 0;
          patch.next_at = null;
        }
        await db.from("brain_leads").update(patch).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "leads.delete": {
        const { data: l } = await db.from("brain_leads").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!l) return J({ error: "not found" }, 404);
        await assertProject(user, l.project_id);
        await db.from("brain_leads").delete().eq("id", body.id as string);
        return J({ ok: true });
      }
      case "lead.messages": {
        const { data: l } = await db.from("brain_leads").select("project_id").eq("id", body.lead_id as string).maybeSingle();
        if (!l) return J({ error: "not found" }, 404);
        await assertProject(user, l.project_id);
        const { data } = await db
          .from("brain_lead_messages")
          .select("id, channel, direction, subject, content, status, meta, created_at")
          .eq("lead_id", body.lead_id as string)
          .order("id");
        await db.from("brain_leads").update({ unread: false }).eq("id", body.lead_id as string);
        return J({ messages: data ?? [] });
      }
      case "sales.stats": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const days = Math.min(Number(body.days) || 30, 90);
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const [{ data: leads }, { data: msgs }] = await Promise.all([
          db.from("brain_leads").select("id, status, temp, channel, unread, created_at").eq("project_id", pid).limit(5000),
          db
            .from("brain_lead_messages")
            .select("direction, channel, status, created_at")
            .eq("project_id", pid)
            .gte("created_at", since)
            .limit(10000),
        ]);
        const { data: usage } = await db
          .from("fiq_ai_usage").select("cost_usd, action, model, prompt_tokens, completion_tokens, created_at")
          .eq("project_id", pid).eq("product_key", "sales").gte("created_at", since).limit(20000);
        return J({ leads: leads ?? [], messages: msgs ?? [], usage: usage ?? [] });
      }

      // ── advisor ───────────────────────────────────────────────────────
      case "advisor.get": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data } = await db.from("brain_advisor").select("config, updated_at").eq("project_id", pid).maybeSingle();
        return J({ config: data?.config ?? {} });
      }
      case "advisor.set": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        await db
          .from("brain_advisor")
          .upsert({ project_id: pid, config: body.config ?? {}, updated_at: new Date().toISOString() });
        return J({ ok: true });
      }

      // ── channels ──────────────────────────────────────────────────────
      case "channels.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data } = await db.from("brain_channels").select("*").eq("project_id", pid).order("created_at");
        const channels = (data ?? []).map((c) => ({ ...c, config: maskSecrets((c.config ?? {}) as Record<string, unknown>, CHANNEL_SECRET_PATHS) }));
        return J({ channels });
      }
      case "channels.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const { data, error } = await db
          .from("brain_channels")
          .insert({
            project_id: pid,
            type: String(body.type || "widget"),
            name: String(body.name || ""),
            config: Object.fromEntries(
              Object.entries((body.config ?? {}) as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
            ),
          })
          .select()
          .single();
        if (error) throw error;
        return J({ channel: data });
      }
      case "channels.update": {
        const { data: ch } = await db.from("brain_channels").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!ch) return J({ error: "not found" }, 404);
        await assertProject(user, ch.project_id);
        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = body.name;
        if (body.config !== undefined) {
          // panel dostaje tokeny zamaskowane — przy zapisie przywracamy oryginały,
          // a pola tekstowe (page_id/ig_id/phone_number_id) trymujemy: wklejone z Meta
          // potrafią mieć spację/enter na końcu i wtedy kanał nigdy się nie dopasuje
          const { data: full } = await db.from("brain_channels").select("config").eq("id", body.id as string).maybeSingle();
          const merged = restoreSecrets(
            body.config as Record<string, unknown>,
            (full?.config ?? {}) as Record<string, unknown>,
            CHANNEL_SECRET_PATHS,
          );
          for (const [k, v] of Object.entries(merged)) if (typeof v === "string") merged[k] = v.trim();
          patch.config = merged;
        }
        if (body.enabled !== undefined) patch.enabled = !!body.enabled;
        await db.from("brain_channels").update(patch).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "channels.rotateKey": {
        // nowy public_key — stary link/embed natychmiast przestaje działać
        const { data: ch } = await db.from("brain_channels").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!ch) return J({ error: "not found" }, 404);
        await assertProject(user, ch.project_id);
        const key = newToken();
        await db.from("brain_channels").update({ public_key: key }).eq("id", body.id as string);
        return J({ public_key: key });
      }
      case "channels.delete": {
        const { data: ch } = await db.from("brain_channels").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!ch) return J({ error: "not found" }, 404);
        await assertProject(user, ch.project_id);
        await db.from("brain_channels").delete().eq("id", body.id as string);
        return J({ ok: true });
      }

      // ── poprawki trenera (kciuki i przepisane odpowiedzi z czatu) ─────
      // Zatwierdzone trafiają do promptu doradcy jako stałe wskazówki, więc muszą
      // dać się przejrzeć, poprawić i skasować — inaczej zła lekcja żyje wiecznie.
      case "lessons.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        // scope rozdziela trenowanie doradcy od trenowania sprzedawcy — to dwie
        // różne role i wskazówka dobra dla jednej potrafi zepsuć drugą
        const scope = lessonScope(body.scope);
        const { data } = await db
          .from("brain_feedback")
          .select("id, rating, note, original, corrected, status, scope, created_at, conversation_id, message_id")
          .eq("project_id", pid)
          .eq("scope", scope)
          .order("created_at", { ascending: false })
          .limit(300);
        return J({ lessons: data ?? [] });
      }
      // Wskazówkę można dopisać ręcznie, nie tylko przez kciuk w czacie —
      // sprzedawcę trenuje się zwykle na sucho, zanim ktokolwiek do niego napisze.
      case "lessons.create": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const note = String(body.note ?? "").trim().slice(0, 1000);
        if (!note) return J({ error: "Wpisz treść wskazówki" }, 400);
        const { data } = await db
          .from("brain_feedback")
          .insert({
            project_id: pid,
            scope: lessonScope(body.scope),
            rating: "down",
            note,
            original: String(body.original ?? "").slice(0, 4000),
            corrected: String(body.corrected ?? "").slice(0, 4000),
            status: "approved",
          })
          .select("id")
          .single();
        return J({ id: data?.id });
      }
      case "lessons.set": {
        const id = String(body.id || "");
        const { data: row } = await db.from("brain_feedback").select("project_id").eq("id", id).maybeSingle();
        if (!row) return J({ error: "not found" }, 404);
        await assertProject(user, row.project_id);
        const patch: Record<string, unknown> = {};
        if (body.note !== undefined) patch.note = String(body.note).slice(0, 1000);
        if (body.corrected !== undefined) patch.corrected = String(body.corrected).slice(0, 4000);
        if (body.status !== undefined) {
          const st = String(body.status);
          if (!["approved", "pending", "rejected"].includes(st)) return J({ error: "zły status" }, 400);
          patch.status = st;
        }
        if (!Object.keys(patch).length) return J({ error: "nic do zapisania" }, 400);
        await db.from("brain_feedback").update(patch).eq("id", id);
        return J({ ok: true });
      }
      case "lessons.delete": {
        const id = String(body.id || "");
        const { data: row } = await db.from("brain_feedback").select("project_id").eq("id", id).maybeSingle();
        if (!row) return J({ error: "not found" }, 404);
        await assertProject(user, row.project_id);
        await db.from("brain_feedback").delete().eq("id", id);
        return J({ ok: true });
      }

      // ── ustawienia globalne (provider AI) ─────────────────────────────
      // Stan wszystkich integracji platformy; force = sprawdź od nowa (po zapisie klucza).
      case "integrations.status": {
        if (!admin) return J({ error: "forbidden" }, 403);
        return J({ integrations: await integrationsStatus(!!body.force) });
      }
      // Zachowane dla zgodności — pojedyncze sprawdzenie klucza Google.
      case "maps.check": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { token } = await integrationKey("maps", "GOOGLE_MAPS_KEY");
        if (!token) return J({ ok: false, error: "Brak klucza Google — wklej go w Integracjach" });
        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": token,
            "X-Goog-FieldMask": "places.displayName",
          },
          body: JSON.stringify({ textQuery: "warsztat samochodowy Kraków", languageCode: "pl", maxResultCount: 1 }),
          signal: AbortSignal.timeout(20_000),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) return J({ ok: true, sample: data?.places?.[0]?.displayName?.text ?? "" });
        const msg = String(data?.error?.message ?? `HTTP ${r.status}`);
        // najczęstszy przypadek: klucz działa, ale API nie jest włączone w projekcie
        const url = String(data?.error?.details?.[0]?.metadata?.activationUrl ?? "");
        return J({ ok: false, error: msg.slice(0, 300), activation_url: url });
      }

      // ── produkty platformy (Brain, Hand, …) ───────────────────────────
      // Klient widzi produkty przypisane do JEGO workspace'u, admin — wszystkie aktywne.
      case "products.mine": {
        if (admin) {
          const { data } = await db.from("fiq_products").select("*").eq("active", true).order("sort");
          return J({ products: data ?? [] });
        }
        const { data: links } = await db
          .from("fiq_workspace_products").select("product_key").eq("workspace_id", user.workspace_id ?? "");
        const keys = (links ?? []).map((r: { product_key: string }) => r.product_key);
        if (!keys.length) return J({ products: [] });
        const { data } = await db.from("fiq_products").select("*").in("key", keys).eq("active", true).order("sort");
        return J({ products: data ?? [] });
      }
      case "products.list": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("fiq_products").select("*").order("sort");
        return J({ products: data ?? [] });
      }
      case "products.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const p = (body.product ?? {}) as Record<string, unknown>;
        const key = String(p.key ?? "").trim().toLowerCase();
        if (!key) return J({ error: "brak klucza produktu" }, 400);
        const { error } = await db.from("fiq_products").upsert({
          key,
          name: String(p.name ?? "").trim(),
          sense: String(p.sense ?? "Brain"),
          domain: String(p.domain ?? "").trim(),
          tagline: String(p.tagline ?? "").trim(),
          accent: String(p.accent ?? "#B8FF00").trim(),
          active: p.active !== false,
          sort: Number(p.sort ?? 0) || 0,
        }, { onConflict: "key" });
        if (error) throw error;
        return J({ ok: true });
      }
      case "ws.products": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("fiq_workspace_products").select("workspace_id, product_key");
        const map: Record<string, string[]> = {};
        for (const r of data ?? []) {
          const row = r as { workspace_id: string; product_key: string };
          (map[row.workspace_id] ??= []).push(row.product_key);
        }
        return J({ map });
      }
      case "ws.products.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const wsId = String(body.workspace_id || "");
        const key = String(body.product_key || "");
        if (!wsId || !key) return J({ error: "brak danych" }, 400);
        if (body.enabled) {
          const { error } = await db.from("fiq_workspace_products").upsert({ workspace_id: wsId, product_key: key });
          if (error) throw error;
        } else {
          const { error } = await db.from("fiq_workspace_products").delete().eq("workspace_id", wsId).eq("product_key", key);
          if (error) throw error;
        }
        return J({ ok: true });
      }
      case "user.projects": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("brain_user_projects").select("project_id").eq("user_id", String(body.user_id || ""));
        return J({ project_ids: (data ?? []).map((r: { project_id: string }) => r.project_id) });
      }
      case "user.projects.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const uid = String(body.user_id || "");
        const ids = (Array.isArray(body.project_ids) ? body.project_ids : []).map(String).filter(Boolean);
        await db.from("brain_user_projects").delete().eq("user_id", uid);
        if (ids.length) {
          const { error } = await db.from("brain_user_projects").insert(ids.map((project_id) => ({ user_id: uid, project_id })));
          if (error) throw error;
        }
        return J({ ok: true });
      }
      // ── wspólne kanały projektu (e-mail/Resend) ───────────────────────
      // Kanał należy do PROJEKTU, nie do produktu: ustawiony w jednym produkcie
      // działa we wszystkich (obecnych i przyszłych). Wcześniej klucz Resend leżał
      // w konfiguracji sprzedawcy, więc klient bez Braina nie miał gdzie go wpisać.
      case "proj.integration": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const kind = String(body.kind || "email");
        const { data } = await db
          .from("fiq_project_integrations").select("config").eq("project_id", pid).eq("kind", kind).maybeSingle();
        const cfg = (data?.config ?? {}) as Record<string, unknown>;
        return J({ config: maskSecrets(cfg, [["resend_key"]]), kind });
      }
      case "proj.integration.set": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const kind = String(body.kind || "email");
        const { data: prevRow } = await db
          .from("fiq_project_integrations").select("config").eq("project_id", pid).eq("kind", kind).maybeSingle();
        const prev = (prevRow?.config ?? {}) as Record<string, unknown>;
        // maska „••••1234" znaczy „nie zmieniałem" — podstawiamy starą wartość
        const cfg = restoreSecrets((body.config ?? {}) as Record<string, unknown>, prev, [["resend_key"]]);
        const { error } = await db.from("fiq_project_integrations")
          .upsert({ project_id: pid, kind, config: cfg, updated_at: new Date().toISOString() });
        if (error) throw error;
        return J({ ok: true, config: maskSecrets(cfg, [["resend_key"]]) });
      }

      // Przypisanie PROJEKTU do produktów (pusty zestaw = wszystkie produkty
      // workspace'u). Dzięki temu w jednym workspace mogą stać obok siebie
      // projekty prowadzone przez różne produkty platformy.
      case "proj.products": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const ws = String(body.workspace_id || "");
        let q = db.from("fiq_project_products").select("project_id, product_key");
        if (ws) {
          const { data: ps } = await db.from("brain_projects").select("id").eq("workspace_id", ws);
          const ids = (ps ?? []).map((r: { id: string }) => r.id);
          if (!ids.length) return J({ map: {} });
          q = q.in("project_id", ids);
        }
        const { data } = await q;
        const map: Record<string, string[]> = {};
        for (const r of data ?? []) {
          const row = r as { project_id: string; product_key: string };
          (map[row.project_id] ??= []).push(row.product_key);
        }
        return J({ map });
      }
      case "proj.products.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const pid = String(body.project_id || "");
        const key = String(body.product_key || "");
        if (!pid || !key) return J({ error: "brak danych" }, 400);
        if (body.enabled) {
          const { error } = await db.from("fiq_project_products").upsert({ project_id: pid, product_key: key });
          if (error) throw error;
        } else {
          const { error } = await db.from("fiq_project_products").delete().eq("project_id", pid).eq("product_key", key);
          if (error) throw error;
        }
        return J({ ok: true });
      }

      // ── Unipile: jeden token na całą platformę (jak dostawca AI) ──────
      case "unipile.accounts": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { cfg, token } = await integrationKey("unipile", "UNIPILE_TOKEN");
        const dsn = String(cfg.dsn ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        if (!dsn) return J({ error: "Brak DSN Unipile — uzupełnij w Integracjach" }, 400);
        if (!token) return J({ error: "Brak tokenu Unipile — wklej go w Integracjach" }, 400);
        const r = await fetch(`https://${dsn}/api/v1/accounts`, {
          headers: { "X-API-KEY": token, accept: "application/json" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) return J({ error: `Unipile ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` }, 400);
        const data = await r.json().catch(() => ({}));
        const items = (data?.items ?? data?.accounts ?? []) as Array<Record<string, unknown>>;
        return J({
          accounts: items.map((a) => ({
            id: String(a.id ?? ""),
            name: String((a.name as string) ?? (a.username as string) ?? ""),
            type: String(a.type ?? a.provider ?? ""),
            status: String((a.sources as Array<{ status?: string }> | undefined)?.[0]?.status ?? a.status ?? "ok"),
          })),
        });
      }

      case "settings.get": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("brain_settings").select("key, value");
        return J({
          settings: Object.fromEntries(
            (data ?? []).map((r) => [
              r.key,
              SETTINGS_SECRET_PATHS[r.key]
                ? maskSecrets((r.value ?? {}) as Record<string, unknown>, SETTINGS_SECRET_PATHS[r.key])
                : r.value,
            ]),
          ),
        });
      }
      case "settings.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const sKey = String(body.key);
        let sVal = (body.value ?? {}) as Record<string, unknown>;
        if (SETTINGS_SECRET_PATHS[sKey]) {
          const { data: prev } = await db.from("brain_settings").select("value").eq("key", sKey).maybeSingle();
          sVal = restoreSecrets(sVal, (prev?.value ?? {}) as Record<string, unknown>, SETTINGS_SECRET_PATHS[sKey]);
        }
        await db.from("brain_settings").upsert({ key: sKey, value: sVal, updated_at: new Date().toISOString() });
        return J({ ok: true });
      }

      // ── konwersacje + statystyki ──────────────────────────────────────
      case "conv.list": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        let q = db
          .from("brain_conversations")
          .select("id, channel_type, visitor_id, status, started_at, last_at, meta")
          .eq("project_id", pid)
          .order("last_at", { ascending: false })
          .limit(Math.min(Number(body.limit) || 50, 200));
        if (body.status) q = q.eq("status", body.status as string);
        const { data } = await q;
        return J({ conversations: data ?? [] });
      }
      case "conv.messages": {
        const cid = String(body.conversation_id || "");
        const { data: c } = await db.from("brain_conversations").select("project_id").eq("id", cid).maybeSingle();
        if (!c) return J({ error: "not found" }, 404);
        await assertProject(user, c.project_id);
        const { data } = await db
          .from("brain_messages")
          .select("id, role, content, chars, latency_ms, created_at")
          .eq("conversation_id", cid)
          .order("id");
        return J({ messages: data ?? [] });
      }
      case "conv.close": {
        const cid = String(body.conversation_id || "");
        const { data: c } = await db.from("brain_conversations").select("project_id").eq("id", cid).maybeSingle();
        if (!c) return J({ error: "not found" }, 404);
        await assertProject(user, c.project_id);
        await db
          .from("brain_conversations")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", cid);
        return J({ ok: true });
      }

      case "conv.delete": {
        // Usuwanie rozmów (np. testowych) z zakładki Konwersacje: jedna albo wiele naraz.
        // brain_messages lecą kaskadą (FK ON DELETE CASCADE), brain_events/brain_feedback
        // dostają NULL w conversation_id — statystyki liczone z rozmów po prostu je pominą.
        const ids = (Array.isArray(body.conversation_ids) ? body.conversation_ids : [body.conversation_id])
          .map((x) => String(x || "").trim()).filter(Boolean).slice(0, 500);
        if (!ids.length) return J({ error: "brak conversation_id" }, 400);
        const { data: rows } = await db.from("brain_conversations").select("id, project_id").in("id", ids);
        if (!rows?.length) return J({ error: "not found" }, 404);
        for (const pid of new Set(rows.map((r) => String(r.project_id)))) await assertProject(user, pid);
        const { error } = await db.from("brain_conversations").delete().in("id", rows.map((r) => r.id));
        if (error) return J({ error: error.message }, 500);
        return J({ ok: true, deleted: rows.length });
      }

      case "stats": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const days = Math.min(Number(body.days) || 30, 90);
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const chFilter = body.channel_type ? String(body.channel_type) : null;

        let cq = db
          .from("brain_conversations")
          .select("id, channel_type, status, started_at, last_at, visitor_id") // visitor_id: kolumna „Gość" w panelu była zawsze pusta bez niego
          .eq("project_id", pid)
          .gte("started_at", since);
        // „Messenger" w panelu = strona przez aplikację Meta (`facebook`) + skrzynka przez Unipile (`messenger`)
        if (chFilter === "messenger") cq = cq.in("channel_type", ["messenger", "facebook"]);
        else if (chFilter) cq = cq.eq("channel_type", chFilter);
        const { data: convs } = await cq.limit(5000);
        const convIds = (convs ?? []).map((c) => c.id);

        let msgs: { conversation_id: string; role: string; chars: number; latency_ms: number | null; created_at: string }[] = [];
        if (convIds.length) {
          // porcjami po 200 id — limit długości zapytania
          for (let i = 0; i < convIds.length; i += 200) {
            const { data: m } = await db
              .from("brain_messages")
              .select("conversation_id, role, chars, latency_ms, created_at")
              .in("conversation_id", convIds.slice(i, i + 200))
              .gte("created_at", since)
              .limit(10000);
            msgs = msgs.concat(m ?? []);
          }
        }
        // koszt modelu: doradca + wspólna synchronizacja bazy wiedzy (product_key brain)
        const { data: usage } = await db
          .from("fiq_ai_usage").select("cost_usd, action, model, prompt_tokens, completion_tokens, created_at")
          .eq("project_id", pid).in("product_key", ["advisor", "brain"]).gte("created_at", since).limit(20000);
        return J({ conversations: convs ?? [], messages: msgs, usage: usage ?? [] });
      }

      default:
        return J({ error: "unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "forbidden") return J({ error: "forbidden" }, 403);
    console.error("brain-admin error", action, msg);
    return J({ error: msg }, 500);
  }
});
