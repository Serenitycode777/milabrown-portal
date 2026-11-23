/* Sanctuary · shared setup for the client portal and the admin page */
window.S = (function () {
  // Publishable key: designed to be public. Row Level Security in Supabase decides what each person can see.
  const SB_URL = "https://sldavkemqnsruvgghnbm.supabase.co";
  const SB_KEY = "sb_publishable_CqLtNh6mFW-VVRP0P23_jA_D-UUrkVr";

  // Anywhere except the real site (e.g. a preview) runs on sample data, with no login and no network.
  const DEMO = !/(^|\.)milabrown\.pro$/.test(location.hostname);
  // The admin keeps its own sign-in, so the portal and the admin open in two tabs don't wait on each other.
  const IS_ADMIN = location.pathname.startsWith("/admin");
  const sb = !DEMO && window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, {
    auth: IS_ADMIN ? { storageKey: "sanctuary-admin-auth" } : {},
  }) : null;
  // Never wait forever on the network: after `ms` the promise fails with a "timeout" error.
  const withTimeout = (p, ms = 20000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);

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
    let error;
    try {
      ({ error } = await withTimeout(sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
      })));
    } catch (e) { error = e; }
    if (!error) return { ok: true };
    const m = (error.message || "").toLowerCase();
    const ru = lang === "ru";
    if (m.includes("signup") || m.includes("not found") || m.includes("not allowed"))
      return { ok: false, msg: ru ? "Этот email ещё не зарегистрирован. Напишите Миле, чтобы она добавила вас." : "This email isn't registered yet. Please message Mila so she can add you." };
    if (m.includes("timeout") || m.includes("fetch") || m.includes("network"))
      return { ok: false, msg: ru ? "Связь медленная. Проверьте интернет и попробуйте ещё раз." : "The connection is slow. Check your internet and try again." };
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
    favs: ["l4"],
    library: [
      { id: "l1", kind: "mantra", title: "Ong Namo Guru Dev Namo", description: "Adi mantra to tune in before practice. Chant 3 times.", body: "Ong Namo Guru Dev Namo\nI bow to the subtle divine wisdom,\nthe divine teacher within." },
      { id: "l2", kind: "pdf", title: "Daily Ayurvedic routine (Dinacharya)", description: "A one-page morning and evening rhythm.", file_path: "dinacharya.pdf" },
      { id: "l3", kind: "webinar", title: "Webinar: Calming the nervous system", description: "Recording, 58 minutes.", url: "https://example.com" },
      { id: "l4", kind: "audio", title: "Sound bath, 20-minute recording", description: "Use headphones, lying down.", file_path: "soundbath.mp3" },
      { id: "l6", kind: "pdf", title: "Your birth chart", description: "Read before our next session.", file_path: "demo/birth-chart.pdf", client_ids: ["demo"], created_at: "2026-11-12T10:00:00" },
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
    articles: [
      { id: "b1", title: "Five small rituals for a calm nervous system", author: "Mila Brown", published_on: "2026-11-20", published: true, cover_path: null,
        excerpt: "Simple daily habits from Ayurveda and yoga that help the body feel safe again.",
        body: "<p>When the nervous system is tired, big changes feel impossible. Small rituals, repeated every day, are what bring it back to balance.</p><h2>1. Warm water on waking</h2><p>Start the day with a cup of warm water with a slice of ginger. It wakes up digestion gently.</p><h2>2. Oil self-massage</h2><p><b>Abhyanga</b> three times a week grounds Vata and calms the mind.</p><blockquote>The body learns safety through rhythm.</blockquote><ul><li>Eat at the same times</li><li>Go to bed before 10:30 pm</li><li>Five minutes of Nadi Shodhana before sleep</li></ul>",
        links: [{ label: "Nadi Shodhana: step by step (video)", url: "https://example.com" }, { label: "Book an Ayurveda consultation", url: "https://milabrown.pro/?service=11#book" }],
        title_ru: "Пять маленьких ритуалов для спокойной нервной системы", excerpt_ru: "Простые ежедневные привычки из аюрведы и йоги, которые помогают телу снова почувствовать себя в безопасности.",
        body_ru: "<p>Когда нервная система устала, большие перемены кажутся невозможными. Возвращают её в равновесие маленькие ритуалы, повторяемые каждый день.</p><h2>1. Тёплая вода после пробуждения</h2><p>Начните день с чашки тёплой воды с ломтиком имбиря. Она мягко пробуждает пищеварение.</p>",
        links_ru: [{ label: "Записаться на консультацию по аюрведе", url: "https://portal.milabrown.pro/?service=11#book" }] },
      { id: "b2", title: "Why your Vedic sign may differ from your Western one", author: "Mila Brown", published_on: "2026-11-05", published: true, cover_path: null,
        excerpt: "The sidereal and tropical zodiacs explained in plain words.",
        body: "<p>Western astrology follows the seasons, Jyotish follows the stars. Today they are about 24° apart.</p>", links: [{ label: "Vedic astrology page", url: "https://milabrown.pro/vedicastrology/" }] },
    ],
  };

  // Blog pictures live in the public "blog" storage bucket
  const blogImg = (path) => !path ? "" : /^(https?:|data:|blob:)/.test(path) ? path : SB_URL + "/storage/v1/object/public/blog/" + String(path).split("/").map(encodeURIComponent).join("/");

  // Article text is formatted HTML from the admin editor; keep only safe tags and attributes before showing it
  const ALLOWED = { P: [], DIV: [], BR: [], B: [], STRONG: [], I: [], EM: [], U: [], H2: [], H3: [], BLOCKQUOTE: [], UL: [], OL: [], LI: [], SPAN: [], A: ["href"], IMG: ["src", "alt"], FONT: ["color", "size", "face"], FIGURE: [], FIGCAPTION: [], HR: [] };
  function cleanHtml(html) {
    const tpl = document.createElement("template"); tpl.innerHTML = String(html || "");
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        const tag = n.tagName, ok = ALLOWED[tag];
        if (!ok) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|svg|SVG|MATH|FORM|INPUT|TEXTAREA|BUTTON)$/.test(tag)) { n.remove(); return; } walk(n); n.replaceWith(...n.childNodes); return; }
        [...n.attributes].forEach((a) => { if (!ok.includes(a.name)) n.removeAttribute(a.name); });
        if (tag === "A") { const h = n.getAttribute("href") || ""; if (!/^(https?:\/\/|mailto:)/i.test(h)) n.removeAttribute("href"); else { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); } }
        if (tag === "IMG") { const src = n.getAttribute("src") || ""; if (!/^(https:\/\/|blob:|data:image\/)/i.test(src)) { n.remove(); return; } n.setAttribute("loading", "lazy"); }
        if (tag === "FONT") { const c = n.getAttribute("color"); if (c && !/^#[0-9a-f]{3,8}$/i.test(c)) n.removeAttribute("color"); const sz = n.getAttribute("size"); if (sz && !/^[1-7]$/.test(sz)) n.removeAttribute("size"); const f = n.getAttribute("face"); if (f && !/^(Jost|Cormorant Garamond)$/.test(f)) n.removeAttribute("face"); }
        walk(n);
      });
    };
    walk(tpl.content);
    return tpl.innerHTML;
  }

  return { DEMO, sb, withTimeout, esc, fmtDate, today, toast, fileUrl, flower, sendLink, DEMO_DATA, setLang, getLang, blogImg, cleanHtml };
})();
