// brain-hook — webhook Meta (Messenger / Instagram DM / WhatsApp Cloud API).
// GET  = weryfikacja subskrypcji (hub.challenge, verify_token z configu kanału)
// POST = przyjęcie wiadomości → brain-chat (stream:false) → odpowiedź przez Graph API.
// Kanał znajdywany po page_id / ig_id / phone_number_id zapisanych w brain_channels.config.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const GRAPH = "https://graph.facebook.com/v21.0";

type ChannelRow = {
  id: string;
  project_id: string;
  type: string;
  public_key: string;
  enabled: boolean;
  config: Record<string, string>;
};

async function findChannel(field: string, value: string): Promise<ChannelRow | null> {
  const { data } = await db
    .from("brain_channels")
    .select("id, project_id, type, public_key, enabled, config")
    .contains("config", { [field]: value })
    .limit(1);
  const ch = data?.[0] as ChannelRow | undefined;
  return ch && ch.enabled ? ch : null;
}

async function askBrain(publicKey: string, text: string, visitorId: string): Promise<string> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: publicKey, message: text, visitor_id: visitorId, stream: false }),
  });
  const data = await r.json();
  return data?.reply ?? "";
}

async function logEvent(projectId: string | null, type: string, data: Record<string, unknown>) {
  try {
    await db.from("brain_events").insert({ project_id: projectId, type, data });
  } catch {
    /* logging nie może wywalić webhooka */
  }
}

// ── wysyłka odpowiedzi ────────────────────────────────────────────────────
async function sendMessenger(pageToken: string, recipientId: string, text: string) {
  await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, messaging_type: "RESPONSE" }),
  });
}

async function sendWhatsApp(token: string, phoneNumberId: string, to: string, text: string) {
  await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

// ── obsługa payloadów ─────────────────────────────────────────────────────
async function handleMessengerLike(bodyObj: Record<string, unknown>, kind: "facebook" | "instagram") {
  const entries = (bodyObj.entry ?? []) as Record<string, unknown>[];
  for (const entry of entries) {
    const pageId = String(entry.id ?? "");
    const events = (entry.messaging ?? []) as Record<string, unknown>[];
    for (const ev of events) {
      const msg = ev.message as Record<string, unknown> | undefined;
      const senderId = String((ev.sender as Record<string, unknown>)?.id ?? "");
      if (!msg || msg.is_echo || !msg.text || !senderId) continue;
      const field = kind === "instagram" ? "ig_id" : "page_id";
      const ch = (await findChannel(field, pageId)) ?? (await findChannel("page_id", pageId));
      if (!ch) {
        await logEvent(null, "hook_unmatched", { kind, pageId });
        continue;
      }
      const reply = await askBrain(ch.public_key, String(msg.text), `${kind}:${senderId}`);
      if (reply) await sendMessenger(ch.config.page_token ?? "", senderId, reply);
    }
  }
}

async function handleWhatsApp(bodyObj: Record<string, unknown>) {
  const entries = (bodyObj.entry ?? []) as Record<string, unknown>[];
  for (const entry of entries) {
    for (const change of (entry.changes ?? []) as Record<string, unknown>[]) {
      const value = change.value as Record<string, unknown> | undefined;
      const phoneNumberId = String(
        (value?.metadata as Record<string, unknown>)?.phone_number_id ?? "",
      );
      for (const m of (value?.messages ?? []) as Record<string, unknown>[]) {
        if (m.type !== "text") continue;
        const from = String(m.from ?? "");
        const text = String((m.text as Record<string, unknown>)?.body ?? "");
        if (!from || !text) continue;
        const ch = await findChannel("phone_number_id", phoneNumberId);
        if (!ch) {
          await logEvent(null, "hook_unmatched", { kind: "whatsapp", phoneNumberId });
          continue;
        }
        const reply = await askBrain(ch.public_key, text, `wa:${from}`);
        if (reply) await sendWhatsApp(ch.config.wa_token ?? "", phoneNumberId, from, reply);
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
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Meta wymaga szybkiego 200 — przetwarzanie w tle
  const work = (async () => {
    try {
      const object = String(body.object ?? "");
      if (object === "whatsapp_business_account") await handleWhatsApp(body);
      else if (object === "instagram") await handleMessengerLike(body, "instagram");
      else if (object === "page") await handleMessengerLike(body, "facebook");
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
