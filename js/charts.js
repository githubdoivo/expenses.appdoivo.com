// Hand-made SVG bar charts: one series each (so one colour and no legend box; the
// title names it), thin bars with a rounded top on a shared baseline, recessive
// grid, a tooltip on hover and keyboard focus, and the same numbers as a table.
// All text goes in with textContent, never as HTML.
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };

function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }

// Column chart. data: [{ label, value (cents), title (long label) }]
export function columns(host, data, { format, short = format, tableHeads = ["", ""], tableLabel = "" } = {}) {
  host.replaceChildren();
  const fig = document.createElement("div"); fig.className = "chart"; host.appendChild(fig);
  const W = 640, H = 240, padL = 56, padB = 28, padT = 12, padR = 8;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": tableLabel, class: "chart-svg" }, fig);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value))), allZero = !data.some((d) => d.value > 0);
  const narrow = (host.clientWidth || 640) < 520;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    el("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: i ? "grid" : "axis" }, svg);
    if (allZero && i) continue; // no data: one €0 line, not five
    const t = el("text", { x: padL - 8, y: y + 4, class: "tick", "text-anchor": "end" }, svg); t.textContent = short((max * i) / 4);
  }
  const n = Math.max(1, data.length), slot = plotW / n, bw = Math.max(2, Math.min(36, slot - 2));
  const every = Math.ceil(n / (narrow ? 6 : 12)); // fewer labels on a phone, so they stay readable
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; tip.setAttribute("role", "status"); fig.appendChild(tip);
  const show = (d, x) => {
    tip.replaceChildren(); const b = document.createElement("strong"); b.textContent = format(d.value); const s = document.createElement("span"); s.textContent = d.title || d.label;
    tip.append(b, s); tip.hidden = false;
    const r = fig.getBoundingClientRect(), left = (x / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 60), r.width - 60)}px`;
  };
  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2, h = (plotH * Math.max(0, d.value)) / max, y = padT + plotH - h;
    const g = el("g", { class: "bar", tabindex: "0", role: "img", "aria-label": `${d.title || d.label}: ${format(d.value)}` }, svg);
    el("rect", { x: padL + i * slot, y: padT, width: slot, height: plotH, class: "hit" }, g);
    if (h > 0) {
      const r = Math.min(4, bw / 2, h);
      el("path", { d: `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`, class: "mark" }, g);
    }
    if (i % every === 0) { const t = el("text", { x: x + bw / 2, y: H - 8, class: "tick", "text-anchor": "middle" }, svg); t.textContent = d.label; }
    const on = () => show(d, x + bw / 2), off = () => { tip.hidden = true; };
    g.addEventListener("pointerenter", on); g.addEventListener("focus", on); g.addEventListener("pointerleave", off); g.addEventListener("blur", off);
  });
  return table(host, data, format, tableHeads, tableLabel);
}

// Horizontal bars, biggest first: category totals. Labels sit on the left in text ink.
export function hbars(host, data, { format, tableHeads = ["", ""], tableLabel = "", empty = "" } = {}) {
  host.replaceChildren();
  if (!data.length && empty) { const p = document.createElement("p"); p.className = "empty"; p.textContent = empty; host.appendChild(p); return null; }
  const list = document.createElement("ol"); list.className = "hbars"; list.setAttribute("aria-label", tableLabel); host.appendChild(list);
  const max = Math.max(1, ...data.map((d) => d.value)), total = data.reduce((s, d) => s + d.value, 0) || 1;
  for (const d of data) {
    const li = document.createElement("li");
    const name = document.createElement("span"); name.className = "hb-name"; name.textContent = d.label;
    const track = document.createElement("span"); track.className = "hb-track"; track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span"); bar.className = "hb-bar"; bar.style.width = `${Math.max(0.5, (100 * d.value) / max)}%`; track.appendChild(bar);
    const val = document.createElement("span"); val.className = "hb-val"; val.textContent = `${format(d.value)} · ${Math.round((100 * d.value) / total)}%`;
    li.append(name, track, val); list.appendChild(li);
  }
  return null;
}

function table(host, data, format, heads, label) {
  const wrap = document.createElement("div"); wrap.className = "chart-table"; wrap.hidden = true;
  const t = document.createElement("table"); t.setAttribute("aria-label", label);
  const tr = t.createTHead().insertRow();
  for (const h of heads) { const th = document.createElement("th"); th.scope = "col"; th.textContent = h; tr.appendChild(th); }
  const tb = t.createTBody();
  for (const d of data) { const r = tb.insertRow(); const a = document.createElement("th"); a.scope = "row"; a.textContent = d.title || d.label; r.appendChild(a); r.insertCell().textContent = format(d.value); }
  wrap.appendChild(t); host.appendChild(wrap);
  return wrap;
}
