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
    .select("expires_at, brain_users(id, login, display_name, role, workspace_id, disabled)")
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
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
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

// ── maskowanie sekretów w odpowiedziach do panelu ───────────────────────────
const SECRET_MASK = "••••";
const SALES_SECRET_PATHS = [["email", "resend_key"], ["whatsapp", "wa_token"]];
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
    // ── login (bez sesji) ────────────────────────────────────────────────
    if (action === "login") {
      const login = String(body.login || "").trim();
      const password = String(body.password || "");
      const { data: u } = await db
        .from("brain_users")
        .select("id, login, display_name, role, workspace_id, pass_hash, disabled")
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
        user: { id: u.id, login: u.login, display_name: u.display_name, role: u.role, workspace_id: u.workspace_id },
      });
    }

    const user = await getUser(body.token as string | undefined);
    if (!user) return J({ error: "auth" }, 401);
    const admin = user.role === "admin";

    switch (action) {
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
        return J({ projects: data ?? [] });
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

      // ── users (admin only) ────────────────────────────────────────────
      case "users.list": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db
          .from("brain_users")
          .select("id, login, display_name, role, workspace_id, disabled, created_at, last_login_at")
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
          .select("id, login, display_name, role, workspace_id, disabled")
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
            .select("id, product_id, type, title, content, url, file_path, chars, sort, created_at, updated_at")
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
        for (const k of ["name", "description", "buy_url", "sales_name", "sales_phone", "sort"]) {
          if (body[k] !== undefined) patch[k] = body[k];
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
          row.content = await fetchUrlText(url); // treść strony = wiedza
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
        return J({ item: data });
      }
      case "kb.update": {
        const { data: it } = await db.from("brain_kb_items").select("project_id").eq("id", body.id as string).maybeSingle();
        if (!it) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["title", "content", "sort", "product_id"]) if (body[k] !== undefined) patch[k] = body[k];
        if (patch.content !== undefined) patch.chars = String(patch.content).length;
        await db.from("brain_kb_items").update(patch).eq("id", body.id as string);
        return J({ ok: true });
      }
      case "kb.refresh": {
        // ponowne pobranie treści z URL
        const { data: it } = await db.from("brain_kb_items").select("project_id, url").eq("id", body.id as string).maybeSingle();
        if (!it || !it.url) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        const content = await fetchUrlText(it.url);
        await db
          .from("brain_kb_items")
          .update({ content, chars: content.length, updated_at: new Date().toISOString() })
          .eq("id", body.id as string);
        return J({ ok: true, chars: content.length });
      }
      case "kb.delete": {
        const { data: it } = await db
          .from("brain_kb_items")
          .select("project_id, file_path")
          .eq("id", body.id as string)
          .maybeSingle();
        if (!it) return J({ error: "not found" }, 404);
        await assertProject(user, it.project_id);
        if (it.file_path) await db.storage.from("brain-kb").remove([it.file_path]);
        await db.from("brain_kb_items").delete().eq("id", body.id as string);
        return J({ ok: true });
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
        return J({ leads: leads ?? [], messages: msgs ?? [] });
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

      // ── ustawienia globalne (provider AI) ─────────────────────────────
      case "settings.get": {
        if (!admin) return J({ error: "forbidden" }, 403);
        const { data } = await db.from("brain_settings").select("key, value");
        return J({ settings: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) });
      }
      case "settings.set": {
        if (!admin) return J({ error: "forbidden" }, 403);
        await db
          .from("brain_settings")
          .upsert({ key: String(body.key), value: body.value ?? {}, updated_at: new Date().toISOString() });
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

      case "stats": {
        const pid = String(body.project_id || "");
        await assertProject(user, pid);
        const days = Math.min(Number(body.days) || 30, 90);
        const since = new Date(Date.now() - days * 864e5).toISOString();
        const chFilter = body.channel_type ? String(body.channel_type) : null;

        let cq = db
          .from("brain_conversations")
          .select("id, channel_type, status, started_at, last_at")
          .eq("project_id", pid)
          .gte("started_at", since);
        if (chFilter) cq = cq.eq("channel_type", chFilter);
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
        return J({ conversations: convs ?? [], messages: msgs });
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
