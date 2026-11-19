// mail-inbox: brings emails sent to hello@milabrown.pro into the admin.
// hello@milabrown.pro is delivered to the Gmail account milabrown.pro@gmail.com; only mail addressed to hello@ is copied.
// Read-only access to Gmail. Only the admin can run it. Attachments stay in Gmail (link "Open in Gmail").
// Two ways to get mail in:
//  1) push (used now): a small Google Apps Script in milabrown.pro@gmail.com sends new emails here every 10 minutes.
//     Secret INBOX_PUSH_KEY must match the script property INBOX_KEY in the Apps Script project.
//  2) pull (optional): Gmail API with secrets GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2";

const OWN = ["hello@milabrown.pro", "milabrown.pro@gmail.com"]; // mail from these is not a client reply
const MAX_BODY = 20000; // characters kept per email
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-inbox-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => (Deno.env.get(k) ?? "").trim();

async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GMAIL_CLIENT_ID"), client_secret: env("GMAIL_CLIENT_SECRET"), refresh_token: env("GMAIL_REFRESH_TOKEN"), grant_type: "refresh_token" }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.access_token) throw new Error("Google didn't accept the Gmail connection: " + (out.error_description || out.error || r.status));
  return out.access_token as string;
}
async function gmail(token: string, path: string) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + path, { headers: { Authorization: `Bearer ${token}` } });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Gmail: " + ((out.error && out.error.message) || r.status));
  return out;
}

const b64 = (s: string) => { try { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch { return ""; } };
const htmlToText = (h: string) => h
  .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, "\n\n").trim();
function bodyOf(payload: any): string {
  const parts: any[] = [];
  const walk = (p: any) => { if (!p) return; parts.push(p); (p.parts || []).forEach(walk); };
  walk(payload);
  const plain = parts.find((p) => p.mimeType === "text/plain" && p.body && p.body.data);
  if (plain) return b64(plain.body.data);
  const html = parts.find((p) => p.mimeType === "text/html" && p.body && p.body.data);
  return html ? htmlToText(b64(html.body.data)) : "";
}
// Keep the new part of a reply: cut the quoted earlier message ("On ... wrote:" and "> " lines)
function newPart(text: string) {
  const lines = text.replace(/\r/g, "").split("\n"), out: string[] = [];
  for (const l of lines) {
    if (/^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l.trim()) || /^(От|From):\s/.test(l.trim()) && out.length > 2) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  const t = out.join("\n").trim();
  return t || text.trim();
}
function parseFrom(v: string) {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim().toLowerCase() } : { name: "", email: v.trim().toLowerCase() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const body = await req.json().catch(() => ({}));

    // 1) push from the Apps Script in Gmail
    if (body.action === "push") {
      const want = env("INBOX_PUSH_KEY"), got = req.headers.get("x-inbox-key") ?? "";
      if (!want || got.length !== want.length || got !== want) return json({ error: "Wrong inbox key." }, 401);
      const msgs: any[] = Array.isArray(body.messages) ? body.messages.slice(0, 200) : [];
      const rows = msgs.map((m) => ({ m, from: parseFrom(String(m.from || "")) })).filter(({ m, from }) => m.id && !OWN.includes(from.email)).map(({ m, from }) => ({
        gmail_id: String(m.id), thread_id: m.threadId ? String(m.threadId) : null, from_email: from.email, from_name: from.name || null,
        to_email: m.to ? String(m.to).slice(0, 500) : null, subject: String(m.subject || "(no subject)").slice(0, 300),
        snippet: String(m.body || "").replace(/\s+/g, " ").slice(0, 300), body: newPart(String(m.body || "")).slice(0, MAX_BODY),
        received_at: new Date(m.date || Date.now()).toISOString(), has_attachments: !!m.attachments,
      }));
      if (!rows.length) return json({ ok: true, added: 0 });
      const { data, error } = await sb.from("email_inbox").upsert(rows, { onConflict: "gmail_id", ignoreDuplicates: true }).select("id");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, added: (data || []).length });
    }

    const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(t);
    if (!u?.user) return json({ error: "Please sign in to the admin again." }, 401);
    const { data: adm } = await sb.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!adm) return json({ error: "Only the admin can read the inbox." }, 403);
    if (!env("GMAIL_CLIENT_ID") || !env("GMAIL_CLIENT_SECRET") || !env("GMAIL_REFRESH_TOKEN"))
      return env("INBOX_PUSH_KEY") ? json({ ok: true, added: 0, mode: "push" }) : json({ error: "not_configured" }, 503);

    // Look back from the newest email already saved (first time: the last 30 days)
    const { data: last } = await sb.from("email_inbox").select("received_at").order("received_at", { ascending: false }).limit(1).maybeSingle();
    const since = last ? Math.floor(new Date(last.received_at).getTime() / 1000) - 2 * 86400 : Math.floor(Date.now() / 1000) - 30 * 86400;
    const token = await accessToken();
    const list = await gmail(token, `messages?maxResults=100&q=${encodeURIComponent(`in:inbox (to:hello@milabrown.pro OR deliveredto:hello@milabrown.pro OR cc:hello@milabrown.pro) after:${since}`)}`);
    const ids: string[] = (list.messages || []).map((m: any) => m.id);
    if (!ids.length) return json({ ok: true, added: 0 });
    const { data: have } = await sb.from("email_inbox").select("gmail_id").in("gmail_id", ids);
    const known = new Set((have || []).map((r: any) => r.gmail_id));
    let added = 0;
    for (const id of ids.filter((x) => !known.has(x)).reverse().slice(0, 40)) {
      const m = await gmail(token, `messages/${id}?format=full`);
      const h = Object.fromEntries((m.payload?.headers || []).map((x: any) => [String(x.name).toLowerCase(), x.value]));
      const from = parseFrom(h["from"] || "");
      if (OWN.includes(from.email)) continue;
      const full = bodyOf(m.payload);
      const { error } = await sb.from("email_inbox").insert({
        gmail_id: id, thread_id: m.threadId, from_email: from.email, from_name: from.name || null, to_email: h["to"] || null,
        subject: (h["subject"] || "(no subject)").slice(0, 300), snippet: (m.snippet || "").slice(0, 300),
        body: newPart(full).slice(0, MAX_BODY), received_at: new Date(Number(m.internalDate)).toISOString(),
        has_attachments: JSON.stringify(m.payload || {}).includes('"attachmentId"'),
      });
      if (!error) added++;
    }
    return json({ ok: true, added });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
