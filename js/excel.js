// The spreadsheet layout this app grew out of, read and written both ways.
//
// "Main" sheet: one block of 3 columns per month, newest on the left.
//   row 5: the year (only where a new year starts)    row 6: month name
//   row 8: "maior despesa | categoria | valor"          rows 9..: one row per category
//   "total" row (=SUM over the expense rows; rows after it are savings)
//   "conclusao" label, the conclusion below it          "extrato", then the header
//   "despesa | categoria | valor", then one row per expense
//   A1 "Updated": accounts in column B, the last entry brought in (desc, date, value) in D..F
// "Goals" sheet: one block of 3 columns per goal: name, minimum, current, to put back,
//   then movements (description, date, value) under a header row.
import { readXlsx, writeXlsx, ref, parseRef, colName, fromSerial, S } from "./xlsx.js";
import { fold, toCents, uid, findCategory, sortCats, monthSummary, myCost, formatMoney, isDate } from "./model.js";

const MONTHS = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const PT_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LABEL = {
  pt: { updated: "Updated", summary: "resumo", biggest: "maior despesa", category: "categoria", value: "valor", total: "total", conclusion: "conclusao", statement: "extrato", expense: "despesa",
        min: "valor mínimo", current: "valor atual", missing: "valor a repor", movement: "movimento", date: "data", entries: "Entradas", goals: "Goals", main: "Main",
        flat: ["data", "mês", "despesa", "categoria", "valor pago", "a minha parte", "conta", "dividida com", "pago por", "acertada", "nota"], me: "eu", them: "outra pessoa", yes: "sim", no: "não" },
  en: { updated: "Updated", summary: "summary", biggest: "biggest expense", category: "category", value: "value", total: "total", conclusion: "conclusion", statement: "statement", expense: "expense",
        min: "minimum", current: "current", missing: "to put back", movement: "movement", date: "date", entries: "Entries", goals: "Goals", main: "Main",
        flat: ["date", "month", "expense", "category", "amount paid", "my share", "account", "split with", "paid by", "settled", "note"], me: "me", them: "them", yes: "yes", no: "no" },
};

const at = (sh, col, row) => sh.cells.get(ref(col, row));
const text = (v) => (v === undefined || v === null ? "" : String(v).trim());
const isDash = (v) => v === undefined || v === null || /^[-–—\s]*$/.test(String(v));
const MAX_ENTRIES = 200000;

function toDate(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) return fromSerial(v);
  const s = text(v); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; const d = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return isDate(d) ? d : null; }
  return null;
}

/* ---------- import ---------- */
export async function importWorkbook(bytes, { lang = "pt" } = {}) {
  const sheets = await readXlsx(bytes);
  const main = sheets.find((s) => fold(s.name) === "main") || sheets.find((s) => [...s.cells.values()].some((v) => fold(v) === "extrato" || fold(v) === "statement"));
  if (!main) throw new Error("no-layout");
  const warnings = [];
  const categories = [], entries = [], conclusions = {};
  // "servicos" typed for "servico" is the same category (the original sheet silently
  // left such rows out of its totals); merged, and reported so nothing is hidden.
  const stem = (s) => fold(s).replace(/s$/, "");
  const catFor = (name, kind = "expense", month = null) => {
    let c = findCategory(categories, name);
    if (!c) { c = categories.find((x) => stem(x.name) === stem(name)); if (c) warnings.push({ month, issue: "merged", from: name, to: c.name }); }
    if (!c) { c = { id: uid(), name: name.charAt(0).toUpperCase() + name.slice(1), kind, order: categories.length, hidden: false }; categories.push(c); }
    return c;
  };

  // month blocks: a month name in some row (6 in the original), every 3 columns
  let monthRow = -1;
  for (let r = 0; r < 20 && monthRow < 0; r++) if (MONTHS[fold(at(main, 0, r))] || MONTHS[fold(at(main, 1, r))]) monthRow = r;
  if (monthRow < 0) throw new Error("no-layout");
  let maxCol = 0, maxRow = 0;
  for (const k of main.cells.keys()) { const p = parseRef(k); if (p) { maxCol = Math.max(maxCol, p.col); maxRow = Math.max(maxRow, p.row); } }
  let year = null;
  const blocks = [];
  for (let c = 0; c <= maxCol; c++) {
    const y = at(main, c, monthRow - 1);
    if (typeof y === "number" && y > 1990 && y < 2200) year = y;
    const mo = MONTHS[fold(at(main, c, monthRow))];
    if (mo && year) blocks.push({ col: c, month: `${year}-${String(mo).padStart(2, "0")}` });
  }
  if (!blocks.length) throw new Error("no-layout");

  for (const { col, month } of blocks) {
    // the category list, the total row and the savings rows after it
    let r = monthRow + 1;
    while (r < monthRow + 6 && fold(at(main, col + 1, r)) !== "categoria" && fold(at(main, col + 1, r)) !== "category") r++;
    let totalRow = -1, lastExpenseRow = -1;
    const catRows = [];
    for (let i = r + 1; i < r + 60; i++) {
      const name = text(at(main, col + 1, i));
      if (fold(name) === "total") {
        totalRow = i;
        const f = main.formulas.get(ref(col + 2, i)) || "";
        const m = /SUM\(\s*[A-Z]+(\d+)\s*:\s*[A-Z]+(\d+)\s*\)/i.exec(f);
        lastExpenseRow = m ? Number(m[2]) - 1 : -1;
        break;
      }
      if (name) catRows.push([i, name]);
    }
    for (const [i, name] of catRows) {
      const saving = lastExpenseRow >= 0 ? i > lastExpenseRow : /poupan|invest|saving/.test(fold(name));
      catFor(name, saving ? "saving" : "expense");
    }
    // the conclusion and the statement
    let entryStart = -1;
    for (let i = Math.max(totalRow, r) + 1; i <= Math.min(maxRow, Math.max(totalRow, r) + 12); i++) {
      const v = fold(at(main, col, i));
      if (v === "conclusao" || v === "conclusion") { const t = text(at(main, col, i + 1)); if (t && !isDash(t)) conclusions[month] = t.slice(0, 2000); }
      if (v === "despesa" || v === "expense") { entryStart = i + 1; break; }
    }
    if (entryStart < 0) { warnings.push({ month, issue: "no-statement" }); continue; }
    for (let i = entryStart; i <= maxRow; i++) {
      const desc = text(at(main, col, i)), cat = text(at(main, col + 1, i)), val = at(main, col + 2, i);
      if (!desc && !cat && (val === undefined || val === null)) continue;
      const amount = toCents(val);
      if (!desc || !Number.isFinite(amount) || amount === 0) { warnings.push({ month, row: i + 1, issue: "skipped", desc }); continue; }
      const c = cat ? catFor(cat, "expense", month) : catFor(lang === "pt" ? "outros" : "other");
      entries.push({ id: uid(), month, date: null, desc: desc.slice(0, 200), cat: c.id, amount, account: null, split: null, note: "" });
      if (entries.length > MAX_ENTRIES) throw new Error("too-big");
    }
  }

  // the "Updated" box
  const accounts = [];
  if (fold(at(main, 0, 0)) === "updated") {
    for (let i = 0; i < monthRow - 1; i++) {
      const name = text(at(main, 1, i)); if (!name) continue;
      const desc = text(at(main, 3, i)), date = toDate(at(main, 4, i)), amount = toCents(at(main, 5, i));
      accounts.push({ id: uid(), name: name.slice(0, 60), last: desc && date ? { desc: desc.slice(0, 200), date, amount: Number.isFinite(amount) ? amount : 0 } : null });
    }
  }

  // goals
  const goals = [];
  const gs = sheets.find((s) => fold(s.name) === "goals" || fold(s.name) === "objetivos");
  if (gs) {
    for (let c = 0; c < 60; c += 3) {
      const name = text(at(gs, c, 0)); if (!name) continue;
      let target = null, current = null, header = -1;
      for (let i = 1; i < 30; i++) {
        const label = fold(at(gs, c, i));
        if (/minimo|minimum/.test(label)) { const v = toCents(at(gs, c, i + 1)); target = Number.isFinite(v) && v > 0 ? v : null; }
        if (/atual|current/.test(label)) { const v = toCents(at(gs, c, i + 1)); current = Number.isFinite(v) ? v : null; }
        if (/movimento|movement/.test(label)) { header = i; break; }
      }
      const movements = [];
      if (header >= 0) for (let i = header + 1; i < header + 2000; i++) {
        const d = text(at(gs, c, i)), v = toCents(at(gs, c + 2, i));
        if (!d && !Number.isFinite(v)) { if (!at(gs, c, i + 1) && !at(gs, c, i + 2)) break; continue; }
        if (Number.isFinite(v)) movements.push({ id: uid(), desc: d.slice(0, 200), date: toDate(at(gs, c + 1, i)), amount: v });
      }
      // the sheet's "current" value is the truth; movements may not add up to it
      const sum = movements.reduce((s, m) => s + m.amount, 0);
      if (current !== null && current !== sum) movements.unshift({ id: uid(), desc: lang === "pt" ? "saldo importado" : "imported balance", date: null, amount: current - sum });
      goals.push({ id: uid(), name: name.slice(0, 60), target, movements });
    }
  }

  return { categories, entries, conclusions, accounts, goals, warnings, months: blocks.length };
}

/* ---------- export ---------- */
// Same shape as the original, so it opens like the old file, plus a flat "Entries"
// sheet (one row per expense, with date, account and split) that filters and pivots.
export async function exportWorkbook(state, { lang = "pt", locale = "pt-PT", currency = "EUR" } = {}) {
  const L = LABEL[lang] || LABEL.en;
  const cats = sortCats(state.categories).filter((c) => !c.hidden || state.entries.some((e) => e.cat === c.id));
  const expenseCats = cats.filter((c) => c.kind === "expense"), savingCats = cats.filter((c) => c.kind === "saving");
  const ordered = [...expenseCats, ...savingCats];
  const months = [...new Set(state.entries.map((e) => e.month).concat(Object.keys(state.conclusions || {})))].sort().reverse();
  const rows = []; const put = (r, c, v) => { (rows[r] ||= [])[c] = v; };
  const merges = [];
  const money = (c) => formatMoney(c, locale, currency);

  // the "Updated" box
  put(0, 0, { v: L.updated, s: S.bold });
  (state.accounts || []).forEach((a, i) => {
    put(i, 1, a.name);
    if (a.last) { put(i, 3, a.last.desc); put(i, 4, a.last.date && isDate(a.last.date) ? { v: new Date(a.last.date + "T00:00:00"), s: S.date } : a.last.date || ""); put(i, 5, { v: a.last.amount / 100, s: S.money }); }
  });

  const R = { year: 4, month: 5, summary: 6, head: 7, cats: 8 };
  const totalRow = R.cats + ordered.length, conclLabel = totalRow + 1, concl = totalRow + 2, stmtLabel = totalRow + 3, stmtHead = totalRow + 4, first = totalRow + 5;
  let maxEntries = 0;
  let lastYear = null;
  months.forEach((m, bi) => {
    const c = bi * 3, [y, mo] = m.split("-").map(Number);
    const A = colName(c), B = colName(c + 1), C = colName(c + 2);
    if (y !== lastYear) { put(R.year, c, { v: y, s: S.bold }); lastYear = y; }
    put(R.month, c, { v: lang === "pt" ? PT_MONTHS[mo - 1] : EN_MONTHS[mo - 1], s: S.header }); put(R.month, c + 1, { v: "", s: S.header }); put(R.month, c + 2, { v: "", s: S.header });
    merges.push(`${A}${R.month + 1}:${C}${R.month + 1}`);
    put(R.summary, c, { v: L.summary, s: S.bold }); merges.push(`${A}${R.summary + 1}:${C}${R.summary + 1}`);
    put(R.head, c, { v: L.biggest, s: S.bold }); put(R.head, c + 1, { v: L.category, s: S.bold }); put(R.head, c + 2, { v: L.value, s: S.bold });
    const sum = monthSummary(state.entries, cats, m);
    const mine = state.entries.filter((e) => e.month === m).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const lastRow = first + Math.max(mine.length, 1) + 300; // room to keep typing in Excel
    ordered.forEach((cat, i) => {
      const r = sum.rows.find((x) => x.cat.id === cat.id);
      put(R.cats + i, c, r?.biggest ? `${r.biggest.desc} - ${money(myCost(r.biggest))}` : "-");
      put(R.cats + i, c + 1, cat.name);
      put(R.cats + i, c + 2, { f: `SUMIF(${B}${first + 1}:${B}${lastRow},${B}${R.cats + i + 1},${C}${first + 1}:${C}${lastRow})`, s: S.money });
    });
    put(totalRow, c + 1, { v: L.total, s: S.bold });
    put(totalRow, c + 2, { f: expenseCats.length ? `SUM(${C}${R.cats + 1}:${C}${R.cats + expenseCats.length})` : "0", s: S.boldMoney });
    put(conclLabel, c, { v: L.conclusion, s: S.bold }); merges.push(`${A}${conclLabel + 1}:${C}${conclLabel + 1}`);
    put(concl, c, { v: state.conclusions?.[m] || "", s: S.wrap }); merges.push(`${A}${concl + 1}:${C}${concl + 1}`);
    put(stmtLabel, c, { v: L.statement, s: S.bold }); merges.push(`${A}${stmtLabel + 1}:${C}${stmtLabel + 1}`);
    put(stmtHead, c, { v: L.expense, s: S.bold }); put(stmtHead, c + 1, { v: L.category, s: S.bold }); put(stmtHead, c + 2, { v: L.value, s: S.bold });
    const byId = new Map(cats.map((x) => [x.id, x.name]));
    mine.forEach((e, i) => { put(first + i, c, e.desc); put(first + i, c + 1, byId.get(e.cat) || ""); put(first + i, c + 2, { v: myCost(e) / 100, s: S.money }); });
    maxEntries = Math.max(maxEntries, mine.length);
  });

  // goals
  const g = []; const gput = (r, c, v) => { (g[r] ||= [])[c] = v; }; const gm = [];
  (state.goals || []).forEach((goal, i) => {
    const c = i * 3, A = colName(c), C = colName(c + 2);
    gput(0, c, { v: goal.name, s: S.header }); gput(0, c + 1, { v: "", s: S.header }); gput(0, c + 2, { v: "", s: S.header }); gm.push(`${A}1:${C}1`);
    gput(1, c, { v: L.min, s: S.bold }); gput(2, c, goal.target ? { v: goal.target / 100, s: S.money } : "-");
    gput(3, c, { v: L.current, s: S.bold }); gput(4, c, { f: `SUM(${C}10:${C}${10 + goal.movements.length + 300})`, s: S.money });
    gput(5, c, { v: L.missing, s: S.bold }); gput(6, c, goal.target ? { f: `MAX(0,${A}3-${A}5)`, s: S.money } : "-");
    gput(7, c, { v: L.summary, s: S.bold });
    gput(8, c, { v: L.movement, s: S.bold }); gput(8, c + 1, { v: L.date, s: S.bold }); gput(8, c + 2, { v: L.value, s: S.bold });
    goal.movements.forEach((mv, j) => { gput(9 + j, c, mv.desc); gput(9 + j, c + 1, mv.date ? { v: new Date(mv.date + "T00:00:00"), s: S.date } : ""); gput(9 + j, c + 2, { v: mv.amount / 100, s: S.money }); });
  });

  // flat list
  const byId = new Map(state.categories.map((x) => [x.id, x.name]));
  const accName = new Map((state.accounts || []).map((a) => [a.id, a.name]));
  const flat = [L.flat.map((h) => ({ v: h, s: S.bold }))];
  for (const e of [...state.entries].sort((a, b) => (b.date || b.month).localeCompare(a.date || a.month))) {
    flat.push([e.date ? { v: new Date(e.date + "T00:00:00"), s: S.date } : "", e.month, e.desc, byId.get(e.cat) || "", { v: e.amount / 100, s: S.money }, { v: myCost(e) / 100, s: S.money },
      accName.get(e.account) || "", e.split?.with || "", e.split ? (e.split.paidBy === "me" ? L.me : L.them) : "", e.split ? (e.split.settled ? L.yes : L.no) : "", e.note || ""]);
  }

  return writeXlsx([
    { name: L.main, rows, merges, widths: months.flatMap(() => [26, 15, 11]).slice(0, 3 * Math.max(months.length, 2)) },
    { name: L.goals, rows: g, merges: gm, widths: (state.goals || []).flatMap(() => [24, 12, 11]) },
    { name: L.entries, rows: flat, widths: [12, 9, 30, 16, 12, 12, 14, 16, 12, 10, 30] },
  ]);
}
