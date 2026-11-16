/* Sanctuary · shared setup for the client portal and the admin page */
window.S = (function () {
  // Publishable key: designed to be public. Row Level Security in Supabase decides what each person can see.
  const SB_URL = "https://sldavkemqnsruvgghnbm.supabase.co";
  const SB_KEY = "sb_publishable_CqLtNh6mFW-VVRP0P23_jA_D-UUrkVr";

  // Anywhere except the real site (e.g. a preview) runs on sample data, with no login and no network.
  const DEMO = !/(^|\.)milabrown\.pro$/.test(location.hostname);
  const sb = !DEMO && window.supabase ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Interface language: saved per device until the client's profile loads
  let lang = "en";
  try { lang = localStorage.getItem("sanctuary-lang") || ((navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "en"); } catch (e) {}
  if (lang !== "ru") lang = "en";
  function setLang(l) { lang = l === "ru" ? "ru" : "en"; document.documentElement.lang = lang; try { localStorage.setItem("sanctuary-lang", lang); } catch (e) {} }
  setLang(lang);
  const getLang = () => lang;
  const fmtDate = (d) => {
    if (!d) return "";
    const x = new Date(d + (d.length === 10 ? "T12:00:00" : ""));
    return isNaN(x) ? esc(d) : x.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const today = () => new Date().toISOString().slice(0, 10);

  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  async function fileUrl(bucket, path) {
    if (!path) return null;
    if (DEMO) return "#";
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (error) { toast(lang === "ru" ? "Не удалось открыть файл. Попробуйте ещё раз." : "Couldn't open the file. Please try again."); return null; }
    return data.signedUrl;
  }

  // Flower of Life in thin gold lines
  function flower(cls) {
    const r = 40, c = [[0, 0]];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3, b = a + Math.PI / 6;
      c.push([r * Math.cos(a), r * Math.sin(a)], [2 * r * Math.cos(a), 2 * r * Math.sin(a)], [r * Math.sqrt(3) * Math.cos(b), r * Math.sqrt(3) * Math.sin(b)]);
    }
    return `<svg class="${cls || "flower"}" viewBox="-130 -130 260 260" aria-hidden="true"><g fill="none" stroke="#d9b56a" stroke-width=".7">${c
      .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`).join("")}<circle r="120"/></g></svg>`;
  }

  // Login with a one-time email link. Only people Mila has invited can sign in.
  async function sendLink(email) {
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
    });
    if (!error) return { ok: true };
    const m = (error.message || "").toLowerCase();
    const ru = lang === "ru";
    if (m.includes("signup") || m.includes("not found") || m.includes("not allowed"))
      return { ok: false, msg: ru ? "Этот email ещё не зарегистрирован. Напишите Миле, чтобы она добавила вас." : "This email isn't registered yet. Please message Mila so she can add you." };
    if (m.includes("rate") || m.includes("seconds"))
      return { ok: false, msg: ru ? "Ссылка только что отправлена. Подождите минуту, прежде чем запросить новую." : "A link was just sent. Please wait a minute before asking for another." };
    return { ok: false, msg: ru ? "Не удалось отправить ссылку. Проверьте адрес и попробуйте снова." : "We couldn't send the link. Check the email address and try again." };
  }

  // ---------- Sample data for previews ----------
  const DEMO_DATA = {
    profile: { id: "demo", email: "anna@example.com", full_name: "Anna Example", phone: "", language: "en", contact_pref: "email" },
    modalities: [
      ["Sound Healing Bath", "Senses", "Tibetan singing bowls and gongs that carry the body into deep rest.", "60 min", "$111"],
      ["Jyotish · Vedic Astrology", "Insight", "Personal birth charts and consultations for the chapter you are in.", "90 min", ""],
      ["Kundalini Yoga", "Body", "Movement, breath and mantra to wake up your energy. Classes in North Raleigh and online.", "", ""],
      ["Ayurveda", "Body", "Food, rhythm and daily rituals matched to your constitution.", "", ""],
      ["Coaching & Mentorship", "Guidance", "Guidance and support for your life and your business.", "", ""],
      ["Sacred Geometry", "Art & symbol", "Drawing timeless patterns as a practice of focus and art therapy.", "", ""],
      ["VedaPulse Diagnostics", "Insight", "A pulse reading that shows the current state of your body and doshas.", "", ""],
      ["Breathwork & Pranayama", "Breath & Mind", "Breath patterns that calm or energize the nervous system.", "", ""],
    ].map(([title, category, description, duration, price], i) => ({ id: "m" + i, title, category, description, duration, price, booking_url: "https://milabrown.pro/#contact", sort: i, active: true })),
    library: [
      { id: "l1", kind: "mantra", title: "Ong Namo Guru Dev Namo", description: "Adi mantra to tune in before practice. Chant 3 times.", body: "Ong Namo Guru Dev Namo\nI bow to the subtle divine wisdom,\nthe divine teacher within." },
      { id: "l2", kind: "pdf", title: "Daily Ayurvedic routine (Dinacharya)", description: "A one-page morning and evening rhythm.", file_path: "dinacharya.pdf" },
      { id: "l3", kind: "webinar", title: "Webinar: Calming the nervous system", description: "Recording, 58 minutes.", url: "https://example.com" },
      { id: "l4", kind: "audio", title: "Sound bath, 20-minute recording", description: "Use headphones, lying down.", file_path: "soundbath.mp3" },
      { id: "l5", kind: "mantra", title: "Sat Nam", description: "Truth is my identity. Breathe in Sat, breathe out Nam.", body: "Sat Nam" },
    ],
    services: [
      { id: "s1", modality: "VedaPulse Diagnostics", service_date: "2026-09-12", notes: "Vata elevated, Pitta balanced. Start the 3-phase protocol." },
      { id: "s2", modality: "Sound Healing Bath", service_date: "2026-10-03", notes: "Deep rest. Continue evening breathwork." },
      { id: "s3", modality: "Jyotish · Vedic Astrology", service_date: "2026-10-24", notes: "Birth chart reading. Notes sent by email." },
    ],
    protocols: [
      { id: "p1", title: "Nervous system reset", phase: "Phase 1 · Stabilize", start_date: "2026-09-15", status: "active",
        summary: "Four weeks to settle Vata: warm regular meals, earlier sleep, daily grounding practice.", file_path: "demo/protocol.pdf",
        protocol_tasks: [
          { id: "t1", text: "Warm water with ginger on waking", done: true, sort: 1 },
          { id: "t2", text: "Abhyanga (oil self-massage) 3× a week", done: true, sort: 2 },
          { id: "t3", text: "Dinner before 7 pm", done: false, sort: 3 },
          { id: "t4", text: "Nadi Shodhana breathing, 5 minutes before bed", done: false, sort: 4 },
        ] },
      { id: "p2", title: "Gut restoration", phase: "Completed", start_date: "2026-06-01", status: "completed",
        summary: "Eight-week digestive protocol.", file_path: null, protocol_tasks: [] },
    ],
    attendance: [
      { id: "a1", title: "“I AM” Full-day Immersion", attended_on: "2026-08-22", status: "attended", notes: "Sound bath, Kundalini, infrared sauna, Ayurvedic lunch." },
    ],
    retreats: [
      { id: "r1", title: "“I AM” Individual Retreat", location: "North Raleigh, NC", format: "Private 1:1 or 1:2 · half-day or full-day", price: "Half-day from $222 · Full-day from $444",
        description: "A personalized journey of reset, alignment and inner expansion.", signup_url: "https://retreat.milabrown.pro", published: true },
    ],
  };

  return { DEMO, sb, esc, fmtDate, today, toast, fileUrl, flower, sendLink, DEMO_DATA, setLang, getLang };
})();
