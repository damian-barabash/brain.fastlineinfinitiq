// brain-hook — webhooki kanałów rozmów.
//  A) Meta (Messenger / Instagram DM / WhatsApp Cloud API) — własna aplikacja Meta klienta:
//     GET  = weryfikacja subskrypcji (hub.challenge, verify_token z configu kanału)
//     POST = przyjęcie wiadomości → brain-chat (stream:false) → odpowiedź przez Graph API.
//     Kanał znajdywany po page_id / ig_id / phone_number_id zapisanych w brain_channels.config.
//  B) Unipile (od 2026-09-14) — konta WhatsApp / Instagram / LinkedIn / Messenger / Telegram,
//     które klient podłącza SAM jednym linkiem (/connect?t=…), bez tokenów Meta:
//     ?hook=unipile        = wiadomość przychodząca (jeden webhook „messaging" na całą instalację)
//     ?hook=unipile-status = zmiana stanu konta (CREDENTIALS / DELETED / OK …)
//     ?hook=unipile-auth   = notify_url kreatora Hosted Auth (konto podłączone → przypisanie do projektu)
//     Autoryzacja: ?key=UNIPILE_HOOK_KEY (albo nagłówek x-hook-key).
//
// v4 (2026-09-01), przed pierwszym realnym podłączeniem kanałów:
//  • Graph API v21 → v23 (v21 kończy wsparcie),
//  • każda wysyłka sprawdza odpowiedź Meta i loguje błąd (wcześniej 400 znikało bez śladu),
//  • deduplikacja po mid/id wiadomości (Meta dostarcza at-least-once),
//  • przycinanie odpowiedzi do limitów kanału (Messenger 2000, WhatsApp 4096),
//  • findChannel filtruje po typie i enabled po stronie bazy,
//  • opcjonalna weryfikacja podpisu X-Hub-Signature-256 (gdy w kanale ustawiono app_secret),
//  • załączniki/naklejki dostają uprzejmą odpowiedź zamiast ciszy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const GRAPH = "https://graph.facebook.com/v23.0";
const MAX_MESSENGER = 1900; // limit Meta to 2000 znaków
const MAX_WHATSAPP = 4000; // limit Meta to 4096 znaków
const NO_TEXT_REPLY = "Na razie rozumiem tylko wiadomości tekstowe — napiszcie proszę słowami, a chętnie pomogę.";

type ChannelRow = {
  id: string;
  project_id: string;
  type: string;
  public_key: string;
  enabled: boolean;
  config: Record<string, string>;
};

const CHANNEL_TYPE: Record<string, string> = { page_id: "facebook", ig_id: "instagram", phone_number_id: "whatsapp" };

async function findChannel(field: string, value: string): Promise<ChannelRow | null> {
  const v = String(value ?? "").trim();
  if (!v) return null;
  let q = db
    .from("brain_channels")
    .select("id, project_id, type, public_key, enabled, config")
    .contains("config", { [field]: v })
    .eq("enabled", true); // filtr w bazie, nie po limit(1) — inaczej wyłączony kanał zasłaniał włączony
  const type = CHANNEL_TYPE[field];
  if (type) q = q.eq("type", type);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(1);
  if (error) console.error("findChannel error", field, error.message);
  return (data?.[0] as ChannelRow | undefined) ?? null;
}

// Meta dostarcza webhooki at-least-once — bez tego powtórka = druga odpowiedź klientowi.
// Unikalny indeks na brain_events(type, data->>'mid') zamienia duplikat w błąd 23505.
async function seenBefore(projectId: string | null, mid: string): Promise<boolean> {
  if (!mid) return false;
  const { error } = await db.from("brain_events").insert({ project_id: projectId, type: "hook_msg", data: { mid } });
  if (!error) return false;
  if (error.code === "23505") {
    console.log("hook: duplikat wiadomości", mid);
    return true;
  }
  console.error("seenBefore insert error", error.message);
  return false; // błąd zapisu nie może blokować odpowiedzi klientowi
}

async function askBrain(publicKey: string, text: string, visitorId: string, channelType?: string): Promise<string> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: publicKey, message: text, visitor_id: visitorId, stream: false, channel_type: channelType }),
      signal: AbortSignal.timeout(100_000),
    });
    if (!r.ok) {
      console.error("brain-chat error", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return "";
    }
    const data = await r.json();
    return data?.reply ?? "";
  } catch (e) {
    console.error("brain-chat unreachable", String(e).slice(0, 200));
    return "";
  }
}

async function logEvent(projectId: string | null, type: string, data: Record<string, unknown>) {
  try {
    const { error } = await db.from("brain_events").insert({ project_id: projectId, type, data });
    if (error) console.error("logEvent", type, error.message);
  } catch {
    /* logging nie może wywalić webhooka */
  }
}

// Podpis Meta liczony jest z surowego ciała żądania. app_secret jest opcjonalny —
// gdy go nie ma w configu kanału, zachowujemy się jak dotąd (wpuszczamy).
async function signatureOk(raw: string, header: string | null, appSecret?: string): Promise<boolean> {
  // kanały podłączone przez OAuth naszej aplikacji „Infinitiq" nie mają własnego app_secret —
  // podpis sprawdzamy sekretem aplikacji platformy
  appSecret = appSecret || Deno.env.get("META_APP_SECRET") || "";
  if (!appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}` === header.trim();
}

// ── wysyłka odpowiedzi ────────────────────────────────────────────────────
async function sendMessenger(ch: ChannelRow, recipientId: string, text: string) {
  const pageToken = ch.config.page_token ?? "";
  if (!pageToken) {
    console.error("send: brak page_token w kanale", ch.id);
    await logEvent(ch.project_id, "send_error", { channel: ch.type, error: "brak page_token" });
    return;
  }
  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    message: { text: text.slice(0, MAX_MESSENGER) },
  };
  if (ch.type === "facebook") body.messaging_type = "RESPONSE"; // IG Messaging tego pola nie wymaga
  try {
    const r = await fetch(`${GRAPH}/me/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pageToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const err = (await r.text().catch(() => "")).slice(0, 500);
      console.error("Graph send error", ch.type, r.status, err);
      await logEvent(ch.project_id, "send_error", { channel: ch.type, status: r.status, body: err });
    }
  } catch (e) {
    console.error("Graph send network", String(e).slice(0, 200));
    await logEvent(ch.project_id, "send_error", { channel: ch.type, error: String(e).slice(0, 300) });
  }
}

async function sendWhatsApp(ch: ChannelRow, phoneNumberId: string, to: string, text: string) {
  const token = ch.config.wa_token ?? "";
  if (!token) {
    console.error("send: brak wa_token w kanale", ch.id);
    await logEvent(ch.project_id, "send_error", { channel: "whatsapp", error: "brak wa_token" });
    return;
  }
  try {
    const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, MAX_WHATSAPP) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const err = (await r.text().catch(() => "")).slice(0, 500);
      console.error("Graph WA send error", r.status, err);
      await logEvent(ch.project_id, "send_error", { channel: "whatsapp", status: r.status, body: err });
    }
  } catch (e) {
    console.error("Graph WA network", String(e).slice(0, 200));
    await logEvent(ch.project_id, "send_error", { channel: "whatsapp", error: String(e).slice(0, 300) });
  }
}

// ── obsługa payloadów ─────────────────────────────────────────────────────
// ── „żywy" czat: przeczytane + pisze… ──────────────────────────────────────
// Ludzie są przyzwyczajeni, że po wysłaniu wiadomości widzą „wyświetlono", a potem trzy kropki.
// Bez tego agent wygląda jak automat, który milczy i nagle wyrzuca gotowy tekst.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// ile „pisać" po wygenerowaniu odpowiedzi: proporcjonalnie do długości, ale bez przesady
const typingMs = (text: string) => Math.min(3200, Math.max(700, text.length * 16));

// Messenger / Instagram (aplikacja Meta): mark_seen | typing_on | typing_off
async function metaSenderAction(ch: ChannelRow, recipientId: string, action: "mark_seen" | "typing_on" | "typing_off") {
  const pageToken = ch.config.page_token ?? "";
  if (!pageToken) return;
  try {
    const r = await fetch(`${GRAPH}/me/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pageToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: action }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) console.error("sender_action", action, r.status, (await r.text().catch(() => "")).slice(0, 160));
  } catch (e) {
    console.error("sender_action network", action, String(e).slice(0, 120)); // kosmetyka — nigdy nie blokuje odpowiedzi
  }
}

// WhatsApp Cloud API: jedno wywołanie oznacza wiadomość jako przeczytaną i włącza „pisze…" (do 25 s albo do wysyłki)
async function waReadAndTyping(ch: ChannelRow, phoneNumberId: string, messageId: string) {
  const token = ch.config.wa_token ?? "";
  if (!token || !messageId) return;
  try {
    const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) console.error("wa read/typing", r.status, (await r.text().catch(() => "")).slice(0, 160));
  } catch (e) {
    console.error("wa read/typing network", String(e).slice(0, 120));
  }
}

async function handleMessengerLike(bodyObj: Record<string, unknown>, kind: "facebook" | "instagram", raw: string, sig: string | null) {
  const entries = (bodyObj.entry ?? []) as Record<string, unknown>[];
  for (const entry of entries) {
    const pageId = String(entry.id ?? "");
    const events = (entry.messaging ?? []) as Record<string, unknown>[];
    for (const ev of events) {
      const msg = ev.message as Record<string, unknown> | undefined;
      const senderId = String((ev.sender as Record<string, unknown>)?.id ?? "");
      if (!msg || msg.is_echo || !senderId) continue; // echo = własna odpowiedź strony, inaczej pętla
      const field = kind === "instagram" ? "ig_id" : "page_id";
      const ch = (await findChannel(field, pageId)) ?? (kind === "instagram" ? await findChannel("page_id", pageId) : null);
      if (!ch) {
        console.error("hook: nie znaleziono kanału", kind, pageId);
        await logEvent(null, "hook_unmatched", { kind, pageId });
        continue;
      }
      if (!(await signatureOk(raw, sig, ch.config.app_secret))) {
        console.error("hook: zły podpis X-Hub-Signature-256", kind, pageId);
        await logEvent(ch.project_id, "hook_bad_signature", { kind });
        continue;
      }
      if (await seenBefore(ch.project_id, String(msg.mid ?? ""))) continue;
      await metaSenderAction(ch, senderId, "mark_seen"); // klient widzi „wyświetlono"
      const text = String(msg.text ?? "").trim();
      if (!text) {
        // zdjęcie/naklejka/głosówka — bez tego bot po prostu milczy i wygląda na zepsutego
        await sendMessenger(ch, senderId, NO_TEXT_REPLY);
        continue;
      }
      await sleep(500 + Math.random() * 700); // chwila „czytania"
      await metaSenderAction(ch, senderId, "typing_on"); // trzy kropki na czas generowania
      const reply = await askBrain(ch.public_key, text, `${kind}:${senderId}`);
      if (reply) {
        await metaSenderAction(ch, senderId, "typing_on"); // wskaźnik gaśnie po 20 s — odnawiamy przed „dopisywaniem"
        await sleep(typingMs(reply));
        await sendMessenger(ch, senderId, reply); // wysłanie wiadomości samo gasi kropki
      } else {
        await metaSenderAction(ch, senderId, "typing_off");
        await logEvent(ch.project_id, "no_reply", { kind, reason: "brain-chat zwrócił pusto" });
      }
    }
  }
}

// ── Meta: zapasowy odczyt skrzynki strony (polling) ───────────────────────
// Aplikacja Meta w trybie deweloperskim NIE dostaje żywych webhooków (tylko testowe z dashboardu),
// a opublikować ją można dopiero po App Review. Żeby doradca odpowiadał już teraz (także recenzentowi
// Meta), co ~20 s czytamy ostatnie rozmowy stron podłączonych przez OAuth i każdą nową wiadomość klienta
// przepuszczamy przez TEN SAM handler co webhook. Id wiadomości z Conversations API to ten sam `m_…`
// co `mid` w webhooku, więc po publikacji aplikacji oba źródła deduplikują się w `seenBefore`.
const META_POLL_KEY = Deno.env.get("META_POLL_KEY") ?? "";
const POLL_MAX_AGE_MS = 15 * 60_000; // starszych wiadomości nie ruszamy (pierwsze uruchomienie, przerwy)
const fbTime = (t: unknown) => Date.parse(String(t ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

async function signRaw(raw: string, secret: string): Promise<string | null> {
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pollMetaOnce(): Promise<number> {
  const { data: chans } = await db.from("brain_channels").select("project_id, config").eq("type", "facebook").eq("enabled", true);
  let handled = 0;
  for (const ch of chans ?? []) {
    const cfg = (ch.config ?? {}) as Record<string, unknown>;
    const pageId = String(cfg.page_id ?? "");
    const token = String(cfg.page_token ?? "");
    if (!cfg.oauth || !pageId || !token) continue;
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 15_000);
      const r = await fetch(
        `${GRAPH}/${pageId}/conversations?platform=messenger&limit=10&fields=id,updated_time,messages.limit(1){id,from,message,created_time}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
      );
      clearTimeout(tm);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("meta poll:", pageId, r.status, JSON.stringify(j).slice(0, 200));
        continue;
      }
      for (const conv of (j.data ?? []) as Record<string, unknown>[]) {
        if (Date.now() - fbTime(conv.updated_time) > POLL_MAX_AGE_MS) continue;
        const m = (((conv.messages as Record<string, unknown>)?.data ?? []) as Record<string, unknown>[])[0];
        const fromId = String((m?.from as Record<string, unknown>)?.id ?? "");
        // ostatnie słowo należy do strony (bot albo człowiek ze skrzynki) → nic do zrobienia
        if (!m || !fromId || fromId === pageId) continue;
        if (Date.now() - fbTime(m.created_time) > POLL_MAX_AGE_MS) continue;
        const body = {
          object: "page",
          entry: [{ id: pageId, time: Date.now(), messaging: [{ sender: { id: fromId }, recipient: { id: pageId }, timestamp: fbTime(m.created_time), message: { mid: String(m.id ?? ""), text: String(m.message ?? "") } }] }],
        };
        const raw = JSON.stringify(body);
        const sig = await signRaw(raw, String(cfg.app_secret ?? "") || (Deno.env.get("META_APP_SECRET") ?? ""));
        await handleMessengerLike(body, "facebook", raw, sig);
        handled++;
      }
    } catch (e) {
      console.error("meta poll error", pageId, String(e).slice(0, 200));
    }
  }
  return handled;
}

async function handleWhatsApp(bodyObj: Record<string, unknown>, raw: string, sig: string | null) {
  const entries = (bodyObj.entry ?? []) as Record<string, unknown>[];
  for (const entry of entries) {
    for (const change of (entry.changes ?? []) as Record<string, unknown>[]) {
      const value = change.value as Record<string, unknown> | undefined;
      const phoneNumberId = String((value?.metadata as Record<string, unknown>)?.phone_number_id ?? "");
      const messages = (value?.messages ?? []) as Record<string, unknown>[];
      if (!messages.length) continue; // statusy delivered/read
      const ch = await findChannel("phone_number_id", phoneNumberId);
      if (!ch) {
        console.error("hook: nie znaleziono kanału WhatsApp", phoneNumberId);
        await logEvent(null, "hook_unmatched", { kind: "whatsapp", phoneNumberId });
        continue;
      }
      if (!(await signatureOk(raw, sig, ch.config.app_secret))) {
        console.error("hook: zły podpis X-Hub-Signature-256 (WA)", phoneNumberId);
        await logEvent(ch.project_id, "hook_bad_signature", { kind: "whatsapp" });
        continue;
      }
      for (const m of messages) {
        const from = String(m.from ?? "");
        if (!from) continue;
        if (await seenBefore(ch.project_id, String(m.id ?? ""))) continue;
        await waReadAndTyping(ch, phoneNumberId, String(m.id ?? "")); // niebieskie ptaszki + „pisze…"
        if (m.type !== "text") {
          await sendWhatsApp(ch, phoneNumberId, from, NO_TEXT_REPLY);
          continue;
        }
        const text = String((m.text as Record<string, unknown>)?.body ?? "").trim();
        if (!text) continue;
        const reply = await askBrain(ch.public_key, text, `wa:${from}`);
        if (reply) {
          await sleep(typingMs(reply));
          await sendWhatsApp(ch, phoneNumberId, from, reply);
        } else await logEvent(ch.project_id, "no_reply", { kind: "whatsapp", reason: "brain-chat zwrócił pusto" });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Unipile — kanały podłączone przez klienta jednym linkiem
// ═══════════════════════════════════════════════════════════════════════════
// Unipile „udaje" konto klienta (WhatsApp jak WhatsApp Web, Instagram/LinkedIn jak
// zalogowana sesja), więc każde konto ma swojego właściciela-projekt w
// fiq_project_accounts. Trasa wiadomości przychodzącej:
//   1. LinkedIn i nadawca jest leadem Łowcy (hand_leads.li_urn)  → hand-api (Łowca odpowiada sam),
//   2. nadawca jest leadem Sprzedawcy (chat_id / attendee / numer) → brain-sales,
//   3. projekt ma WŁĄCZONY kanał doradcy dla tego konta            → brain-chat + odpowiedź,
//   4. nikt inny → Sprzedawca zakłada ciepłego leada (jak przy mailu), jeśli ma to włączone.
const UNI_HOOK_KEY = Deno.env.get("UNIPILE_HOOK_KEY") ?? "";
const PROVIDER_CHANNEL: Record<string, string> = {
  WHATSAPP: "whatsapp", INSTAGRAM: "instagram", LINKEDIN: "linkedin", MESSENGER: "messenger", TELEGRAM: "telegram",
};
const PROVIDER_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", LINKEDIN: "LinkedIn", MESSENGER: "Messenger", TELEGRAM: "Telegram",
};
// twarde limity długości wiadomości u dostawców (z zapasem)
const UNI_MAX: Record<string, number> = { WHATSAPP: 4000, INSTAGRAM: 950, LINKEDIN: 7900, MESSENGER: 1900, TELEGRAM: 4000 };
// Bezpieczniki. Doradca tylko ODPOWIADA, ale pętla z cudzym botem albo tysiąc
// wiadomości z jednego czatu zamieniłyby konto klienta w karabin — a Unipile
// ostrzega, że takie konta dostają blokadę.
const UNI_REPLIES_PER_CHAT_H = 12;
const UNI_REPLIES_PER_ACCOUNT_DAY = 400;
const UNI_REPLY_DELAY_MS: [number, number] = [1500, 4000]; // „człowiek nie odpisuje w 200 ms"

type AccountRow = {
  id: string; project_id: string; provider: string; account_id: string; account_name: string;
  provider_user_id: string; status: string; connected_at: string;
  // Instagram nadaje wiadomościom id konta z INNEJ przestrzeni niż id konta (konto 7578586039,
  // nadawca własnych wiadomości 119702706090004) — takie id uczymy się i trzymamy tutaj
  own_ids?: string[] | null;
};

async function unipileCfg() {
  const { data } = await db.from("brain_settings").select("value").eq("key", "unipile").maybeSingle();
  const cfg = (data?.value ?? {}) as Record<string, string>;
  const token = (cfg.api_key || "").trim() || Deno.env.get((cfg.key_secret || "UNIPILE_TOKEN").trim()) || "";
  const dsn = String(cfg.dsn ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { dsn, token, ready: !!(dsn && token) };
}

async function uniFetch(path: string, init: RequestInit = {}, timeout = 25_000): Promise<Record<string, unknown>> {
  const { dsn, token, ready } = await unipileCfg();
  if (!ready) throw new Error("Unipile nieskonfigurowane (DSN/token w Admin → Integracje)");
  const headers: Record<string, string> = { "X-API-KEY": token, accept: "application/json", ...((init.headers as Record<string, string>) ?? {}) };
  // FormData ustawia własny Content-Type z boundary — ręczny nagłówek by go zepsuł
  if (!(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(`https://${dsn}/api/v1${path}`, { ...init, headers, signal: AbortSignal.timeout(timeout) });
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

async function uniSend(chatId: string, accountId: string, provider: string, text: string) {
  const fd = new FormData();
  fd.set("text", text.slice(0, UNI_MAX[provider] ?? 1900));
  fd.set("account_id", accountId);
  // WhatsApp: „pisze…" przez chwilę zależną od długości — wygląda jak człowiek
  if (provider === "WHATSAPP") fd.set("typing_duration", String(Math.min(5000, Math.max(1200, text.length * 35))));
  return await uniFetch(`/chats/${encodeURIComponent(chatId)}/messages`, { method: "POST", body: fd }, 30_000);
}

// Unipile: „przeczytane" działa na WhatsAppie i LinkedInie (setReadStatus); Instagram/Telegram API tego nie daje —
// błąd jest tam po prostu ignorowany. „Pisze…" na WhatsAppie robi `typing_duration` przy wysyłce (uniSend).
async function uniMarkRead(chatId: string, provider: string) {
  if (!["WHATSAPP", "LINKEDIN", "INSTAGRAM", "TELEGRAM", "MESSENGER"].includes(provider)) return;
  try {
    await uniFetch(`/chats/${encodeURIComponent(chatId)}`, { method: "PATCH", body: JSON.stringify({ action: "setReadStatus", value: true }) }, 8_000);
  } catch (e) {
    if (provider === "WHATSAPP" || provider === "LINKEDIN") console.error("unipile setReadStatus", provider, String(e).slice(0, 160));
  }
}

const digits = (s: string) => String(s ?? "").replace(/[^\d]/g, "");
// ten sam uczestnik? id dosłownie albo (WhatsApp) ten sam numer w innym zapisie
function sameActor(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const da = digits(a.split("@")[0]);
  const db_ = digits(b.split("@")[0]);
  return da.length >= 8 && da === db_;
}

async function uniAccountRow(accountId: string): Promise<AccountRow | null> {
  const { data } = await db.from("fiq_project_accounts").select("*").eq("account_id", accountId).maybeSingle();
  return (data ?? null) as AccountRow | null;
}

async function uniBudgetOk(acc: AccountRow, chatId: string): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: perChat }, { count: perAcc }] = await Promise.all([
    db.from("brain_events").select("id", { count: "exact", head: true }).eq("type", "uni_reply").eq("data->>chat_id", chatId).gte("created_at", hourAgo),
    db.from("brain_events").select("id", { count: "exact", head: true }).eq("type", "uni_reply").eq("data->>account_id", acc.account_id).gte("created_at", dayAgo),
  ]);
  if ((perChat ?? 0) >= UNI_REPLIES_PER_CHAT_H) {
    console.error("unipile: limit odpowiedzi w czacie", chatId);
    await logEvent(acc.project_id, "uni_rate_limit", { account_id: acc.account_id, chat_id: chatId, scope: "chat" });
    return false;
  }
  if ((perAcc ?? 0) >= UNI_REPLIES_PER_ACCOUNT_DAY) {
    console.error("unipile: dobowy limit odpowiedzi konta", acc.account_id);
    await logEvent(acc.project_id, "uni_rate_limit", { account_id: acc.account_id, scope: "account" });
    return false;
  }
  return true;
}

async function replyUni(acc: AccountRow, chatId: string, text: string, count = false) {
  const [lo, hi] = UNI_REPLY_DELAY_MS;
  await new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
  // ślad PRZED wysyłką: webhook z naszą własną wiadomością potrafi przyjść, zanim Unipile odda message_id
  await logEvent(acc.project_id, "uni_sending", { chat_id: chatId, t: sentKey(text) });
  try {
    const res = await uniSend(chatId, acc.account_id, acc.provider, text);
    await logUniSent(acc.project_id, chatId, String(res?.message_id ?? ""), text);
    if (count) await logEvent(acc.project_id, "uni_reply", { account_id: acc.account_id, chat_id: chatId, provider: acc.provider });
  } catch (e) {
    console.error("unipile send error", acc.provider, String(e).slice(0, 300));
    await logEvent(acc.project_id, "send_error", { channel: PROVIDER_CHANNEL[acc.provider] ?? "unipile", via: "unipile", error: String(e).slice(0, 300) });
  }
}

// ── człowiek przejmuje rozmowę ─────────────────────────────────────────────
// Każda wiadomość WYSŁANA z konta klienta (także nasza, przez API) wraca webhookiem
// `message_received` z nadawcą = właściciel konta. Żeby odróżnić naszego agenta od
// człowieka piszącego z telefonu, każda wysyłka (tu i w brain-sales) zostawia ślad
// `uni_sent` z message_id i początkiem treści. Wiadomość własna BEZ takiego śladu =
// człowiek wszedł do rozmowy → agent milknie w tym czacie na HUMAN_MUTE_H godzin:
// otwarta rozmowa doradcy zostaje zamknięta, lead sprzedawcy traci zaplanowany follow-up,
// a przychodzące w tym czasie są tylko zapisywane (sprzedawca) albo pomijane (doradca).
// Po upływie ciszy pierwsza wiadomość klienta otwiera NOWĄ rozmowę i agent odpowiada jak zwykle.
const HUMAN_MUTE_H = 48;
const sentKey = (t: string) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 240);

async function logUniSent(projectId: string, chatId: string, messageId: string, text: string) {
  await logEvent(projectId, "uni_sent", { chat_id: chatId, message_id: messageId, t: sentKey(text) });
}

async function isOurOwnMessage(chatId: string, messageId: string, text: string): Promise<boolean> {
  if (messageId) {
    const { count } = await db.from("brain_events").select("id", { count: "exact", head: true })
      .eq("type", "uni_sent").eq("data->>message_id", messageId);
    if ((count ?? 0) > 0) return true;
  }
  // webhook potrafi wyprzedzić zapis śladu albo dostawca nadaje inne id — porównanie treści z ostatnich minut
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await db.from("brain_events").select("data").in("type", ["uni_sent", "uni_sending"]).eq("data->>chat_id", chatId).gte("created_at", since).limit(40);
  const k = sentKey(text);
  if (!k) return false;
  if ((data ?? []).some((r) => String((r.data as Record<string, unknown>)?.t ?? "") === k)) return true;
  // notatka z zaproszenia LinkedIn (Łowca) trafia do czatu dopiero po przyjęciu zaproszenia — ślad bez chat_id,
  // więc szukamy tej samej treści w ostatnich 30 dniach
  const month = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { count } = await db.from("brain_events").select("id", { count: "exact", head: true })
    .eq("type", "uni_sent").eq("data->>chat_id", "").eq("data->>t", k).gte("created_at", month);
  return (count ?? 0) > 0;
}

async function uniMuteUntil(chatId: string): Promise<string | null> {
  const { data } = await db.from("brain_events").select("data, created_at").eq("type", "uni_mute").eq("data->>chat_id", chatId)
    .order("created_at", { ascending: false }).limit(1);
  const until = String((data?.[0]?.data as Record<string, unknown>)?.until ?? "");
  return until && until > new Date().toISOString() ? until : null;
}

async function handleHumanTakeover(acc: AccountRow, chatId: string, messageId: string, text: string, otherId: string) {
  if (await isOurOwnMessage(chatId, messageId, text)) return;
  // sprzedawca i Łowca zapisują ślad dopiero po odpowiedzi Unipile — dajemy im chwilę,
  // zanim uznamy wiadomość za człowieka (fałszywe przejęcie = agent milczy 48 h)
  await new Promise((r) => setTimeout(r, 5000));
  if (await isOurOwnMessage(chatId, messageId, text)) return;
  if (await uniMuteUntil(chatId)) return; // już wyciszone — nie mnożymy zdarzeń
  const until = new Date(Date.now() + HUMAN_MUTE_H * 3600_000).toISOString();
  const channel = PROVIDER_CHANNEL[acc.provider] ?? "unipile";
  const info: Record<string, unknown> = { chat_id: chatId, account_id: acc.account_id, provider: acc.provider, until };
  // doradca: zamykamy otwartą rozmowę tego gościa
  const { data: chRows } = await db.from("brain_channels").select("id").eq("project_id", acc.project_id).eq("type", "unipile")
    .contains("config", { account_id: acc.account_id }).limit(1);
  if (chRows?.[0] && otherId) {
    const { data: convs } = await db.from("brain_conversations").select("id, meta").eq("project_id", acc.project_id)
      .eq("channel_id", chRows[0].id).eq("visitor_id", `${channel}:${otherId}`).eq("status", "open").limit(5);
    for (const c of convs ?? []) {
      await db.from("brain_conversations").update({
        status: "closed", closed_at: new Date().toISOString(),
        meta: { ...((c.meta as Record<string, unknown>) ?? {}), human_takeover_at: new Date().toISOString(), mute_until: until },
      }).eq("id", c.id);
    }
    if (convs?.length) info.conversation_ids = convs.map((c) => c.id);
  }
  // sprzedawca: lead zostaje w swoim statusie, ale bez zaplanowanej wysyłki i z notatką o ciszy
  const lead = otherId ? await findSalesLead(acc, chatId, otherId) : null;
  if (lead) {
    await db.from("brain_leads").update({
      next_at: null, updated_at: new Date().toISOString(),
      meta: { ...((lead.meta as Record<string, unknown>) ?? {}), human_takeover_at: new Date().toISOString(), mute_until: until },
    }).eq("id", lead.id);
    info.lead_id = lead.id;
  }
  await logEvent(acc.project_id, "uni_mute", info);
  await logEvent(acc.project_id, "human_takeover", info);
  console.log("unipile: człowiek przejął rozmowę", acc.provider, chatId, "cisza do", until);
}

async function findSalesLead(acc: AccountRow, chatId: string, senderId: string): Promise<Record<string, unknown> | null> {
  const pid = acc.project_id;
  let res = await db.from("brain_leads").select("*").eq("project_id", pid).eq("meta->>unipile_chat_id", chatId).limit(1);
  if (res.data?.length) return res.data[0];
  res = await db.from("brain_leads").select("*").eq("project_id", pid).eq("meta->>unipile_attendee", senderId).limit(1);
  if (res.data?.length) return res.data[0];
  if (acc.provider === "WHATSAPP") {
    // lead wgrany z numerem, do którego jeszcze nie pisaliśmy (albo pisaliśmy przez Cloud API)
    const phone = digits(senderId.split("@")[0]);
    if (phone.length >= 8) {
      const { data: leads } = await db.from("brain_leads").select("*").eq("project_id", pid).neq("phone", "").limit(2000);
      const cands = (leads ?? []).filter((l) => {
        const d = digits(String(l.phone));
        return d === phone || d.replace(/^0+/, "") === phone.replace(/^48/, "") || (phone.endsWith(d) && d.length >= 9);
      });
      if (cands.length === 1) return cands[0];
    }
  }
  return null;
}

async function forwardHand(payload: Record<string, unknown>) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/hand-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hand-key": Deno.env.get("HAND_CRON_KEY") ?? "" },
      body: JSON.stringify({ action: "webhook", payload }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) console.error("hand-api webhook", r.status, (await r.text().catch(() => "")).slice(0, 200));
  } catch (e) {
    console.error("hand-api unreachable", String(e).slice(0, 200));
  }
}

async function forwardSales(payload: Record<string, unknown>) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-sales?hook=unipile&key=${encodeURIComponent(UNI_HOOK_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) console.error("brain-sales unipile", r.status, (await r.text().catch(() => "")).slice(0, 200));
  } catch (e) {
    console.error("brain-sales unreachable", String(e).slice(0, 200));
  }
}

async function handleUnipileMessage(body: Record<string, unknown>) {
  const event = String(body.event ?? "message_received");
  if (event !== "message_received") return;
  const accountId = String(body.account_id ?? "");
  const chatId = String(body.chat_id ?? "");
  const messageId = String(body.message_id ?? "");
  const sender = (body.sender ?? {}) as Record<string, unknown>;
  const senderId = String(sender.attendee_provider_id ?? "");
  const senderName = String(sender.attendee_name ?? "");
  const ownId = String(((body.account_info ?? {}) as Record<string, unknown>).user_id ?? "");
  if (!accountId || !chatId || !senderId) return;

  const acc = await uniAccountRow(accountId);
  if (!acc) {
    console.error("unipile: konto bez projektu", accountId);
    await logEvent(null, "hook_unmatched", { kind: "unipile", accountId });
    return;
  }
  const provider = acc.provider;
  const text = String(body.message ?? "").trim();
  const ownIds = () => [ownId, acc.provider_user_id, ...(acc.own_ids ?? [])];
  const isMine = (id: string) => ownIds().some((o) => sameActor(id, o));

  // ── czy to NASZA wiadomość? ────────────────────────────────────────────────────
  // Własne wiadomości (agent przez API, człowiek z telefonu) też przychodzą jako message_received.
  // 2026-09-25: na Instagramie id nadawcy własnych wiadomości ≠ id konta → agent brał własne odpowiedzi
  // za klienta i odpowiadał sam sobie w kółko. Dlatego kilka niezależnych dowodów, nie jedno porównanie id.
  let own = body.is_sender === true || body.is_sender === 1 || isMine(senderId);
  let learn = false;
  if (!own && (await isOurOwnMessage(chatId, messageId, text))) own = learn = true; // nasz ślad wysyłki
  let chatOther = "";
  if (!own) {
    // rozmowa 1:1: drugą stroną jest attendee czatu; ktokolwiek inny pisze z naszego konta
    chatOther = await uniChatOther(chatId);
    if (chatOther && !sameActor(senderId, chatOther)) own = learn = true;
  }
  if (own && learn && senderId && !isMine(senderId)) await learnOwnId(acc, senderId);

  // grupy: doradca w grupie rodzinnej klienta to katastrofa — odpowiadamy tylko 1:1
  const attendees = (body.attendees ?? []) as Record<string, unknown>[];
  const others = attendees.filter((a) => {
    const id = String(a.attendee_provider_id ?? "");
    return id && !isMine(id);
  });
  if (body.is_group === true || others.length > 1) return;
  // nasza wysyłka → cisza; wiadomość człowieka z tego konta → przejęcie rozmowy (agent milknie)
  if (own) {
    if (await seenBefore(acc.project_id, `uni:${messageId || `${chatId}:${body.timestamp ?? ""}`}`)) return;
    const other = String(others[0]?.attendee_provider_id ?? "") || chatOther;
    await handleHumanTakeover(acc, chatId, messageId, text, other);
    return;
  }
  if (await seenBefore(acc.project_id, `uni:${messageId || `${chatId}:${body.timestamp ?? ""}`}`)) return;

  // reakcje („Liked a message"), zdarzenia systemowe — to nie pytanie klienta, nikt na nie nie odpowiada
  if (body.is_event === true || body.is_event === 1 || REACTION_RE.test(text)) {
    await logEvent(acc.project_id, "uni_skip", { provider, chat_id: chatId, reason: "reakcja/zdarzenie" });
    return;
  }
  // bezpiecznik pętli (ostatnia linia obrony, niezależnie od rozpoznania nadawcy):
  // echo naszej wiadomości albo seria naszych odpowiedzi w tym czacie = nie odpowiadamy
  if (await uniEchoOrLoop(acc, chatId, text)) return;

  const hasAttachments = Array.isArray(body.attachments) && (body.attachments as unknown[]).length > 0;
  const channel = PROVIDER_CHANNEL[provider] ?? "unipile";
  const muteUntil = await uniMuteUntil(chatId);

  // 1) LinkedIn: lead Łowcy → Łowca prowadzi rozmowę sam
  if (provider === "LINKEDIN") {
    const { data: hl } = await db.from("hand_leads").select("id").eq("project_id", acc.project_id).eq("li_urn", senderId).limit(1);
    if (hl?.length) {
      if (!muteUntil) await uniMarkRead(chatId, provider); // w ciszy (człowiek przejął rozmowę) nie czytamy za niego
      await forwardHand({ ...body, muted: !!muteUntil }); // przy ciszy Łowca tylko zapisze wiadomość
      return;
    }
  }
  // 2) lead Sprzedawcy
  const lead = await findSalesLead(acc, chatId, senderId);
  const salesPayload = {
    project_id: acc.project_id, lead_id: lead ? String(lead.id) : null, channel, provider,
    chat_id: chatId, account_id: accountId, sender_id: senderId, sender_name: senderName, text, message_id: messageId,
    attachments: hasAttachments, muted: !!muteUntil,
  };
  if (lead) {
    if (!muteUntil) await uniMarkRead(chatId, provider); // w ciszy (człowiek przejął rozmowę) nie czytamy za niego
    await forwardSales(salesPayload); // przy ciszy sprzedawca tylko zapisze wiadomość (bez odpowiedzi)
    return;
  }
  // cisza po przejęciu przez człowieka: doradca nie odpowiada, sprzedawca nie zakłada nowych leadów
  if (muteUntil) {
    await logEvent(acc.project_id, "uni_muted", { provider, chat_id: chatId, until: muteUntil });
    return;
  }
  // 3) doradca — kanał tego konta włączony w Integracjach
  const { data: chRows } = await db
    .from("brain_channels").select("id, public_key, enabled").eq("project_id", acc.project_id).eq("type", "unipile")
    .contains("config", { account_id: accountId }).limit(1);
  const ch = chRows?.[0];
  if (ch?.enabled) {
    if (!text) {
      // „piszę tylko tekstem" najwyżej raz na dobę w czacie — nie odpowiadamy tym samym na każde zdjęcie
      if (hasAttachments && !(await sentRecently(chatId, NO_TEXT_REPLY, 24))) await replyUni(acc, chatId, NO_TEXT_REPLY);
      return;
    }
    if (!(await uniBudgetOk(acc, chatId))) return;
    await uniMarkRead(chatId, provider); // klient od razu widzi „przeczytane"
    const reply = await askBrain(ch.public_key, text, `${channel}:${senderId}`, channel);
    if (reply) await replyUni(acc, chatId, reply, true);
    else await logEvent(acc.project_id, "no_reply", { kind: "unipile", provider, reason: "brain-chat zwrócił pusto" });
    return;
  }
  // 4) doradca wyłączony → Sprzedawca może przyjąć nowego (decyduje jego konfiguracja).
  //    LinkedIn wyjątkowo NIE: to prywatna skrzynka właściciela — odpowiadamy tam tylko
  //    leadom Łowcy/Sprzedawcy albo gdy właściciel świadomie włączył doradcę na tym koncie.
  //    I tylko wtedy, gdy sprzedawca w tym projekcie naprawdę pracuje (autopilot włączony) — wyłączenie
  //    doradcy NIE może po cichu oddać skrzynki sprzedawcy, którego właściciel nie uruchomił (2026-09-25).
  const reason = !text ? "bez tekstu" : provider === "LINKEDIN" ? "linkedin bez doradcy" : !(await salesTakesNew(acc.project_id))
    ? "doradca wyłączony, sprzedawca bez autopilota" : "";
  if (!reason) {
    await uniMarkRead(chatId, provider);
    await forwardSales(salesPayload);
  }
  else await logEvent(acc.project_id, "uni_no_route", { provider, chat_id: chatId, reason });
}

const REACTION_RE = /^(liked a message|reacted .{1,12} to your message|.{0,40} reacted to your message|polubił[ao]? (twoją )?wiadomość)$/i;
const LOOP_WINDOW_MIN = 3;
const LOOP_MAX_SENT = 5;

// druga strona czatu 1:1 (attendee_provider_id z Unipile), z krótkim cache w izolacie
const chatOtherCache = new Map<string, { v: string; at: number }>();
async function uniChatOther(chatId: string): Promise<string> {
  const hit = chatOtherCache.get(chatId);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  try {
    const c = await uniFetch(`/chats/${encodeURIComponent(chatId)}`, {}, 8_000);
    const group = c.type === 1 || c.type === 2 || c.is_group === true;
    const v = group ? "" : String(c.attendee_provider_id ?? c.provider_id ?? "");
    chatOtherCache.set(chatId, { v, at: Date.now() });
    return v;
  } catch (e) {
    console.error("unipile chat lookup", String(e).slice(0, 160));
    return "";
  }
}

async function learnOwnId(acc: AccountRow, id: string) {
  const ids = [...new Set([...(acc.own_ids ?? []), id])].slice(-10);
  acc.own_ids = ids;
  const { error } = await db.from("fiq_project_accounts").update({ own_ids: ids }).eq("id", acc.id);
  if (error) console.error("learnOwnId", error.message);
  else console.log("unipile: nauczone własne id konta", acc.provider, id);
}

async function sentRecently(chatId: string, text: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count } = await db.from("brain_events").select("id", { count: "exact", head: true })
    .eq("type", "uni_sent").eq("data->>chat_id", chatId).eq("data->>t", sentKey(text)).gte("created_at", since);
  return (count ?? 0) > 0;
}

async function uniEchoOrLoop(acc: AccountRow, chatId: string, text: string): Promise<boolean> {
  const k = sentKey(text);
  if (k && k.length >= 12) {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const { count } = await db.from("brain_events").select("id", { count: "exact", head: true })
      .in("type", ["uni_sent", "uni_sending"]).eq("data->>chat_id", chatId).eq("data->>t", k).gte("created_at", dayAgo);
    if ((count ?? 0) > 0) {
      await logEvent(acc.project_id, "uni_loop_guard", { chat_id: chatId, provider: acc.provider, reason: "echo naszej wiadomości" });
      return true;
    }
  }
  const since = new Date(Date.now() - LOOP_WINDOW_MIN * 60_000).toISOString();
  const { count: sent } = await db.from("brain_events").select("id", { count: "exact", head: true })
    .eq("type", "uni_sent").eq("data->>chat_id", chatId).gte("created_at", since);
  if ((sent ?? 0) >= LOOP_MAX_SENT) {
    await logEvent(acc.project_id, "uni_loop_guard", { chat_id: chatId, provider: acc.provider, reason: `${sent} naszych wiadomości w ${LOOP_WINDOW_MIN} min` });
    return true;
  }
  return false;
}

// Sprzedawca zakłada leada z obcej wiadomości tylko wtedy, gdy w projekcie działa (autopilot) i nie wyłączył kanałów linkiem
async function salesTakesNew(projectId: string): Promise<boolean> {
  const { data } = await db.from("brain_sales").select("config").eq("project_id", projectId).maybeSingle();
  const cfg = (data?.config ?? {}) as { enabled?: boolean; channels?: { unipile?: boolean } };
  return cfg.enabled === true && cfg.channels?.unipile !== false;
}

// Stan konta (CREDENTIALS = klient wylogował / zmienił hasło, DELETED = usunięte u Unipile).
// Panel pokazuje „Podłącz ponownie", a wysyłka omija konta poza OK.
async function handleUnipileStatus(body: Record<string, unknown>) {
  const st = ((body.AccountStatus ?? body) as Record<string, unknown>);
  const accountId = String(st.account_id ?? "");
  const status = String(st.message ?? st.status ?? "").toUpperCase();
  if (!accountId || !status) return;
  const acc = await uniAccountRow(accountId);
  if (!acc) return;
  const mapped = /SUCCESS|RECONNECTED|^OK$/.test(status) ? "OK" : status;
  const now = new Date().toISOString();
  await db.from("fiq_project_accounts").update({ status: mapped, status_at: now, updated_at: now }).eq("id", acc.id);
  await logEvent(acc.project_id, "account_status", { account_id: accountId, provider: acc.provider, status });
}

// notify_url kreatora Hosted Auth: {status, account_id, name} — `name` to nasz token linku.
async function handleUnipileAuth(body: Record<string, unknown>) {
  const status = String(body.status ?? "").toUpperCase();
  const token = String(body.name ?? "");
  const accountId = String(body.account_id ?? "");
  console.log("unipile auth", status, token.slice(0, 8), accountId);
  if (!token || !accountId) return;
  const { data: linkRow } = await db.from("fiq_connect_links").select("*").eq("token", token).maybeSingle();
  if (!linkRow) {
    await logEvent(null, "uni_auth_unknown_token", { token: token.slice(0, 8), accountId });
    return;
  }
  if (!/SUCCESS|RECONNECT|CREATED/.test(status)) return;
  // szczegóły konta: typ (provider), nazwa, własny identyfikator (do odsiewania własnych wiadomości)
  let a: Record<string, unknown> = {};
  for (let i = 0; i < 3 && !a.type; i++) {
    try {
      a = await uniFetch(`/accounts/${encodeURIComponent(accountId)}`, {}, 15_000);
    } catch (e) {
      console.error("unipile account fetch", i, String(e).slice(0, 160));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const provider = String(a.type ?? "").toUpperCase();
  if (!PROVIDER_CHANNEL[provider]) {
    await logEvent(linkRow.project_id, "uni_auth_unsupported", { accountId, type: provider || "?" });
    return;
  }
  const im = ((a.connection_params ?? {}) as Record<string, Record<string, unknown>>).im ?? {};
  const name = String(a.name ?? im.username ?? "");
  const ownId = String(im.id ?? im.phone_number ?? "");
  const now = new Date().toISOString();
  const { error } = await db.from("fiq_project_accounts").upsert({
    project_id: linkRow.project_id, provider, account_id: accountId, account_name: name, provider_user_id: ownId,
    status: "OK", status_at: now, connected_at: now, link_token: token, updated_at: now,
  }, { onConflict: "account_id" });
  if (error) {
    console.error("fiq_project_accounts upsert", error.message);
    await logEvent(linkRow.project_id, "uni_auth_error", { accountId, error: error.message });
    return;
  }
  const accounts = Array.isArray(linkRow.accounts) ? (linkRow.accounts as unknown[]) : [];
  await db.from("fiq_connect_links").update({
    connected_at: now, account_id: accountId, account_name: name, updated_at: now,
    accounts: [...accounts.filter((x) => (x as Record<string, unknown>).account_id !== accountId), { account_id: accountId, provider, name, at: now }],
  }).eq("token", token);
  // Łowca czyta konto LinkedIn ze swojej konfiguracji — trzymamy ją w zgodzie
  if (provider === "LINKEDIN") {
    const { data: hc } = await db.from("hand_config").select("config").eq("project_id", linkRow.project_id).maybeSingle();
    const cfg = { ...((hc?.config ?? {}) as Record<string, unknown>), unipile_account_id: accountId };
    await db.from("hand_config").upsert({ project_id: linkRow.project_id, config: cfg, updated_at: now });
  }
  // kanał doradcy dla tego konta: WhatsApp/Instagram/Messenger/Telegram od razu włączony,
  // LinkedIn WYŁĄCZONY — to prywatna skrzynka właściciela, a leady LinkedIn prowadzi Łowca
  const { data: existing } = await db.from("brain_channels").select("id").eq("project_id", linkRow.project_id).eq("type", "unipile")
    .contains("config", { account_id: accountId }).limit(1);
  if (!existing?.length) {
    await db.from("brain_channels").insert({
      project_id: linkRow.project_id, type: "unipile", name: `${PROVIDER_LABEL[provider]} · ${name || accountId}`,
      enabled: provider !== "LINKEDIN", config: { account_id: accountId, provider },
    });
  }
  await db.from("brain_settings").delete().eq("key", "unipile_status");
  await logEvent(linkRow.project_id, "account_connected", { account_id: accountId, provider, name });
  console.log("konto podłączone", linkRow.project_id, provider, accountId, name);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const hook = url.searchParams.get("hook") ?? "";
  // ── Meta polling (pg_cron co minutę; w jednym wywołaniu trzy przebiegi co ~18 s) ──
  if (hook === "meta-poll") {
    const key = req.headers.get("x-poll-key") ?? url.searchParams.get("key") ?? "";
    if (!META_POLL_KEY || key !== META_POLL_KEY) return new Response("forbidden", { status: 403 });
    const work = (async () => {
      // 5 przebiegów co ~11 s: „wyświetlono" i kropki pojawiają się najpóźniej po kilkunastu sekundach.
      // Nakładanie się z następnym wywołaniem crona jest bezpieczne — wiadomości deduplikuje `seenBefore`.
      for (let i = 0; i < 5; i++) {
        try {
          await pollMetaOnce();
        } catch (e) {
          console.error("meta poll run error", String(e).slice(0, 200));
        }
        if (i < 4) await new Promise((r) => setTimeout(r, 11_000));
      }
    })();
    // @ts-ignore EdgeRuntime dostępny w środowisku Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // ── Unipile (klucz w query, bo notify_url kreatora nie umie nagłówków) ──
  if (hook.startsWith("unipile")) {
    const key = url.searchParams.get("key") ?? req.headers.get("x-hook-key") ?? "";
    if (!UNI_HOOK_KEY || key !== UNI_HOOK_KEY) return new Response("forbidden", { status: 403 });
    if (req.method !== "POST") return new Response("method", { status: 405 });
    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    console.log(`${hook} in:`, raw.slice(0, 1200));
    const work = (async () => {
      try {
        if (hook === "unipile") await handleUnipileMessage(body);
        else if (hook === "unipile-status") await handleUnipileStatus(body);
        else if (hook === "unipile-auth") await handleUnipileAuth(body);
      } catch (e) {
        console.error("unipile hook error", e);
        await logEvent(null, "hook_error", { hook, error: String(e).slice(0, 300) });
      }
    })();
    // @ts-ignore EdgeRuntime dostępny w środowisku Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Weryfikacja Meta: GET z hub.mode/hub.verify_token/hub.challenge
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token) {
      // token na poziomie APLIKACJI (jedna aplikacja Meta „Infinitiq" dla wszystkich klientów —
      // strony podpinają się przez OAuth) albo stary token z konfiguracji kanału
      const appToken = Deno.env.get("META_VERIFY_TOKEN") ?? "";
      if (appToken && token === appToken) return new Response(challenge, { status: 200 });
      const ch = await findChannel("verify_token", token);
      if (ch) return new Response(challenge, { status: 200 });
      console.error("hook: weryfikacja odrzucona — nieznany verify_token");
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  // pierwsze podłączenie kanałów debuguje się wyłącznie po logach — zostawiamy skrót payloadu
  console.log("hook in:", raw.slice(0, 1200));

  // Meta wymaga szybkiego 200 — przetwarzanie w tle
  const work = (async () => {
    try {
      const object = String(body.object ?? "");
      if (object === "whatsapp_business_account") await handleWhatsApp(body, raw, sig);
      else if (object === "instagram") await handleMessengerLike(body, "instagram", raw, sig);
      else if (object === "page") await handleMessengerLike(body, "facebook", raw, sig);
      else await logEvent(null, "hook_unknown_object", { object });
    } catch (e) {
      console.error("brain-hook error", e);
      await logEvent(null, "hook_error", { error: String(e) });
    }
  })();
  // @ts-ignore EdgeRuntime dostępny w środowisku Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;

  return new Response("EVENT_RECEIVED", { status: 200 });
});
