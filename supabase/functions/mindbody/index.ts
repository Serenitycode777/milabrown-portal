// mindbody: online booking for milabrown.pro, the Serene Portal and the admin, straight into Mindbody.
// Clients pick a session and an open time; the function finds (or creates) them in Mindbody and books it.
// No Mindbody login is needed by the client.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   MB_API_KEY      API key from the Mindbody developer portal
//   MB_SITE_ID      -99 for the free Sandbox, 5751575 for Serenity World
//   MB_STAFF_USER   Mindbody staff login the website books with
//   MB_STAFF_PASS   its password
//   optional: MB_STAFF_ID (default 3 = Mila Brown), MB_LOCATION_ID (default 1)
// Deploy with "Verify JWT" OFF: anyone may see times and book; the admin is recognised by her sign-in token.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.mindbodyonline.com/public/v6";
const TZ = "America/New_York"; // North Raleigh
const SERVICES: Record<number, { name: string; min: number }> = {
  8: { name: "Discovery Call", min: 20 },
  11: { name: "Ayurveda Consultation", min: 60 },
  12: { name: "Jyotish · Vedic Astrology Reading", min: 120 },
  13: { name: "VedaPulse Diagnostics · Express", min: 45 },
  15: { name: "VedaPulse Diagnostics · Full", min: 90 },
  14: { name: "Coaching & Mentorship", min: 60 },
  16: { name: "Sound Healing Bath · Private Session", min: 60 },
};
const LEAD_HOURS = 72;      // clients book at least 72 hours ahead
const ADMIN_LEAD_HOURS = 1; // Mila can book almost anything
const STEP_MIN = 30;        // start times every 30 minutes
const MAX_DAYS = 31;
const UA = "MilaBrownBooking/1.0"; // Mindbody asks apps to name themselves
const MAX_PER_EMAIL = 3;  // online bookings per email per 24 hours (protects the calendar from spam)
const MAX_PER_IP = 5;     // online bookings per internet address per 24 hours

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class Oops extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const env = (k: string, d = "") => (Deno.env.get(k) ?? d).trim();
const SITE = () => env("MB_SITE_ID");
const SANDBOX = () => SITE() === "-99";
const STAFF_ID = () => Number(env("MB_STAFF_ID", "3"));
const LOCATION_ID = () => Number(env("MB_LOCATION_ID", "1"));

// ---- times are "site local" strings like 2026-11-24T09:00:00 (Mindbody sends them without a zone) ----
const toMs = (s: string) => Date.parse(s.slice(0, 19) + "Z");
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 19);
function siteNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
}

// ---- Mindbody calls (the staff token is kept for a few hours and renewed when needed) ----
let token: { v: string; until: number } | null = null;
async function staffToken(force = false) {
  if (!force && token && token.until > Date.now()) return token.v;
  const r = await fetch(`${API}/usertoken/issue`, {
    method: "POST",
    headers: { "Api-Key": env("MB_API_KEY"), SiteId: SITE(), "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ Username: env("MB_STAFF_USER"), Password: env("MB_STAFF_PASS") }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.AccessToken) throw new Oops("Mindbody didn't accept the staff login: " + mbErr(out, r.status), 502);
  token = { v: out.AccessToken, until: Date.now() + 5 * 3600e3 };
  return token.v;
}
const mbErr = (out: any, status: number) => out?.Error?.Message || out?.Message || `error ${status}`;
async function mb(path: string, opts: { method?: string; query?: Record<string, string | number | (string | number)[]>; body?: unknown } = {}, retry = true): Promise<any> {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(opts.query || {})) for (const x of Array.isArray(v) ? v : [v]) u.searchParams.append(k, String(x));
  const r = await fetch(u, {
    method: opts.method || "GET",
    headers: { "Api-Key": env("MB_API_KEY"), SiteId: SITE(), Authorization: await staffToken(), "Content-Type": "application/json", "User-Agent": UA },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (r.status === 401 && retry) { await staffToken(true); return mb(path, opts, false); }
  if (!r.ok) throw new Oops("Mindbody: " + mbErr(out, r.status), r.status === 400 ? 400 : 502);
  return out;
}

// ---- open start times for one service ----
const cache = new Map<string, { at: number; v: unknown }>();
async function openTimes(service: number, from: string, days: number, admin: boolean) {
  const start = from + "T00:00:00", end = fromMs(toMs(start) + days * 864e5 - 1000);
  const q = { "request.startDate": start, "request.endDate": end, "request.staffIds": [STAFF_ID()], "request.locationIds": [LOCATION_ID()], "request.limit": 200 };
  const [av, ap] = await Promise.all([
    mb("/appointment/bookableitems", { query: { ...q, "request.sessionTypeIds": [service] } }),
    mb("/appointment/staffappointments", { query: q }).catch(() => ({ Appointments: [] })),
  ]);
  const busy = (ap.Appointments || []).filter((a: any) => !/cancel|noshow/i.test(a.Status || ""))
    .map((a: any) => [toMs(a.StartDateTime), toMs(a.EndDateTime)]);
  const earliest = toMs(siteNow()) + (admin ? ADMIN_LEAD_HOURS : LEAD_HOURS) * 3600e3;
  const out = new Set<string>();
  for (const a of av.Availabilities || []) {
    const len = (a.SessionType && a.SessionType.DefaultTimeLength) || (SERVICES[service] && SERVICES[service].min) || 60;
    const s0 = toMs(a.StartDateTime), last = Math.min(a.BookableEndDateTime ? toMs(a.BookableEndDateTime) : Infinity, toMs(a.EndDateTime) - len * 60e3);
    for (let t = s0; t <= last; t += STEP_MIN * 60e3) {
      const e = t + len * 60e3;
      if (t < earliest || busy.some(([b0, b1]: number[]) => t < b1 && e > b0)) continue;
      out.add(fromMs(t) + "|" + fromMs(e));
    }
  }
  return [...out].sort().map((x) => { const [start, end] = x.split("|"); return { start, end }; });
}

// ---- who is calling: the admin (Mila) or anyone ----
async function isAdmin(req: Request) {
  const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!t || t.startsWith("sb_") || t.split(".").length !== 3) return false;
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: u } = await sb.auth.getUser(t);
  if (!u?.user) return false;
  const { data } = await sb.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!env("MB_API_KEY") || !SITE() || !env("MB_STAFF_USER") || !env("MB_STAFF_PASS"))
      return json({ error: "not_configured", message: "Mindbody secrets are missing in Supabase." }, 503);
    const body = await req.json().catch(() => ({}));
    const admin = await isAdmin(req);
    const service = Number(body.service);
    const known = !!SERVICES[service] || SANDBOX(); // the Sandbox has its own test services
    if (body.action === "ping") return json({ ok: true, sandbox: SANDBOX(), admin });

    // Sandbox only: list its test services and staff, to pick test values
    if (body.action === "catalog" && SANDBOX()) {
      const [st, sf] = await Promise.all([mb("/site/sessiontypes", { query: { "request.onlineOnly": "false" } }), mb("/staff/staff", { query: { "request.limit": 50 } })]);
      return json({ sessionTypes: (st.SessionTypes || []).map((x: any) => ({ id: x.Id, name: x.Name, min: x.DefaultTimeLength, type: x.Type })), staff: (sf.StaffMembers || []).map((x: any) => ({ id: x.Id, name: x.DisplayName || `${x.FirstName} ${x.LastName}` })) });
    }

    if (body.action === "times") {
      if (!known) throw new Oops("Unknown service.");
      const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from || "") ? body.from : siteNow().slice(0, 10);
      const days = Math.max(1, Math.min(MAX_DAYS, Number(body.days) || 14));
      const k = [service, from, days, admin].join(":"), hit = cache.get(k);
      if (hit && Date.now() - hit.at < 3 * 60e3) return json(hit.v);
      const v = { ok: true, tz: TZ, sandbox: SANDBOX(), slots: await openTimes(service, from, days, admin) };
      cache.set(k, { at: Date.now(), v });
      return json(v);
    }

    if (body.action === "book") {
      if (body.website) return json({ ok: true }); // hidden field filled in = a bot
      if (!known) throw new Oops("Unknown service.");
      const start = String(body.start || "").slice(0, 19);
      const first = String(body.first || "").trim().slice(0, 60), last = String(body.last || "").trim().slice(0, 60);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 120), phone = String(body.phone || "").trim().slice(0, 40);
      const note = String(body.note || "").trim().slice(0, 1000);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(start)) throw new Oops("Please choose a time.");
      if (!first || !last) throw new Oops("Please add your first and last name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Oops("The email address looks wrong.");

      // spam guard: a few online bookings per person per day (uses the bookings table if it exists)
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
      const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
      if (!admin) {
        const dayAgo = new Date(Date.now() - 864e5).toISOString();
        const byEmail = await db.from("bookings").select("id", { count: "exact", head: true }).eq("email", email).eq("by_admin", false).gte("created_at", dayAgo);
        if (!byEmail.error && (byEmail.count || 0) >= MAX_PER_EMAIL) throw new Oops("You've already booked several sessions today. Please write to me and I'll help you.", 429);
        if (ip) {
          const byIp = await db.from("bookings").select("id", { count: "exact", head: true }).eq("ip", ip).eq("by_admin", false).gte("created_at", dayAgo);
          if (!byIp.error && (byIp.count || 0) >= MAX_PER_IP) throw new Oops("Too many bookings from this connection today. Please write to me and I'll help you.", 429);
        }
      }

      // the time must still be open (no cache)
      const day = start.slice(0, 10);
      const free = await openTimes(service, day, 1, admin);
      if (!free.some((s) => s.start === start)) throw new Oops("Sorry, that time was just taken. Please choose another one.", 409);

      // find the client by email, or add them
      const found = await mb("/client/clients", { query: { "request.searchText": email, "request.limit": 20 } });
      let client = (found.Clients || []).find((c: any) => String(c.Email || "").toLowerCase() === email);
      if (!client) {
        const added = await mb("/client/addclient", { method: "POST", body: { FirstName: first, LastName: last, Email: email, MobilePhone: phone || undefined, SendAccountEmails: false } });
        client = added.Client;
      }
      if (!client?.Id) throw new Oops("Couldn't add you as a client in Mindbody.", 502);

      const made = await mb("/appointment/addappointment", { method: "POST", body: {
        ClientId: String(client.Id), LocationId: LOCATION_ID(), StaffId: STAFF_ID(), SessionTypeId: service,
        StartDateTime: start, StaffRequested: true, ApplyPayment: false, SendEmail: true,
        Notes: [note, admin ? "Booked by Mila in the admin" : "Booked online at milabrown.pro"].filter(Boolean).join("\n"),
        Test: !!(body.test && SANDBOX()),
      } });
      const a = made.Appointment || {};
      cache.clear();

      // keep a copy for the admin (if the bookings table exists)
      try {
        await db.from("bookings").insert({
          mb_appointment_id: a.Id ? String(a.Id) : null, mb_client_id: String(client.Id), service_id: service,
          service_name: (SERVICES[service] && SERVICES[service].name) || null, starts_at: start, ends_at: a.EndDateTime || null,
          first_name: first, last_name: last, email, phone: phone || null, note: note || null, by_admin: admin, sandbox: SANDBOX(), ip,
        });
      } catch (_) { /* table not created yet: booking is still made */ }

      return json({ ok: true, appointment: { id: a.Id || null, start: a.StartDateTime || start, end: a.EndDateTime || null }, sandbox: SANDBOX() });
    }

    throw new Oops("Unknown action.");
  } catch (e) {
    const err = e as Oops;
    return json({ error: err.message || String(e) }, err.status || 500);
  }
});
