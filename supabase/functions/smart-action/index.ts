// send-email: lets Mila (admin only) send an email from mila@milabrown.pro through Resend.
// Needs the secret RESEND_API_KEY (Edge Functions -> Secrets).
import { createClient } from "npm:@supabase/supabase-js@2";

const FROM = "Mila Brown <mila@milabrown.pro>";
const REPLY_TO = "mila@milabrown.pro";
const COPY_TO = "milabrown.pro@gmail.com"; // Mila gets a copy (CC) when "CC me" is ticked
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Turn web addresses into buttons/links (a booking link becomes a "Choose a time" button)
function linkify(html: string) {
  return html.replace(/https?:\/\/[^\s<]+/g, (u) => /mindbodyonline\.com\/book|milabrown\.pro\/\?service=/.test(u)
    ? `<a href="${u}" target="_blank" style="display:inline-block;margin:4px 0;padding:13px 28px;border-radius:999px;background:#5b4b88;color:#faf2dd;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;text-decoration:none">Choose a time</a>`
    : `<a href="${u}" target="_blank" style="color:#5b4b88">${u}</a>`);
}

// Formatted messages from the admin editor: keep only simple, safe formatting
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "br", "p", "div", "span", "font", "a", "ul", "ol", "li", "h3", "blockquote"]);
const FONTS: Record<string, string> = { serif: "'Cormorant Garamond',Georgia,'Times New Roman',serif", sans: "'Jost',Helvetica,Arial,sans-serif" };
function cleanStyle(st: string) {
  const out: string[] = [];
  for (const part of st.split(";")) {
    const [k, ...v] = part.split(":"); const key = (k || "").trim().toLowerCase(), val = v.join(":").trim();
    if (!val || /url\(|expression|javascript/i.test(val)) continue;
    if (key === "color" && /^(#[0-9a-f]{3,6}|rgb\([\d,\s.]+\))$/i.test(val)) out.push(`color:${val}`);
    if (key === "font-size" && /^\d{1,2}(px|pt|em|rem)$|^(small|medium|large|x-large)$/i.test(val)) out.push(`font-size:${val}`);
    if (key === "font-weight" && /^(bold|[4-9]00)$/.test(val)) out.push(`font-weight:${val}`);
    if (key === "font-style" && val === "italic") out.push("font-style:italic");
    if (key === "text-decoration" && /underline/.test(val)) out.push("text-decoration:underline");
    if (key === "text-align" && /^(left|center|right)$/.test(val)) out.push(`text-align:${val}`);
    if (key === "font-family") out.push(`font-family:${/garamond|georgia|serif/i.test(val) && !/sans/i.test(val) ? FONTS.serif : FONTS.sans}`);
  }
  return out.join(";");
}
const SIZES: Record<string, string> = { "1": "12px", "2": "14px", "3": "16px", "4": "18px", "5": "22px", "6": "28px", "7": "34px" };
function sanitize(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|svg|math|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, name: string, attrs: string) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return "";
      if (tag.startsWith("</")) return n === "font" ? "</span>" : `</${n}>`;
      const get = (a: string) => { const m = attrs.match(new RegExp(`\\s${a}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")); return m ? (m[2] ?? m[3] ?? m[4] ?? "") : ""; };
      let style = cleanStyle(get("style"));
      if (n === "font") {
        const extra = [get("color") && /^#[0-9a-f]{3,6}$/i.test(get("color")) ? `color:${get("color")}` : "", SIZES[get("size")] ? `font-size:${SIZES[get("size")]}` : "", get("face") ? cleanStyle(`font-family:${get("face")}`) : ""].filter(Boolean).join(";");
        return `<span style="${[style, extra].filter(Boolean).join(";")}">`;
      }
      if (n === "a") { const href = get("href"); return /^(https?:|mailto:)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}">` : "<a>"; }
      if (n === "br") return "<br>";
      return style ? `<${n} style="${style}">` : `<${n}>`;
    });
}
// Turn bare web addresses in the text (not already links) into links
function linkifyHtml(html: string) {
  let inA = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith("<")) { if (/^<a[\s>]/i.test(part)) inA++; else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1); return part; }
    return inA ? part : part.replace(/https?:\/\/[^\s<"]+/g, (u) => `<a href="${u}">${u}</a>`);
  }).join("");
}
// Style links: a Mindbody booking link becomes a "Choose a time" button
function styleLinks(html: string) {
  return html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, href: string, text: string) => /mindbodyonline\.com\/book|milabrown\.pro\/\?service=/.test(href)
    ? `<a href="${href}" target="_blank" style="display:inline-block;margin:4px 0;padding:13px 28px;border-radius:999px;background:#5b4b88;color:#faf2dd;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;text-decoration:none">${/^https?:/.test(text.trim()) ? "Choose a time" : text}</a>`
    : `<a href="${href}" target="_blank" style="color:#5b4b88">${text}</a>`);
}

function page(message: string, subject: string, html?: string) {
  const paras = html
    ? `<div style="font-size:16px;line-height:1.7;color:#4a4458">${styleLinks(linkifyHtml(sanitize(html))).replace(/<p>/g, '<p style="margin:0 0 16px">').replace(/<ul>/g, '<ul style="margin:0 0 16px;padding-left:22px">').replace(/<ol>/g, '<ol style="margin:0 0 16px;padding-left:22px">')}</div>`
    : esc(message).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a4458">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1eef0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1eef0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td align="center" bgcolor="#2e2552" style="background:#2e2552;background-image:linear-gradient(160deg,#3d3168,#241d40 60%,#1d3540);border-radius:22px 22px 0 0;padding:26px 24px 22px">
<p style="margin:0;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:4px;color:#faf2dd">MILA BROWN</p>
<p style="margin:12px auto 0;width:50px;height:1px;line-height:1px;font-size:1px;background:#d9b56a">&nbsp;</p>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:32px 34px 14px;font-family:'Jost',Helvetica,Arial,sans-serif">${paras}
<p style="margin:22px 0 0;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:24px;color:#5b4b88">With warmth, Mila</p>
</td></tr>
<tr><td bgcolor="#faf2dd" style="background:#faf2dd;border-radius:0 0 22px 22px;padding:18px 34px 20px;font-family:'Jost',Helvetica,Arial,sans-serif">
<p style="margin:0;font-size:12px;line-height:1.7;color:#8a8296">Mila Brown · North Raleigh, NC · <a href="https://milabrown.pro" style="color:#5b4b88">milabrown.pro</a> · <a href="https://portal.milabrown.pro" style="color:#5b4b88">Serene Portal</a><br>Just reply to this email to write back.</p>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Check that the caller is signed in and is the admin (service key stays on the server)
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Please sign in to the admin again." }, 401);
    const { data: adm } = await sb.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!adm) return json({ error: "Only the admin can send emails." }, 403);

    const { to, name, subject, message, inquiry_id, html, cc } = await req.json();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to || "")) return json({ error: "The email address looks wrong." }, 400);
    if (!subject || !message) return json({ error: "Subject and message are required." }, 400);

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ error: "RESEND_API_KEY secret is missing in Supabase" }, 500);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [name ? `${String(name).replace(/[<>",]/g, "")} <${to}>` : to], reply_to: REPLY_TO,
        ...(cc && String(to).toLowerCase() !== COPY_TO ? { cc: [COPY_TO] } : {}),
        subject: String(subject).slice(0, 200), html: page(String(message), String(subject), html ? String(html).slice(0, 60000) : undefined), text: String(message) + "\n\nWith warmth, Mila\nmilabrown.pro",
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: out.message || `Resend error ${r.status}` }, 502);

    const { data: log } = await sb.from("email_log").insert({
      to_email: to, to_name: name || null, subject, body: message, inquiry_id: inquiry_id ? String(inquiry_id) : null, resend_id: out.id || null,
    }).select().single();
    return json({ ok: true, id: out.id, log });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
