(function () {
  "use strict";
  const DATA_URL = "data/departures.json";
  const LANGS = ["ar", "fr", "en"];
  const $ = (s) => document.querySelector(s);
  const state = { data: null, city: null, lang: "fr", q: "", carrier: "", sort: "next" };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function norm(s) {
    return String(s || "").normalize("NFC").toLowerCase()
      .replace(/[أإآٱ]/g, "ا")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")       // latin accents
      .replace(/[\u064B-\u0655\u0670\u0640]/g, "")            // arabic diacritics, hamza marks, tatweel
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[''`’\-_.]/g, " ").replace(/\s+/g, " ").trim();
  }
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  function nowMin(tz) {
    try {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Africa/Casablanca", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
    } catch (e) { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }
  const t = (k, ...a) => { const v = (I18N[state.lang] || I18N.fr)[k]; return typeof v === "function" ? v(...a) : (v == null ? k : v); };
  const L = (o) => (o && (o[state.lang] || o.fr || o.en || o.ar)) || "";
  const fmtTime = (s) => (state.lang === "fr" ? s.replace(":", "h") : s);

  // ---------- i18n ----------
  function applyLang() {
    const html = document.documentElement;
    html.lang = state.lang;
    html.dir = state.lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); el.title = t(el.dataset.i18nAria); });
    document.querySelectorAll(".langs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === state.lang));
    try { localStorage.setItem("mosafir.lang", state.lang); } catch (e) {}
    if (state.data) { fillCities(); fillCarriers(); renderCity(); render(); destAC && destAC.refresh(); carrierAC && carrierAC.refresh(); }
  }

  // ---------- data ----------
  function fillCities() {
    const sel = $("#citySel");
    const cities = state.data.cities;
    sel.innerHTML = Object.keys(cities).map((id) => `<option value="${esc(id)}">${esc(L(cities[id].name))}</option>`).join("");
    sel.value = state.city;
  }
  function city() { return state.data.cities[state.city]; }
  function fillCarriers() {
    if (carrierAC) carrierAC.set(state.carrier);
  }
  function renderCity() {
    const c = city();
    $("#heroCity").textContent = L(c.name);
    const deps = c.departures;
    $("#statDeps").textContent = deps.length;
    $("#statDests").textContent = new Set(deps.map((d) => d.destination.fr)).size;
    $("#statCarriers").textContent = new Set(deps.map((d) => d.carrier)).size;
    $("#station").textContent = `${t("station")} : ${L(c.station)}`;
    $("#source").textContent = c.source ? `${t("source")} : ${L(c.source)}` : "";
    $("#gaps").innerHTML = (c.coverage_gaps || []).map((g) => `<p class="gap">⚠️ ${esc(L(g.note))}</p>`).join("");
    document.title = `Mosafir — ${t("heroTitle")} ${L(c.name)}`;
  }
  function index(c) {
    c.departures.forEach((d) => {
      if (d._s) return;
      const parts = [d.destination, ...(d.stops || [])].flatMap((p) => [p.ar, p.fr, p.en]);
      d._dest = norm([d.destination.ar, d.destination.fr, d.destination.en].join(" | "));
      d._s = norm(parts.join(" | "));
      d._m = toMin(d.time);
    });
  }

  // ---------- render ----------
  function filtered() {
    const c = city(); index(c);
    const q = norm(state.q);
    const now = nowMin(c.timezone);
    const carrierOk = carrierMatcher();
    let rows = c.departures.filter((d) => carrierOk(d) && (!q || d._s.includes(q)));
    // destination matches rank before stop-only matches
    const rank = (d) => (q && !d._dest.includes(q) ? 1 : 0);
    const delta = (d) => (d._m - now + 1440) % 1440;
    if (state.sort === "asc") rows.sort((a, b) => a._m - b._m || rank(a) - rank(b));
    else if (state.sort === "desc") rows.sort((a, b) => b._m - a._m || rank(a) - rank(b));
    else rows.sort((a, b) => delta(a) - delta(b) || rank(a) - rank(b));
    return { rows, now, delta };
  }
  function rel(m) { return m < 60 ? t("inMin", m) : t("inH", Math.floor(m / 60), m % 60); }
  function card(d, now, delta, opts) {
    const dm = delta(d);
    const soon = dm <= 60;
    const stops = (d.stops || []).map(L);
    const plat = d.platform ? esc(d.platform) : t("noPlatform");
    const flags = (d.uncertain ? `<span class="badge warn" title="${esc(L(d.note))}">${esc(t("uncertain"))}</span>` : "") +
      (soon ? `<span class="badge soon">${esc(rel(dm))}</span>` : "");
    const q = norm(state.q);
    const hl = (s) => { if (!q) return esc(s); const n = norm(s); return n.includes(q) ? `<mark>${esc(s)}</mark>` : esc(s); };
    return `<li class="dep${soon ? " is-soon" : ""}${d.uncertain ? " is-uncertain" : ""}">
      <div class="time"><span>${esc(fmtTime(d.time))}</span>${state.sort === "next" && d._m < now ? `<small>${esc(t("tomorrow"))}</small>` : ""}</div>
      <div class="main">
        <div class="dest">${hl(L(d.destination))}${state.lang !== "ar" ? ` <span class="ar" lang="ar">${esc(d.destination.ar)}</span>` : ""} ${flags}</div>
        <div class="carrier">${esc(d.carrier)}${state.lang === "ar" && d.carrier_ar ? ` · <span lang="ar">${esc(d.carrier_ar)}</span>` : ""}</div>
        ${stops.length ? `<div class="stops"><b>${esc(t("via"))}</b> ${stops.map(hl).join(" <i>›</i> ")}</div>` : ""}
        ${d.note && !d.uncertain ? `<div class="note">ℹ️ ${esc(L(d.note))}</div>` : ""}
        ${d.note && d.uncertain ? `<div class="note warn">⚠️ ${esc(L(d.note))}</div>` : ""}
      </div>
      <div class="plat"><small>${esc(t("platform"))}</small><span>${plat}</span></div>
    </li>`;
  }
  function render() {
    const { rows, now, delta } = filtered();
    $("#list").innerHTML = rows.map((d) => card(d, now, delta)).join("");
    $("#empty").hidden = rows.length > 0;
    $("#count").textContent = t("count", rows.length);
    const h = String(Math.floor(now / 60)).padStart(2, "0"), m = String(now % 60).padStart(2, "0");
    $("#clock").textContent = `🕒 ${fmtTime(h + ":" + m)}`;
    const next = rows.filter((d) => delta(d) <= 120).sort((a, b) => delta(a) - delta(b)).slice(0, 6);
    $("#nextList").innerHTML = next.length ? next.map((d) => `<div class="chip"><b>${esc(fmtTime(d.time))}</b><span>${esc(L(d.destination))}</span><small>${esc(d.carrier)} · ${esc(t("platform"))} ${d.platform ? esc(d.platform) : "—"}</small><em>${esc(rel(delta(d)))}</em></div>`).join("")
      : `<p class="muted">${esc(t("nextNone"))}</p>`;
    const url = new URL(location.href);
    ["q", "carrier"].forEach((k) => (state[k] ? url.searchParams.set(k, state[k]) : url.searchParams.delete(k)));
    url.searchParams.set("city", state.city); url.searchParams.set("lang", state.lang);
    history.replaceState(null, "", url);
  }


  // ---------- autocomplete (generic, reused by destination + carrier) ----------
  function rankMatch(keys, nq) {
    // 0 = starts with, 1 = a word starts with, 2 = contains (also ignoring spaces), 9 = no match
    let r = 9;
    const sq = (x) => x.replace(/(.)\1+/g, "$1");          // "khalloufi" ~ "khaloufi"
    const nqs = sq(nq.replace(/ /g, ""));
    keys.forEach((s) => {
      if (sq(s).startsWith(sq(nq))) r = Math.min(r, 0);
      else if (s.split(" ").some((w) => sq(w).startsWith(sq(nq)))) r = Math.min(r, 1);
      else if (s.includes(nq) || sq(s.replace(/ /g, "")).includes(nqs)) r = Math.min(r, 2);
    });
    return r;
  }
  function searchEntries(list, q, score, topFilter) {
    const nq = norm(q);
    if (!nq) return list.filter(topFilter || (() => true)).sort((a, b) => score(b) - score(a)).slice(0, 8);
    const out = [];
    list.forEach((e) => { const r = rankMatch(e.keys, nq); if (r < 9) out.push([r, e]); });
    return out.sort((a, b) => a[0] - b[0] || score(b[1]) - score(a[1])).slice(0, 8).map((x) => x[1]);
  }
  function hlName(s, q) {
    const nq = norm(q); if (!nq) return esc(s);
    const n = norm(s), i = n.indexOf(nq);
    if (i < 0 || n.length !== s.length) return esc(s);   // only highlight when positions line up
    return esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + nq.length)) + "</mark>" + esc(s.slice(i + nq.length));
  }
  const isAr = (s) => /[\u0600-\u06FF]/.test(s);

  /**
   * Accessible combobox on an <input>.
   * cfg: { input, list, status, clearBtn, id, source(q) -> entries, view(entry) -> {main, others[], meta, icon},
   *        value(entry) -> text put in the input, onCommit(text) -> apply filter }
   */
  function createAutocomplete(cfg) {
    const input = $(cfg.input), ul = $(cfg.list), status = $(cfg.status), clear = cfg.clearBtn && $(cfg.clearBtn);
    const ac = { items: [], active: -1, open: false };
    function syncClear() { if (clear) clear.hidden = !input.value; }
    function setOpen(on) {
      ac.open = on; ul.hidden = !on;
      input.setAttribute("aria-expanded", on ? "true" : "false");
      if (!on) { input.removeAttribute("aria-activedescendant"); ac.active = -1; }
    }
    function draw() {
      if (!state.data) return;
      const q = input.value;
      ac.items = cfg.source(q); ac.active = -1;
      const head = `<li class="ac-head" role="presentation">${esc(q.trim() ? t("acTitle") : cfg.topTitle())}</li>`;
      ul.innerHTML = head + (ac.items.length ? ac.items.map((e, i) => {
        const v = cfg.view(e);
        return `<li id="${cfg.id}-opt-${i}" class="ac-opt" role="option" aria-selected="false" data-i="${i}">
          <span class="ac-ico" aria-hidden="true">${v.icon}</span>
          <span class="ac-txt"><b${isAr(v.main) ? ' lang="ar" dir="rtl"' : ""}>${hlName(v.main, q)}</b>${v.others.length ? `<small>${v.others.map((o) => `<span${isAr(o) ? ' lang="ar" dir="rtl"' : ""}>${hlName(o, q)}</span>`).join(" · ")}</small>` : ""}</span>
          <span class="ac-meta">${esc(v.meta)}</span></li>`;
      }).join("") : `<li class="ac-empty" role="presentation">${esc(cfg.noneText())}</li>`);
      setOpen(true);
      status.textContent = ac.items.length ? t("acCount", ac.items.length) : cfg.noneText();
    }
    function move(d) {
      if (!ac.open) draw();
      if (!ac.items.length) return;
      ac.active = (ac.active + d + ac.items.length) % ac.items.length;
      ul.querySelectorAll(".ac-opt").forEach((li, i) => {
        const on = i === ac.active;
        li.classList.toggle("is-active", on); li.setAttribute("aria-selected", on ? "true" : "false");
        if (on) li.scrollIntoView({ block: "nearest" });
      });
      input.setAttribute("aria-activedescendant", `${cfg.id}-opt-${ac.active}`);
    }
    function pick(i) {
      const e = ac.items[i]; if (!e) return;
      input.value = cfg.value(e); syncClear();
      setOpen(false); cfg.onCommit(input.value, e);
    }
    let tm;
    input.addEventListener("focus", draw);
    input.addEventListener("click", () => { if (!ac.open) draw(); });
    input.addEventListener("input", () => { draw(); syncClear(); clearTimeout(tm); tm = setTimeout(() => cfg.onCommit(input.value), 120); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (ac.open && ac.active >= 0) pick(ac.active); else { setOpen(false); cfg.onCommit(input.value); } }
      else if (e.key === "Escape") { if (ac.open) { e.preventDefault(); setOpen(false); } else if (input.value) { api.clear(); } }
      else if (e.key === "Tab") setOpen(false);
    });
    ul.addEventListener("pointerdown", (e) => e.preventDefault());     // keep focus in the input (mouse + touch)
    ul.addEventListener("click", (e) => { const li = e.target.closest(".ac-opt"); if (li) pick(+li.dataset.i); });
    ul.addEventListener("mousemove", (e) => { const li = e.target.closest(".ac-opt"); if (li && +li.dataset.i !== ac.active) move(+li.dataset.i - ac.active); });
    input.addEventListener("blur", () => setTimeout(() => setOpen(false), 120));
    input.addEventListener("search", () => { if (!input.value) api.clear(); });
    if (clear) {
      clear.addEventListener("pointerdown", (e) => e.preventDefault());
      clear.addEventListener("click", () => { api.clear(); input.focus(); });
    }
    const api = {
      clear() { input.value = ""; syncClear(); cfg.onCommit(""); if (document.activeElement === input) draw(); },
      set(v) { input.value = v || ""; syncClear(); },
      close() { setOpen(false); },
      refresh() { syncClear(); if (ac.open) draw(); },
    };
    syncClear();
    return api;
  }

  // ---- destination / stop entries ----
  function places(c) {
    if (c._places) return c._places;
    const map = new Map();
    const add = (p, isDest) => {
      const k = p.fr + "|" + p.ar;
      let e = map.get(k);
      if (!e) { e = { name: p, dest: 0, stop: 0, keys: [norm(p.ar), norm(p.fr), norm(p.en)] }; map.set(k, e); }
      isDest ? e.dest++ : e.stop++;
    };
    c.departures.forEach((d) => { add(d.destination, true); (d.stops || []).forEach((s) => add(s, false)); });
    return (c._places = [...map.values()]);
  }
  // ---- carrier entries (name, Arabic name, spelling variants) ----
  function carriers(c) {
    if (c._carriers) return c._carriers;
    const info = c.carriers || {};
    const map = new Map();
    c.departures.forEach((d) => {
      let e = map.get(d.carrier);
      if (!e) {
        const i = info[d.carrier] || {};
        const ar = i.ar || d.carrier_ar || "";
        const names = [d.carrier, ar, ...(i.aliases || [])].filter(Boolean);
        e = { name: d.carrier, ar, aliases: i.aliases || [], count: 0, keys: [...new Set(names.map(norm))] };
        map.set(d.carrier, e);
      }
      if (!e.ar && d.carrier_ar) { e.ar = d.carrier_ar; e.keys.push(norm(d.carrier_ar)); }
      e.count++;
    });
    return (c._carriers = [...map.values()]);
  }
  // resolve the carrier box text: exact name/alias -> that carrier only; otherwise substring over names
  function carrierMatcher() {
    const cq = norm(state.carrier);
    if (!cq) return () => true;
    const list = carriers(city());
    const exact = list.find((e) => e.keys.includes(cq));
    if (exact) return (d) => d.carrier === exact.name;
    const ok = new Set(list.filter((e) => rankMatch(e.keys, cq) < 9).map((e) => e.name));
    return (d) => ok.has(d.carrier);
  }

  let destAC, carrierAC;
  function bindAc() {
    destAC = createAutocomplete({
      input: "#q", list: "#acList", status: "#acStatus", clearBtn: "#qClear", id: "dest",
      topTitle: () => t("acTitleTop"), noneText: () => t("acNone"),
      source: (q) => searchEntries(places(city()), q, (e) => e.dest * 3 + e.stop, (e) => e.dest),
      view: (e) => {
        const main = L(e.name);
        const others = ["ar", "fr", "en"].filter((l) => l !== state.lang).map((l) => e.name[l]).filter((v, k, a) => v && v !== main && a.indexOf(v) === k);
        return { main, others, icon: e.dest ? "📍" : "🛑",
          meta: e.dest ? t("acDest", e.dest) + (e.stop ? " · " + t("acVia", e.stop) : "") : t("acStop", e.stop) };
      },
      value: (e) => L(e.name),
      onCommit: (v) => { if (state.q !== v) { state.q = v; render(); } },
    });
    carrierAC = createAutocomplete({
      input: "#carrierQ", list: "#carrierList", status: "#carrierStatus", clearBtn: "#carrierClear", id: "carrier",
      topTitle: () => t("acCarrierTop"), noneText: () => t("acCarrierNone"),
      source: (q) => searchEntries(carriers(city()), q, (e) => e.count),
      view: (e) => {
        const main = state.lang === "ar" && e.ar ? e.ar : e.name;
        const others = [e.name, e.ar].filter((v) => v && v !== main);
        const q = norm($("#carrierQ").value);
        const alias = q && e.aliases.find((a) => norm(a).includes(q) && a !== main);
        if (alias && !others.includes(alias)) others.push(alias);
        return { main, others, icon: "🚌", meta: t("acDest", e.count) };
      },
      value: (e) => e.name,
      onCommit: (v) => { if (state.carrier !== v) { state.carrier = v; render(); } },
    });
  }

  // ---------- events ----------
  function bind() {
    document.querySelectorAll(".langs button").forEach((b) => b.addEventListener("click", () => { state.lang = b.dataset.lang; applyLang(); }));
    $("#citySel").addEventListener("change", (e) => { state.city = e.target.value; destAC.close(); carrierAC.close(); state.carrier = ""; fillCarriers(); renderCity(); render(); });
    $("#sortSel").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    $("#resetBtn").addEventListener("click", () => { state.q = ""; state.carrier = ""; state.sort = "next"; destAC.set(""); carrierAC.set(""); $("#sortSel").value = "next"; render(); });
    setInterval(render, 60000);
  }


  // ---------- PWA: service worker, install button, offline badge ----------
  function setOffline(on) {
    const badge = $("#offlineBadge");
    badge.hidden = !on; badge.title = t("offlineTip");
  }
  function initPWA() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      const reg = () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
      if (document.readyState === "complete") reg(); else window.addEventListener("load", reg);
    }
    const btn = $("#installBtn");
    let deferred = null;
    const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      btn.hidden = standalone();
    });
    btn.addEventListener("click", async () => {
      if (!deferred) return;
      btn.hidden = true;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
    });
    window.addEventListener("appinstalled", () => { deferred = null; btn.hidden = true; });

    window.addEventListener("online", () => setOffline(false));
    window.addEventListener("offline", () => setOffline(true));
    if (!navigator.onLine) setOffline(true);
  }

  // ---------- boot ----------
  async function boot() {
    const p = new URLSearchParams(location.search);
    let saved = null; try { saved = localStorage.getItem("mosafir.lang"); } catch (e) {}
    state.lang = LANGS.includes(p.get("lang")) ? p.get("lang") : (LANGS.includes(saved) ? saved : "fr");
    state.q = p.get("q") || ""; state.carrier = p.get("carrier") || "";
    bindAc(); bind(); initPWA();
    destAC.set(state.q); carrierAC.set(state.carrier);
    applyLang();
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      if (res.headers.get("X-Mosafir-Offline")) setOffline(true);
      state.data = await res.json();
    } catch (e) {
      $("#list").innerHTML = `<li class="error">${esc(t("loadError"))}</li>`; console.error(e); return;
    }
    const ids = Object.keys(state.data.cities);
    state.city = ids.includes(p.get("city")) ? p.get("city") : (ids.includes("marrakech") ? "marrakech" : ids[0]);
    applyLang();
  }
  boot();
})();
