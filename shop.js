// E-commerce operations dashboard for a fictional supplements shop.
// Every figure on the page is calculated here from the made-up CSV files.

(function () {
  "use strict";
  const BLUE = "#2a78d6", ORANGE = "#eb6834", GREY = "#b9c0ca", GRID = "#e4e7eb";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const EVENTS = [[0, "New Year sale"], [1, "Best-seller out of stock"], [8, "Paid ads increased"], [10, "Black Friday"]];

  const $ = (s) => document.querySelector(s);
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
  const gbp = (n, d = 0) => "£" + fmt(n, d);
  const kgbp = (n) => (n >= 1e6 ? "£" + (n / 1e6).toFixed(2) + "m" : n >= 1e4 ? "£" + Math.round(n / 1e3) + "k" : gbp(n));
  const knum = (n) => (n >= 1e4 ? Math.round(n / 1e3) + "k" : fmt(n));
  const pct = (n, d = 1) => (n * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mon = (dateStr) => +dateStr.slice(5, 7) - 1;
  const sum = (a, f) => a.reduce((t, r) => t + (f ? f(r) : r), 0);

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
    return rows.filter((r) => r.length === head.length).map((r) => {
      const o = {};
      head.forEach((h, i) => { const v = r[i]; o[h] = v !== "" && !isNaN(v) && !/^\d{4}-\d\d-\d\d/.test(v) ? Number(v) : v; });
      return o;
    });
  }

  // ---------- tooltip ----------
  const tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip);
  const showTip = (html, x, y) => {
    tip.innerHTML = html; tip.style.display = "block";
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 14) + "px";
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + "px";
  };
  const hideTip = () => (tip.style.display = "none");

  // ---------- charts ----------
  // series: [{name, color, values, type: "line"|"bar"}]; labels: x labels; fmtY for axis and tooltip
  function chart(el, labels, series, opts = {}) {
    const W = Math.max(300, el.clientWidth), H = opts.height || (W < 600 ? 220 : 260);
    const pad = { l: 52, r: 12, t: opts.events ? 22 : 10, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const all = series.flatMap((s) => s.values);
    const max = Math.max(...all) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const top = opts.top || Math.ceil(max / (mag / 2)) * (mag / 2);
    const n = labels.length, band = iw / n;
    const x = (i) => pad.l + band * i + band / 2;
    const y = (v) => pad.t + ih - (v / top) * ih;
    const f = opts.fmtY || knum;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "chart")}">`;
    [0, top / 2, top].forEach((t) => (s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${f(t)}</text>`));
    const step = W < 600 && labels.every((l) => l) ? 2 : 1;
    labels.forEach((l, i) => { if (i % step === 0) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${l}</text>`; });
    if (opts.events) opts.events.forEach(([i], k) => {
      s += `<g class="event"><line x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${pad.t + ih}" stroke="#9aa3ae"/><text x="${x(i)}" y="${pad.t - 6}" text-anchor="middle">${k + 1}</text></g>`;
    });
    const bars = series.filter((d) => d.type === "bar");
    const bw = Math.min(28, (band * 0.7) / Math.max(1, bars.length));
    bars.forEach((d, j) => d.values.forEach((v, i) => {
      const bx = x(i) - (bw * bars.length) / 2 + j * bw + 1, h = Math.max(0, y(0) - y(v));
      if (h > 0) s += `<path d="M${bx} ${y(0)} V${y(v) + Math.min(4, h)} q0 -4 4 -4 H${bx + bw - 6} q4 0 4 4 V${y(0)} Z" fill="${d.color}"/>`;
    }));
    series.filter((d) => d.type !== "bar").forEach((d) => {
      s += `<path d="${d.values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ")}" fill="none" stroke="${d.color}" stroke-width="2" stroke-linejoin="round"/>`;
      d.values.forEach((v, i) => (s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${d.color}"/>`));
    });
    s += `<line class="xh" y1="${pad.t}" y2="${pad.t + ih}" stroke="#111827" visibility="hidden"/>`;
    s += `<rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = s + (opts.events ? `<p class="event-key">${opts.events.map(([i, t], k) => `<span><b>${k + 1}</b> ${esc(t)}, ${labels[i]}</span>`).join("")}</p>` : "");
    const svg = el.querySelector("svg"), xh = svg.querySelector(".xh");
    const hit = svg.querySelector(".hit");
    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.floor((((e.clientX - r.left) / r.width) * W - pad.l) / band)));
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
      const ev = opts.events && opts.events.find(([k]) => k === i);
      showTip(`<b>${opts.tipTitle ? opts.tipTitle(i) : labels[i]}</b>` + series.map((d) => `<br>${esc(d.name)}: ${(opts.fmtTip || f)(d.values[i])}`).join("") + (ev ? `<br>${esc(ev[1])}` : ""), e.clientX, e.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); xh.setAttribute("visibility", "hidden"); });
  }

  function legend(el, series) {
    el.innerHTML = series.map((d) => `<span class="${d.type === "bar" ? "bar" : ""}" style="--c:${d.color}">${esc(d.name)}</span>`).join("");
  }

  function bars(el, rows, f) {
    const max = Math.max(...rows.map((r) => r.value)) || 1;
    el.innerHTML = rows.map((r, i) => `<li data-i="${i}"><span class="name">${esc(r.label)}</span><span class="track"><span class="fill" style="width:${(r.value / max) * 100}%;display:block"></span></span><span class="val">${f(r.value)}</span></li>`).join("");
    el.querySelectorAll("li").forEach((li) => {
      const r = rows[+li.dataset.i];
      li.addEventListener("pointermove", (e) => showTip(r.tip, e.clientX, e.clientY));
      li.addEventListener("pointerleave", hideTip);
    });
  }

  const tiles = (el, items) => (el.innerHTML = items.map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join(""));

  // ---------- page ----------
  let D, drawers = [];
  function render() {
    const { products, sales, stock, ga, ads, gsc } = D;
    const P = Object.fromEntries(products.map((p) => [p.SKU, p]));
    const byMonth = (rows, dateKey, f) => { const m = Array(12).fill(0); rows.forEach((r) => (m[mon(r[dateKey])] += f(r))); return m; };

    // Headline figures
    const rev = sum(sales, (r) => r.NetRevenue), cogs = sum(sales, (r) => r.COGS);
    const orders = sum(ga, (r) => r["Ecommerce purchases"]);
    const spend = sum(ads, (r) => r.Cost), adval = sum(ads, (r) => r["Conversion value"]);
    tiles($("#kpis"), [
      ["Sales", kgbp(rev), gbp(rev) + " after discounts"],
      ["Orders", fmt(orders), fmt(sum(ga, (r) => r.Sessions)) + " website visits"],
      ["Average order", gbp(rev / orders, 2), "sales per order"],
      ["Gross margin", pct((rev - cogs) / rev), "after product costs"],
      ["Ad spend", kgbp(spend), "Google and Meta"],
      ["Return on ad spend", "£" + (adval / spend).toFixed(2), "sales per £1, as tracked"],
    ]);

    const salesM = byMonth(sales, "OrderDate", (r) => r.NetRevenue);
    drawers.push(() => chart($("#salesChart"), MONTHS, [{ name: "Sales", color: BLUE, values: salesM, type: "bar" }], { events: EVENTS, fmtY: kgbp, fmtTip: (v) => gbp(v), label: "Monthly sales" }));

    // ---- Story 1: stock-out and drop-ship ----
    const ds = sales.filter((r) => r.DropShipUnits > 0);
    const dsUnits = sum(ds, (r) => r.DropShipUnits), dsRev = sum(ds, (r) => r.DropShipRevenue), dsCost = sum(ds, (r) => r.DropShipCOGS);
    const dsSku = ds.length ? ds.reduce((a, r) => (a[r.SKU] = (a[r.SKU] || 0) + r.DropShipUnits, a), {}) : {};
    const mainSku = Object.keys(dsSku).sort((a, b) => dsSku[b] - dsSku[a])[0] || products[0].SKU;
    const own = sales.filter((r) => r.SKU === mainSku);
    const ownRev = sum(own, (r) => r.NetRevenue - r.DropShipRevenue), ownCost = sum(own, (r) => r.COGS - r.DropShipCOGS);
    const ownM = 1 - ownCost / ownRev, dsM = dsRev ? 1 - dsCost / dsRev : 0;
    const daysOut = sum(stock.filter((r) => r.SKU === mainSku), (r) => r.DaysOutOfStock);
    tiles($("#stockKpis"), [
      ["Days out of stock", fmt(daysOut), esc(P[mainSku].Product)],
      ["Units drop-shipped", fmt(dsUnits), gbp(dsRev) + " of sales kept"],
      ["Margin on those units", pct(dsM), "against " + pct(ownM) + " from own stock"],
      ["Margin given up", gbp(dsRev * (ownM - dsM)), "the cost of keeping those orders"],
    ]);

    const pick = $("#skuPick");
    if (!pick.options.length) {
      pick.innerHTML = products.map((p) => `<option value="${p.SKU}"${p.SKU === mainSku ? " selected" : ""}>${esc(p.Product)}</option>`).join("");
      pick.addEventListener("change", () => drawStock());
    }
    function drawStock() {
      const rows = stock.filter((r) => r.SKU === pick.value).sort((a, b) => (a.WeekStart < b.WeekStart ? -1 : 1));
      const lab = rows.map((r) => { const d = new Date(r.WeekStart); return d.getDate() + " " + MONTHS[d.getMonth()]; });
      const series = [
        { name: "Stock at end of week", color: BLUE, values: rows.map((r) => r.Closing) },
        { name: "Units drop-shipped", color: ORANGE, values: rows.map((r) => r.DropShipped), type: "bar" },
      ];
      legend($("#stockLegend"), series);
      const el = $("#stockChart");
      const every = el.clientWidth < 600 ? 13 : 4;
      chart(el, lab.map((l, i) => (i % every === 0 ? l : "")), series, { fmtY: fmt, label: "Weekly stock", tipTitle: (i) => "Week of " + lab[i] });
    }
    drawers.push(drawStock);

    // stock table
    const last = stock.reduce((m, r) => (r.WeekStart > m ? r.WeekStart : m), "");
    const recentFrom = new Date(new Date(last) - 12 * 7 * 864e5).toISOString().slice(0, 10);
    const trows = products.map((p) => {
      const s = sales.filter((r) => r.SKU === p.SKU);
      const units = sum(s, (r) => r.Units), revp = sum(s, (r) => r.NetRevenue), cost = sum(s, (r) => r.COGS);
      const st = stock.filter((r) => r.SKU === p.SKU);
      const now = st.find((r) => r.WeekStart === last).Closing;
      const weekly = sum(st.filter((r) => r.WeekStart > recentFrom), (r) => r.Sold + r.DropShipped) / 12;
      const cover = weekly ? now / weekly : Infinity;
      return { p, units, revp, margin: (revp - cost) / revp, now, cover, out: sum(st, (r) => r.DaysOutOfStock), dsu: sum(s, (r) => r.DropShipUnits) };
    }).sort((a, b) => b.revp - a.revp);
    $("#stockBody").innerHTML = trows.map((r) => `<tr><td class="title">${esc(r.p.Product)}</td><td class="num">${fmt(r.units)}</td><td class="num">${gbp(r.revp)}</td><td class="num">${pct(r.margin)}</td><td class="num">${fmt(r.now)}</td><td class="num">${isFinite(r.cover) ? r.cover.toFixed(1) : ""}</td><td class="num">${r.out || ""}</td><td class="num">${r.dsu || ""}</td></tr>`).join("");

    // ---- Story 2: organic click-through and paid ads ----
    const gImp = byMonth(gsc, "Date", (r) => r.Impressions), gClk = byMonth(gsc, "Date", (r) => r.Clicks);
    const ctr = gImp.map((v, i) => (gClk[i] / v) * 100);
    const ctrS = [{ name: "Click-through rate from Google search", color: BLUE, values: ctr }];
    drawers.push(() => chart($("#ctrChart"), MONTHS, ctrS, { fmtY: (v) => v.toFixed(1) + "%", top: 5, label: "Organic click-through rate", fmtTip: (v) => v.toFixed(2) + "%" }));
    const spendS = ["Google Ads", "Meta Ads"].map((pl, j) => ({ name: pl === "Meta Ads" ? "Facebook (Meta) ads" : "Google PPC", color: j ? ORANGE : BLUE, type: "bar",
      values: byMonth(ads.filter((r) => r.Platform === pl), "Date", (r) => r.Cost) }));
    legend($("#spendLegend"), spendS);
    drawers.push(() => chart($("#spendChart"), MONTHS, spendS, { fmtY: kgbp, fmtTip: (v) => gbp(v), label: "Monthly ad spend" }));
    const visS = [
      { name: "Visits from Google search", color: BLUE, values: byMonth(ga.filter((r) => r["Session default channel group"] === "Organic Search"), "Date", (r) => r.Sessions) },
      { name: "Visits from paid ads", color: ORANGE, values: byMonth(ga.filter((r) => /^Paid/.test(r["Session default channel group"])), "Date", (r) => r.Sessions) },
    ];
    legend($("#visitLegend"), visS);
    drawers.push(() => chart($("#visitChart"), MONTHS, visS, { fmtY: knum, fmtTip: fmt, label: "Monthly visits by source" }));

    // ---- Story 3: campaign tracking ----
    const camps = {};
    ads.forEach((r) => {
      const c = (camps[r.Campaign] ||= { platform: r.Platform, cost: 0, impr: 0, clicks: 0, conv: 0, val: 0 });
      c.cost += r.Cost; c.impr += r.Impressions; c.clicks += r.Clicks; c.conv += r.Conversions; c.val += r["Conversion value"];
    });
    $("#campBody").innerHTML = Object.entries(camps).sort((a, b) => b[1].cost - a[1].cost).map(([n, c]) => `<tr><td class="title">${esc(n)}</td><td>${c.platform === "Meta Ads" ? "Facebook (Meta)" : "Google"}</td><td class="num">${gbp(c.cost)}</td><td class="num">${fmt(c.clicks)}</td><td class="num">${pct(c.clicks / c.impr, 2)}</td><td class="num">${gbp(c.cost / c.clicks, 2)}</td><td class="num">${fmt(c.conv)}</td><td class="num">${gbp(c.cost / c.conv, 2)}</td><td class="num">£${(c.val / c.cost).toFixed(2)}</td></tr>`).join("");

    // channels and funnel
    const ch = {};
    ga.forEach((r) => {
      const c = (ch[r["Session default channel group"]] ||= { s: 0, o: 0, v: 0, a: 0, k: 0 });
      c.s += r.Sessions; c.o += r["Ecommerce purchases"]; c.v += r["Purchase revenue"]; c.a += r["Add to carts"]; c.k += r.Checkouts;
    });
    bars($("#channels"), Object.entries(ch).sort((a, b) => b[1].v - a[1].v).map(([k, c]) => ({ label: k, value: c.v,
      tip: `<b>${esc(k)}</b><br>${fmt(c.s)} visits<br>${fmt(c.o)} orders (${pct(c.o / c.s, 2)} of visits)<br>${gbp(c.v)} sales` })), kgbp);
    const tot = Object.values(ch).reduce((t, c) => ({ s: t.s + c.s, a: t.a + c.a, k: t.k + c.k, o: t.o + c.o }), { s: 0, a: 0, k: 0, o: 0 });
    bars($("#funnel"), [["Visits", tot.s], ["Added to basket", tot.a], ["Started checkout", tot.k], ["Ordered", tot.o]].map(([l, v]) => ({ label: l, value: v,
      tip: `<b>${l}</b><br>${fmt(v)}<br>${pct(v / tot.s, 2)} of visits` })), knum);

    drawers.forEach((d) => d());
  }

  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => drawers.forEach((d) => d()), 150); });

  const files = ["shop-products.csv", "shop-daily-sales.csv", "shop-stock-weekly.csv", "shop-ga-channels.csv", "shop-ad-campaigns.csv", "shop-search-console.csv"];
  Promise.all(files.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.text(); })))
    .then((t) => {
      const [products, sales, stock, ga, ads, gsc] = t.map(parseCSV);
      D = { products, sales, stock, ga, ads, gsc };
      render();
    })
    .catch((e) => { $("#asof").textContent = "Couldn't load " + e.message + ". The CSV files need to sit next to this page."; });
})();
