// brain-hook — webhook Meta (Messenger / Instagram DM / WhatsApp Cloud API).
// GET  = weryfikacja subskrypcji (hub.challenge, verify_token z configu kanału)
// POST = przyjęcie wiadomości → brain-chat (stream:false) → odpowiedź przez Graph API.
// Kanał znajdywany po page_id / ig_id / phone_number_id zapisanych w brain_channels.config.
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

async function askBrain(publicKey: string, text: string, visitorId: string): Promise<string> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: publicKey, message: text, visitor_id: visitorId, stream: false }),
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
      const text = String(msg.text ?? "").trim();
      if (!text) {
        // zdjęcie/naklejka/głosówka — bez tego bot po prostu milczy i wygląda na zepsutego
        await sendMessenger(ch, senderId, NO_TEXT_REPLY);
        continue;
      }
      const reply = await askBrain(ch.public_key, text, `${kind}:${senderId}`);
      if (reply) await sendMessenger(ch, senderId, reply);
      else await logEvent(ch.project_id, "no_reply", { kind, reason: "brain-chat zwrócił pusto" });
    }
  }
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
        if (m.type !== "text") {
          await sendWhatsApp(ch, phoneNumberId, from, NO_TEXT_REPLY);
          continue;
        }
        const text = String((m.text as Record<string, unknown>)?.body ?? "").trim();
        if (!text) continue;
        const reply = await askBrain(ch.public_key, text, `wa:${from}`);
        if (reply) await sendWhatsApp(ch, phoneNumberId, from, reply);
        else await logEvent(ch.project_id, "no_reply", { kind: "whatsapp", reason: "brain-chat zwrócił pusto" });
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Weryfikacja Meta: GET z hub.mode/hub.verify_token/hub.challenge
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token) {
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
