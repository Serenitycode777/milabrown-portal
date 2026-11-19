/* Mila Brown · booking form (Mindbody, without a Mindbody login)
   Used on milabrown.pro, in the Serene Portal and in the admin.
   MBBook.mount(element, { lang, admin, getToken, prefill, people, demo, onBooked })            */
(function () {
  const FN = "https://sldavkemqnsruvgghnbm.supabase.co/functions/v1/mindbody";
  const KEY = "sb_publishable_CqLtNh6mFW-VVRP0P23_jA_D-UUrkVr"; // public key, designed to be in web pages
  const WIDGET_ID = "b4745589b68";
  const SERVICES = [
    { id: 8, name: "Discovery Call", ru: "Ознакомительный звонок", min: 20, price: "free", priceRu: "бесплатно", note: "Zoom or phone", noteRu: "Zoom или телефон" },
    { id: 11, name: "Ayurveda Consultation", ru: "Консультация по аюрведе", min: 60, price: "$150" },
    { id: 12, name: "Jyotish · Vedic Astrology Reading", ru: "Джйотиш · ведическая астрология", min: 120, price: "$150" },
    { id: 13, name: "VedaPulse Diagnostics · Express", ru: "Диагностика VedaPulse · экспресс", min: 45, price: "$100" },
    { id: 15, name: "VedaPulse Diagnostics · Full", ru: "Диагностика VedaPulse · полная", min: 90, price: "$150" },
    { id: 14, name: "Coaching & Mentorship", ru: "Коучинг и менторство", min: 60, price: "$150" },
    { id: 16, name: "Sound Healing Bath · Private Session", ru: "Звуковая ванна · индивидуально", min: 60, price: "$99" },
  ];
  const T = {
    en: {
      s1: "Choose a session", s2: "Choose a day and time", s3: "Your details", s3a: "Client details", min: "min", change: "Change",
      loading: "Finding open times…", none: "No open times in the next four weeks. Please write to me and we'll find a time.",
      tz: "Times are North Raleigh (Eastern) time.", rule: "Book at least 72 hours ahead. Free cancellation up to 24 hours before.",
      ruleAdmin: "Admin: you can book from 1 hour ahead. The client gets Mindbody's confirmation email.",
      first: "First name", last: "Last name", email: "Email", phone: "Phone (optional)", note: "Anything I should know? (optional)",
      book: "Book this session", booking: "Booking…", who: "Client", whoPick: "Choose a client…", whoNew: "New person (type below)",
      doneH: "You're booked", done: (s, w) => `${s} on ${w}. A confirmation from Mindbody is on its way to your email, with a reminder before the session.`,
      doneAdmin: (s, w) => `${s} on ${w} is booked. The client gets the Mindbody confirmation by email.`,
      again: "Book another session", err: "Something went wrong. Please try again.", fill: "Please fill in your name and email.",
      fallback: "Online booking is opening soon. Meanwhile, please book here:", more: "More dates", sandbox: "TEST MODE · Mindbody Sandbox. Bookings here are not real.",
    },
    ru: {
      s1: "Выберите сессию", s2: "Выберите день и время", s3: "Ваши данные", s3a: "Данные клиента", min: "мин", change: "Изменить",
      loading: "Ищем свободное время…", none: "В ближайшие четыре недели нет свободного времени. Напишите мне, и мы подберём время.",
      tz: "Время указано по North Raleigh (восточное время США).", rule: "Запись не позже чем за 72 часа. Бесплатная отмена до 24 часов до сессии.",
      ruleAdmin: "Админ: можно записать за 1 час. Клиент получит подтверждение от Mindbody.",
      first: "Имя", last: "Фамилия", email: "Email", phone: "Телефон (необязательно)", note: "Что мне важно знать? (необязательно)",
      book: "Записаться", booking: "Записываем…", who: "Клиент", whoPick: "Выберите клиента…", whoNew: "Новый человек (введите ниже)",
      doneH: "Вы записаны", done: (s, w) => `${s}, ${w}. Подтверждение от Mindbody придёт на вашу почту, а перед сессией — напоминание.`,
      doneAdmin: (s, w) => `${s}, ${w} — записано. Клиент получит подтверждение от Mindbody.`,
      again: "Записаться ещё", err: "Что-то пошло не так. Попробуйте ещё раз.", fill: "Пожалуйста, укажите имя и email.",
      fallback: "Онлайн-запись скоро откроется. Пока что запишитесь здесь:", more: "Ещё даты", sandbox: "ТЕСТ · Mindbody Sandbox. Эти записи ненастоящие.",
    },
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // times arrive as North Raleigh local strings ("2026-11-24T09:00:00"): format them as they are
  const asDate = (s) => new Date(s.slice(0, 19) + "Z");
  const fmt = (s, lang, o) => asDate(s).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", Object.assign({ timeZone: "UTC" }, o));
  const dayLabel = (s, lang) => fmt(s, lang, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = (s, lang) => fmt(s, lang, { hour: "numeric", minute: "2-digit" });
  const whenLabel = (s, lang) => `${fmt(s, lang, { weekday: "long", month: "long", day: "numeric" })}, ${timeLabel(s, lang)}`;
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  function css() {
    if (document.getElementById("mbk-css")) return;
    const st = document.createElement("style"); st.id = "mbk-css";
    st.textContent = `
.mbk{--k-ind:var(--indigo,#5b4b88);--k-aqua:var(--aqua,#57a7ac);--k-lag:var(--lagoon,#336575);--k-stone:var(--stone,#d8d7d9);--k-ink:var(--ink,#2e2840);--k-soft:var(--ink-soft,#5f5870);--k-cream:var(--cream,#faf2dd);display:grid;gap:18px;color:var(--k-ink);font-family:var(--body,system-ui,sans-serif)}
.mbk h4{margin:0;font:400 1.45rem/1.15 var(--display,Georgia,serif);color:var(--k-ind);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.mbk h4 .n{font:500 .72rem var(--body,system-ui);letter-spacing:.14em;color:var(--k-cream);background:var(--k-ind);border-radius:999px;width:24px;height:24px;display:inline-grid;place-items:center;transform:translateY(-3px)}
.mbk .step{display:grid;gap:12px}
.mbk .step.off{opacity:.45}
.mbk .svcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.mbk .svc{all:unset;box-sizing:border-box;cursor:pointer;display:grid;gap:4px;padding:14px 16px;border:1px solid var(--k-stone);border-radius:16px;background:#fff;transition:border-color .15s,box-shadow .15s}
.mbk .svc:hover{border-color:var(--k-aqua)}
.mbk .svc:focus-visible,.mbk .chipb:focus-visible{outline:2px solid var(--k-aqua);outline-offset:2px}
.mbk .svc b{font:400 1.15rem/1.2 var(--display,Georgia,serif);color:var(--k-ind)}
.mbk .svc span{font-size:.8rem;color:var(--k-soft);letter-spacing:.03em}
.mbk .svc[aria-pressed="true"]{border-color:var(--k-ind);box-shadow:0 0 0 1px var(--k-ind) inset;background:#faf8fd}
.mbk .picked{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-radius:14px;background:rgba(91,75,136,.07)}
.mbk .linkb{all:unset;cursor:pointer;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--k-ind);border-bottom:1px solid currentColor}
.mbk .days,.mbk .times{display:flex;flex-wrap:wrap;gap:8px}
.mbk .chipb{all:unset;box-sizing:border-box;cursor:pointer;padding:9px 14px;border-radius:999px;border:1px solid var(--k-stone);background:#fff;font-size:.86rem;color:var(--k-ink);text-align:center}
.mbk .days .chipb{display:grid;gap:1px;padding:8px 14px;border-radius:14px;min-width:74px}
.mbk .days .chipb small{font-size:.7rem;color:var(--k-soft)}
.mbk .chipb:hover{border-color:var(--k-aqua)}
.mbk .chipb[aria-pressed="true"]{background:var(--k-lag);border-color:var(--k-lag);color:var(--k-cream)}
.mbk .chipb[aria-pressed="true"] small{color:var(--k-cream);opacity:.85}
.mbk .muted{color:var(--k-soft);font-size:.86rem;margin:0}
.mbk .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mbk label{display:grid;gap:6px;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--k-soft)}
.mbk input,.mbk textarea,.mbk select{font:400 1rem var(--body,system-ui);letter-spacing:0;text-transform:none;color:var(--k-ink);padding:12px 14px;border:1px solid var(--k-stone);border-radius:12px;background:#fff;width:100%;box-sizing:border-box}
.mbk textarea{min-height:84px;resize:vertical}
.mbk .wide{grid-column:1/-1}
.mbk .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.mbk .go{all:unset;box-sizing:border-box;cursor:pointer;justify-self:start;padding:14px 28px;border-radius:999px;background:var(--k-ind);color:var(--k-cream);font:500 .8rem var(--body,system-ui);letter-spacing:.16em;text-transform:uppercase}
.mbk .go[disabled]{opacity:.55;cursor:default}
.mbk .err{color:#a33a3a;font-size:.9rem;margin:0}
.mbk .ok{display:grid;gap:10px;padding:22px;border-radius:18px;background:rgba(87,167,172,.1);border:1px solid rgba(87,167,172,.35)}
.mbk .ok h4{color:var(--k-lag)}
.mbk .ok .linkb{justify-self:start}
.mbk .ok p{margin:0}
.mbk .test{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#8a5a00;background:#fff4d6;border-radius:10px;padding:8px 12px;margin:0}
.mbk .spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(91,75,136,.2);border-top-color:var(--k-ind);animation:mbkspin 1s linear infinite;display:inline-block;vertical-align:-4px;margin-right:8px}
@keyframes mbkspin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.mbk .spin{animation:none}}
@media (max-width:560px){.mbk .grid2{grid-template-columns:1fr}.mbk .svcs{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  // sample open times for previews
  function demoSlots(svc) {
    const out = [], base = new Date(today() + "T00:00:00Z"), len = (SERVICES.find((x) => x.id === svc) || { min: 60 }).min;
    for (let d = 3; d < 31; d++) {
      const day = new Date(base.getTime() + d * 864e5), wd = day.getUTCDay();
      const blocks = wd === 2 || wd === 3 || wd === 4 ? [[9, 15], [19, 20.5]] : wd === 0 ? [[15, 17]] : [];
      for (const [a, b] of blocks) for (let h = a; h + len / 60 <= b; h += 0.5) {
        if ((d * 7 + h * 3) % 5 === 0) continue; // a few already taken
        const s = new Date(day.getTime() + h * 3600e3), e = new Date(s.getTime() + len * 60e3);
        out.push({ start: s.toISOString().slice(0, 19), end: e.toISOString().slice(0, 19) });
      }
    }
    return out;
  }

  async function call(body, getToken) {
    let tok = null; try { tok = getToken ? await getToken() : null; } catch (e) {}
    const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (tok || KEY) }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out.error) throw Object.assign(new Error(out.message || out.error || "error " + r.status), { code: out.error === "not_configured" ? "not_configured" : r.status });
    return out;
  }

  function mount(el, o) {
    o = Object.assign({ lang: "en", admin: false, demo: false, prefill: {}, people: null, service: null }, o || {});
    css();
    const t = T[o.lang === "ru" ? "ru" : "en"], L = o.lang === "ru" ? "ru" : "en";
    const st = { svc: o.service || null, slots: null, day: null, slot: null, loading: false, error: "", sandbox: false, busy: false, done: null, who: "", notice: "", f: Object.assign({ first: "", last: "", email: "", phone: "", note: "" }, o.prefill) };
    const name = (s) => (L === "ru" && s.ru) || s.name;
    const meta = (s) => `${s.min} ${t.min} · ${(L === "ru" && s.priceRu) || s.price}${s.note ? " · " + ((L === "ru" && s.noteRu) || s.note) : ""}`;
    el.classList.add("mbk");

    async function load() {
      st.loading = true; st.error = ""; st.slots = null; st.day = null; st.slot = null; draw();
      try {
        if (o.demo) { await new Promise((r) => setTimeout(r, 350)); st.slots = demoSlots(st.svc); }
        else {
          const r = await call({ action: "times", service: st.svc, from: today(), days: 28 }, o.getToken);
          if (r.sandbox && !o.admin) return fallback(); // test mode: only Mila sees Sandbox times
          st.slots = r.slots || []; st.sandbox = !!r.sandbox;
        }
      } catch (e) {
        if (!o.admin || e.code === "not_configured" || e.code === 404) return fallback(); // clients always get a way to book
        if (o.admin && /staff login|not_configured|api key|mindbody: error 5/i.test(e.message || "")) return adminOffline();
        st.error = e.message || t.err;
      }
      st.loading = false;
      const days = [...new Set((st.slots || []).map((s) => s.start.slice(0, 10)))];
      st.day = days[0] || null; draw();
    }
    function fallback() {
      el.classList.remove("mbk");
      el.innerHTML = `<p class="small-note muted">${esc(t.fallback)}</p><div class="mindbody-widget" data-widget-type="Appointments" data-widget-id="${WIDGET_ID}"></div>`;
      if (!document.querySelector('script[src*="brandedweb.mindbodyonline.com/embed/widget.js"]')) { const sc = document.createElement("script"); sc.async = true; sc.src = "https://brandedweb.mindbodyonline.com/embed/widget.js"; document.body.appendChild(sc); }
    }

    function draw() {
      const svc = SERVICES.find((x) => x.id === st.svc);
      if (st.done) {
        el.innerHTML = `<div class="ok" role="status"><h4>${esc(t.doneH)} ✓</h4><p class="muted" style="font-size:1rem">${esc((o.admin ? t.doneAdmin : t.done)(name(svc || { name: "" }), whenLabel(st.done.start, L)))}</p>
          ${st.sandbox ? `<p class="test">${esc(t.sandbox)}</p>` : ""}<button class="linkb" type="button" data-k="again">${esc(t.again)}</button></div>`;
        return;
      }
      let h = st.sandbox ? `<p class="test">${esc(t.sandbox)}</p>` : "";
      // 1 · session
      h += `<div class="step"><h4><span class="n">1</span>${esc(t.s1)}</h4>`;
      h += svc ? `<div class="picked"><span><b style="font:400 1.2rem var(--display,Georgia,serif);color:var(--k-ind)">${esc(name(svc))}</b> <span class="muted" style="display:inline">· ${esc(meta(svc))}</span></span><button class="linkb" type="button" data-k="resvc">${esc(t.change)}</button></div>`
        : `<div class="svcs">${SERVICES.map((s) => `<button class="svc" type="button" data-svc="${s.id}" aria-pressed="false"><b>${esc(name(s))}</b><span>${esc(meta(s))}</span></button>`).join("")}</div>`;
      h += `</div>`;
      // 2 · day and time
      h += `<div class="step${svc ? "" : " off"}"><h4><span class="n">2</span>${esc(t.s2)}</h4>`;
      if (svc) {
        if (st.loading) h += `<p class="muted"><span class="spin"></span>${esc(t.loading)}</p>`;
        else if (st.error) h += `<p class="err">${esc(st.error)}</p><button class="linkb" type="button" data-k="retry">↻</button>`;
        else if (!st.slots.length) h += `<p class="muted">${esc(t.none)}</p>`;
        else {
          const days = [...new Set(st.slots.map((s) => s.start.slice(0, 10)))];
          if (st.notice) h += `<p class="err" role="alert">${esc(st.notice)}</p>`;
          h += `<div class="days" role="group">${days.map((d) => { const n = st.slots.filter((s) => s.start.startsWith(d)).length; return `<button class="chipb" type="button" data-day="${d}" aria-pressed="${d === st.day}">${esc(dayLabel(d + "T12:00:00", L))}<small>${n} ${L === "ru" ? "окон" : n === 1 ? "time" : "times"}</small></button>`; }).join("")}</div>`;
          h += `<div class="times" role="group">${st.slots.filter((s) => s.start.startsWith(st.day)).map((s) => `<button class="chipb" type="button" data-slot="${s.start}" aria-pressed="${!!st.slot && st.slot.start === s.start}">${esc(timeLabel(s.start, L))}</button>`).join("")}</div>`;
          h += `<p class="muted">${esc(t.tz)} ${esc(o.admin ? t.ruleAdmin : t.rule)}</p>`;
        }
      }
      h += `</div>`;
      // 3 · details
      h += `<div class="step${st.slot ? "" : " off"}"><h4><span class="n">3</span>${esc(o.admin ? t.s3a : t.s3)}</h4>`;
      if (st.slot) {
        h += `<div class="picked"><span><b>${esc(whenLabel(st.slot.start, L))}</b> <span class="muted" style="display:inline">· ${esc(name(svc))}</span></span></div><form class="grid2" novalidate>`;
        if (o.admin && o.people) h += `<label class="wide">${esc(t.who)}<select data-who><option value="">${esc(t.whoPick)}</option>${o.people.map((p, i) => `<option value="${i}" ${String(i) === st.who ? "selected" : ""}>${esc(p.name)} · ${esc(p.email)}</option>`).join("")}<option value="new" ${st.who === "new" ? "selected" : ""}>${esc(t.whoNew)}</option></select></label>`;
        const inp = (k, type, req, ac) => `<label>${esc(t[k])}<input name="${k}" type="${type}" value="${esc(st.f[k])}" ${req ? "required" : ""} autocomplete="${ac}"></label>`;
        h += inp("first", "text", 1, "given-name") + inp("last", "text", 1, "family-name") + inp("email", "email", 1, "email") + inp("phone", "tel", 0, "tel");
        h += `<label class="wide">${esc(t.note)}<textarea name="note" maxlength="1000">${esc(st.f.note)}</textarea></label>`;
        h += `<div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>`;
        h += `${st.error ? `<p class="err wide" role="alert">${esc(st.error)}</p>` : ""}<button class="go" type="submit" ${st.busy ? "disabled" : ""}>${esc(st.busy ? t.booking : t.book)}</button></form>`;
      }
      h += `</div>`;
      el.innerHTML = h;
    }

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || !el.contains(b)) return;
      if (b.dataset.svc) { st.svc = Number(b.dataset.svc); load(); return; }
      if (b.dataset.k === "resvc") { st.svc = null; st.slots = null; st.slot = null; st.error = ""; draw(); return; }
      if (b.dataset.k === "retry") { load(); return; }
      if (b.dataset.k === "again") { st.done = null; st.svc = o.service || null; st.slot = null; st.slots = null; draw(); return; }
      if (b.dataset.day) { st.day = b.dataset.day; st.slot = null; draw(); return; }
      if (b.dataset.slot) { st.notice = ""; st.slot = st.slots.find((s) => s.start === b.dataset.slot); st.error = ""; draw(); const f = el.querySelector('input[name="first"]'); if (f && !f.value) f.focus(); else { const g = el.querySelector(".go"); if (g) g.scrollIntoView({ behavior: "smooth", block: "center" }); } }
    });
    el.addEventListener("input", (e) => { const n = e.target.name; if (n && n in st.f) st.f[n] = e.target.value; });
    el.addEventListener("change", (e) => {
      if (!e.target.matches("[data-who]")) return;
      st.who = e.target.value; const p = o.people[Number(st.who)];
      if (p) { const parts = (p.name || "").trim().split(/\s+/); st.f.first = parts[0] || ""; st.f.last = parts.slice(1).join(" "); st.f.email = p.email || ""; st.f.phone = p.phone || ""; }
      else if (st.who === "new") st.f = { first: "", last: "", email: "", phone: "", note: st.f.note };
      draw();
    });
    el.addEventListener("submit", async (e) => {
      e.preventDefault(); if (st.busy) return;
      const f = e.target, hp = f.querySelector('input[name="website"]').value;
      ["first", "last", "email", "phone", "note"].forEach((k) => { const x = f.querySelector(`[name="${k}"]`); if (x) st.f[k] = x.value.trim(); });
      if (!st.f.first || !st.f.last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.f.email)) { st.error = t.fill; draw(); return; }
      st.busy = true; st.error = ""; draw();
      try {
        let r;
        if (o.demo) { await new Promise((x) => setTimeout(x, 600)); r = { ok: true, appointment: { start: st.slot.start } }; }
        else r = await call({ action: "book", service: st.svc, start: st.slot.start, ...st.f, website: hp }, o.getToken);
        st.done = { start: (r.appointment && r.appointment.start) || st.slot.start }; st.sandbox = !!r.sandbox || st.sandbox;
        if (o.onBooked) try { o.onBooked({ service: st.svc, start: st.done.start, email: st.f.email, name: `${st.f.first} ${st.f.last}` }); } catch (x) {}
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (x) {
        st.error = x.message || t.err;
        if (x.code === 409) { st.busy = false; st.notice = st.error; st.error = ""; await load(); return; }
      }
      st.busy = false; draw();
    });

    // Admin: until Mindbody approves the connection, say so plainly and point to the Mindbody appointment book
    function adminOffline() {
      el.classList.add("mbk");
      el.innerHTML = `<div class="ok" style="background:rgba(184,145,63,.1);border-color:rgba(184,145,63,.4)"><h4 style="color:#7a5f1f">Online booking isn't connected yet</h4>
        <p class="muted" style="font-size:.95rem">This form starts working when Mindbody approves the website connection (your API request is still in review). Until then, book clients in your Mindbody appointment book.</p>
        <a class="go" style="justify-self:start;text-decoration:none" href="https://clients.mindbodyonline.com/app/business/mainappointments/index" target="_blank" rel="noopener">Open Mindbody appointment book ↗</a></div>`;
    }
    if (!o.demo && o.admin) {
      el.innerHTML = `<p class="muted"><span class="spin"></span>${esc(t.loading)}</p>`;
      call({ action: "ping" }, o.getToken).then((r) => { if (r.sandbox) adminOffline(); else if (st.svc) load(); else draw(); }, () => adminOffline());
    } else if (!o.demo && !o.admin) {
      // Clients only see the new form once Mindbody is live; until then, the Mindbody widget straight away
      el.innerHTML = `<p class="muted"><span class="spin"></span>${esc(t.loading)}</p>`;
      call({ action: "ping" }).then((r) => { if (r.sandbox) fallback(); else if (st.svc) load(); else draw(); }, () => fallback());
    } else if (st.svc) load(); else draw();
    return { setService(id) { st.svc = id; load(); } };
  }

  window.MBBook = { mount, SERVICES };
})();
