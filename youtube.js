// YouTube dashboard for Vext Gaming.
// Reads the raw YouTube Studio exports (CSV) and builds every figure on the page from them,
// so loading a newer export updates the whole dashboard.

(function () {
  "use strict";

  // ---------- Rules (edit these to change how videos are grouped) ----------

  // A video is tagged with the first game whose pattern matches its title.
  const GAMES = [
    ["Black Desert", /black desert|\bbdo\b|sorc|sorceress|hashashin|valencia|kzarka|serendia|lahn|musa|sage|cadry|arsha|hystria|node war|exile|pearl shop|ninja|tuvala|failing enhancing|\[xbox\]/i],
    ["Throne and Liberty", /throne and liberty|wand\/dagger|dagger\/wand|spear\/dagger|tevent|taedal|lucent|nixx|talus|tier 2 dungeon|qami|bellandir|crossbow dagger|darkblighter|saurodoma|gate of infinity|gs\/daggers/i],
    ["Where Winds Meet", /where winds meet|strategic sword|dual blades|dual swords/i],
    ["New World", /new world|everfall|bifrost/i],
    ["World of Warcraft", /\bwow\b|karazhan|warcraft|maulgar|gruul|magtheridon/i],
    ["Diablo 4", /diablo/i],
    ["League of Legends / TFT", /league of legends|teamfight tactics|\btft\b/i],
  ];
  // Titles that promise help or a buying decision count as guides.
  const GUIDE = /guide|build|how to|where to find|best|should you|which|worth|tips|prepare|explain/i;
  // Length rules: 60 seconds or under is a Short, 40 minutes or more is a live stream.
  const SHORT_MAX = 60, STREAM_MIN = 2400;

  const EVENTS = [
    ["2019-03", "Black Desert on Xbox"],
    ["2019-08", "Black Desert on PS4"],
    ["2024-10", "Throne and Liberty launch"],
    ["2025-11", "Where Winds Meet launch"],
  ];

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString("en-GB");
  const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m" : n >= 1e4 ? Math.round(n / 1e3) + "k" : fmt(n);
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mmss = (min) => { const s = Math.round(min * 60); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = (k) => MONTHS[+k.slice(5, 7) - 1] + " " + k.slice(0, 4);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
    return { head, rows: rows.filter((r) => r.length > 1 || r[0]) .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) };
  }
  const num = (v) => (v === undefined || v === "" ? null : Number(v));

  function kindOf(head) {
    if (head[0] === "Content" && head.includes("Video title")) return "content";
    if (head[0] === "Traffic source") return "traffic";
    if (head.length === 2 && head[0] === "Date" && head[1] === "Views") return "daily";
    return null;
  }

  // ---------- Model ----------
  let data = { content: null, daily: null, traffic: null };

  function model() {
    const total = data.content.rows.find((r) => r.Content === "Total");
    const videos = data.content.rows.filter((r) => r.Content !== "Total" && r.Content).map((r) => {
      const title = r["Video title"] || "";
      const dur = num(r.Duration) || 0;
      const pub = r["Video publish time"] ? new Date(r["Video publish time"]) : null;
      const g = GAMES.find(([, re]) => re.test(title));
      return {
        id: r.Content, title, dur, pub: pub && !isNaN(pub) ? pub : null,
        views: num(r.Views), hours: num(r["Watch time (hours)"]), subs: num(r.Subscribers),
        ctr: num(r["Thumbnail click-through rate (%)"]),
        game: g ? g[0] : "Other",
        format: dur <= SHORT_MAX ? "Short" : dur >= STREAM_MIN ? "Live stream" : "Video",
        guide: GUIDE.test(title),
      };
    });
    const withViews = videos.filter((v) => v.views != null);

    const monthly = new Map();
    let lastDay = "";
    for (const r of data.daily.rows) {
      const k = r.Date.slice(0, 7);
      monthly.set(k, (monthly.get(k) || 0) + (num(r.Views) || 0));
      if (r.Date > lastDay) lastDay = r.Date;
    }
    // Start the series at the first month with views.
    const months = [...monthly.entries()].sort();
    const first = months.findIndex(([, v]) => v > 0);

    const T = { views: num(total.Views), hours: num(total["Watch time (hours)"]), subs: num(total.Subscribers) };
    return { T, videos, withViews, months: months.slice(first), lastDay };
  }

  // ---------- Rendering ----------
  const tip = document.createElement("div");
  tip.className = "tip"; document.body.appendChild(tip);
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
    tip.style.top = Math.max(8, y - h - 12) + "px";
  }
  const hideTip = () => (tip.style.display = "none");

  function kpis(M) {
    const avd = (M.T.hours * 60) / M.T.views;
    const items = [
      ["Views", short(M.T.views), fmt(M.T.views)],
      ["Watch time", short(M.T.hours) + " hrs", fmt(M.T.hours) + " hours"],
      ["Subscribers gained", fmt(M.T.subs), "net, all time"],
      ["Average view", mmss(avd), "minutes watched per view"],
      ["Videos", fmt(M.videos.length), M.videos.filter((v) => v.format === "Video").length + " videos, " + M.videos.filter((v) => v.format === "Live stream").length + " streams, " + M.videos.filter((v) => v.format === "Short").length + " Shorts"],
    ];
    $("#kpis").innerHTML = items.map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("");
    const d = new Date(M.lastDay);
    $("#asof").textContent = "YouTube Studio export, data to " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  let range = "all";
  function lineChart(M) {
    const box = $("#trend");
    let pts = M.months;
    if (range !== "all") pts = pts.filter(([k]) => k >= range);
    const W = Math.max(320, box.clientWidth), H = W < 600 ? 240 : 300;
    const pad = { l: 44, r: 12, t: 22, b: 28 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(...pts.map((p) => p[1])) || 1;
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const x = (i) => pad.l + (pts.length < 2 ? 0 : (i / (pts.length - 1)) * iw);
    const y = (v) => pad.t + ih - (v / top) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly views line chart">`;
    const ticks = [0, top / 2, top];
    for (const t of ticks) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#e4e7eb"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${short(t)}</text>`;
    // Year labels
    let lastYear = "";
    const years = pts.map(([k], i) => [k.slice(0, 4), i]).filter(([yr]) => (yr !== lastYear ? (lastYear = yr, true) : false));
    const every = Math.ceil(years.length / (W < 600 ? 4 : 8));
    years.forEach(([yr, i], j) => { if (j % every === 0) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="start">${yr}</text>`; });
    // Events: numbered markers with a key under the chart, so labels never collide.
    const key = [];
    EVENTS.forEach(([k, label], n) => {
      const i = pts.findIndex(([m]) => m === k);
      if (i < 0) return;
      const ex = x(i);
      key.push(`<span><b>${n + 1}</b> ${label}, ${monthLabel(k)}</span>`);
      s += `<g class="event"><line x1="${ex}" x2="${ex}" y1="${pad.t}" y2="${pad.t + ih}" stroke="#9aa3ae" stroke-width="1"/>` +
        `<text x="${ex}" y="${pad.t - 6}" text-anchor="middle">${n + 1}</text></g>`;
    });
    const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
    s += `<path d="${line} L ${x(pts.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z" fill="#2a78d6" opacity="0.08"/>`;
    s += `<path d="${line}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round"/>`;
    s += `<line id="xh" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" stroke="#111827" stroke-width="1" visibility="hidden"/>`;
    s += `<circle id="xd" r="4" fill="#2a78d6" stroke="#fff" stroke-width="2" visibility="hidden"/>`;
    s += `<rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent" id="hit"/></svg>`;
    box.innerHTML = s + `<p class="event-key">${key.join("")}</p>`;
    const svg = box.querySelector("svg"), xh = svg.querySelector("#xh"), xd = svg.querySelector("#xd");
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - pad.l) / iw) * (pts.length - 1))));
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
      xd.setAttribute("cx", x(i)); xd.setAttribute("cy", y(pts[i][1])); xd.setAttribute("visibility", "visible");
      const ev2 = EVENTS.find(([k]) => k === pts[i][0]);
      showTip(`<b>${monthLabel(pts[i][0])}</b><br>${fmt(pts[i][1])} views${ev2 ? "<br>" + ev2[1] : ""}`, ev.clientX, ev.clientY);
    };
    const hit = svg.querySelector("#hit");
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { hideTip(); xh.setAttribute("visibility", "hidden"); xd.setAttribute("visibility", "hidden"); });
  }

  function bars(el, rows, opts = {}) {
    const max = Math.max(...rows.map((r) => r.value)) || 1;
    el.innerHTML = rows.map((r, i) =>
      `<li data-i="${i}" class="${r.dim ? "dim" : ""}"><span class="name">${esc(r.label)}</span><span class="track"><span class="fill" style="width:${(r.value / max) * 100}%;display:block"></span></span><span class="val">${opts.fmt ? opts.fmt(r.value) : short(r.value)}</span></li>`).join("");
    el.querySelectorAll("li").forEach((li) => {
      const r = rows[+li.dataset.i];
      li.addEventListener("pointermove", (e) => showTip(r.tip, e.clientX, e.clientY));
      li.addEventListener("pointerleave", hideTip);
    });
  }

  function groupStats(list, key) {
    const g = new Map();
    for (const v of list) { if (!g.has(v[key])) g.set(v[key], []); g.get(v[key]).push(v); }
    return [...g.entries()].map(([k, vs]) => {
      const views = vs.reduce((a, v) => a + v.views, 0);
      return { k, n: vs.length, views, med: median(vs.map((v) => v.views)), subs: vs.reduce((a, v) => a + (v.subs || 0), 0), hours: vs.reduce((a, v) => a + (v.hours || 0), 0) };
    });
  }

  function games(M) {
    const tot = M.withViews.reduce((a, v) => a + v.views, 0);
    let st = groupStats(M.withViews, "game").sort((a, b) => b.views - a.views);
    const top = st.filter((s) => s.k !== "Other").slice(0, 5);
    const rest = st.filter((s) => !top.includes(s));
    if (rest.length) top.push({ k: "Other", n: rest.reduce((a, s) => a + s.n, 0), views: rest.reduce((a, s) => a + s.views, 0) });
    bars($("#games"), top.map((s) => ({ label: s.k, value: s.views, dim: s.k === "Other",
      tip: `<b>${esc(s.k)}</b><br>${fmt(s.views)} views (${Math.round((s.views / tot) * 100)}%)<br>${s.n} uploads` })));
  }

  function formats(M) {
    const order = ["Video", "Live stream", "Short"];
    const st = groupStats(M.withViews, "format").sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
    bars($("#formats"), st.map((s) => ({ label: s.k, value: s.med,
      tip: `<b>${s.k}</b><br>${s.n} uploads<br>Median ${fmt(s.med)} views each<br>${(s.subs / s.views * 1000).toFixed(1)} subscribers per 1,000 views<br>${mmss(s.hours * 60 / s.views)} average view` })), { fmt: fmt });
  }

  function lengths(M) {
    const bands = [["Under 5 min", 60, 300], ["5 to 10 min", 300, 600], ["10 to 15 min", 600, 900], ["15 to 20 min", 900, 1200], ["20 to 40 min", 1200, 2400]];
    const vids = M.withViews.filter((v) => v.format === "Video");
    bars($("#lengths"), bands.map(([label, a, b]) => {
      const vs = vids.filter((v) => v.dur > a && v.dur <= b);
      const m = median(vs.map((v) => v.views));
      return { label, value: m, tip: `<b>${label}</b><br>${vs.length} videos<br>Median ${fmt(m)} views each` };
    }), { fmt: fmt });
  }

  function guides(M) {
    const vids = M.withViews.filter((v) => v.format === "Video");
    const g = vids.filter((v) => v.guide), o = vids.filter((v) => !v.guide);
    const tot = vids.reduce((a, v) => a + v.views, 0);
    const row = (label, vs) => { const m = median(vs.map((v) => v.views)); const sum = vs.reduce((a, v) => a + v.views, 0);
      return { label, value: m, tip: `<b>${label}</b><br>${vs.length} videos<br>Median ${fmt(m)} views each<br>${Math.round(sum / tot * 100)}% of all video views` }; };
    bars($("#guides"), [row("Guides and builds", g), row("Everything else", o)], { fmt: fmt });
  }

  function traffic() {
    if (!data.traffic) return;
    const rows = data.traffic.rows.filter((r) => r["Traffic source"] !== "Total").map((r) => ({ k: r["Traffic source"], v: num(r.Views) || 0, avd: r["Average view duration"] }));
    const tot = rows.reduce((a, r) => a + r.v, 0);
    rows.sort((a, b) => b.v - a.v);
    const top = rows.slice(0, 6), rest = rows.slice(6);
    const list = top.map((r) => ({ label: r.k, value: r.v, tip: `<b>${esc(r.k)}</b><br>${fmt(r.v)} views (${(r.v / tot * 100).toFixed(1)}%)<br>Average view ${esc(r.avd || "")}` }));
    if (rest.length) { const v = rest.reduce((a, r) => a + r.v, 0); list.push({ label: "Other sources", value: v, dim: true, tip: `<b>Other sources</b><br>${rest.length} smaller sources<br>${fmt(v)} views (${(v / tot * 100).toFixed(1)}%)` }); }
    bars($("#traffic"), list);
  }

  // Video table
  let sortKey = "views", sortDir = -1, showAll = false;
  function table(M) {
    const sel = $("#gameFilter");
    const current = sel.value;
    const names = [...new Set(M.videos.map((v) => v.game))].sort();
    sel.innerHTML = `<option value="">All games</option>` + names.map((n) => `<option${n === current ? " selected" : ""}>${esc(n)}</option>`).join("");
    const q = $("#search").value.trim().toLowerCase();
    let list = M.withViews.filter((v) => (!sel.value || v.game === sel.value) && (!q || v.title.toLowerCase().includes(q)));
    list.sort((a, b) => {
      const A = a[sortKey], B = b[sortKey];
      if (A == null) return 1; if (B == null) return -1;
      return (A > B ? 1 : A < B ? -1 : 0) * sortDir;
    });
    const shown = showAll ? list : list.slice(0, 15);
    $("#vbody").innerHTML = shown.map((v) => `<tr>
      <td class="title">${esc(v.title)}</td><td>${esc(v.game)}</td><td>${v.format}</td>
      <td>${v.pub ? v.pub.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not shown"}</td>
      <td class="num">${mmss(v.dur / 60)}</td><td class="num">${fmt(v.views)}</td><td class="num">${v.subs == null ? "" : fmt(v.subs)}</td><td class="num">${v.ctr == null ? "" : v.ctr.toFixed(1) + "%"}</td></tr>`).join("");
    $("#vcount").textContent = `Showing ${shown.length} of ${list.length} videos`;
    $("#toggleAll").textContent = showAll ? "Show top 15" : "Show all";
    $("#toggleAll").hidden = list.length <= 15;
    document.querySelectorAll(".vtable th[data-k]").forEach((th) => th.setAttribute("aria-sort", th.dataset.k === sortKey ? (sortDir < 0 ? "descending" : "ascending") : "none"));
  }

  let M;
  function render() {
    M = model();
    kpis(M); lineChart(M); games(M); formats(M); lengths(M); guides(M); traffic(); table(M);
  }

  // ---------- Wiring ----------
  document.querySelectorAll("#range button").forEach((b) => b.addEventListener("click", () => {
    range = b.dataset.r;
    document.querySelectorAll("#range button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    lineChart(M);
  }));
  document.querySelectorAll(".vtable th[data-k] button").forEach((btn) => btn.addEventListener("click", () => {
    const k = btn.parentElement.dataset.k;
    if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = k === "title" || k === "game" ? 1 : -1; }
    table(M);
  }));
  $("#gameFilter").addEventListener("change", () => table(M));
  $("#search").addEventListener("input", () => table(M));
  $("#toggleAll").addEventListener("click", () => { showAll = !showAll; table(M); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => M && lineChart(M), 150); });

  $("#files").addEventListener("change", async (e) => {
    const found = [];
    for (const f of e.target.files) {
      const p = parseCSV(await f.text());
      const k = kindOf(p.head);
      if (k) { data[k] = p; found.push(f.name + " (" + k + ")"); }
    }
    $("#loadmsg").textContent = found.length ? "Loaded: " + found.join(", ") + ". The findings text below still describes the original export." : "None of those files looked like a YouTube Studio export. Use Table data.csv from the Content or Traffic source export, or Totals.csv.";
    if (found.length) render();
  });

  Promise.all(["data/yt-content.csv", "data/yt-daily.csv", "data/yt-traffic.csv"].map((u) => fetch(u).then((r) => r.text())))
    .then(([c, d, t]) => { data.content = parseCSV(c); data.daily = parseCSV(d); data.traffic = parseCSV(t); render(); })
    .catch(() => { $("#asof").textContent = "Couldn't load the data files. If you opened this page straight from your computer, view it on the live site instead."; });
})();
