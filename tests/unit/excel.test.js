import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importWorkbook, exportWorkbook } from "../../js/excel.js";
import { readXlsx, writeXlsx, zip, unzip, colName, colIndex, escapeXml, unescapeXml } from "../../js/xlsx.js";
import { monthSummary } from "../../js/model.js";

const sample = () => readFile(new URL("../fixtures/sample.xlsx", import.meta.url));
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

test("columns: names and numbers both ways", () => {
  for (const [n, s] of [[0, "A"], [25, "Z"], [26, "AA"], [248, "IO"], [701, "ZZ"], [702, "AAA"]]) { assert.equal(colName(n), s); assert.equal(colIndex(s), n); }
});

test("XML text: escaped on the way out, restored on the way in, forbidden characters dropped", () => {
  assert.equal(escapeXml('a<b>&"c"'), "a&lt;b&gt;&amp;&quot;c&quot;");
  assert.equal(unescapeXml("&lt;&amp;&#233;&#x41;"), "<&éA");
  assert.equal(escapeXml("ok\u0000\u0007"), "ok");
});

test("the original layout imports: months, years, categories, savings, conclusion, accounts, goals", async () => {
  const r = await importWorkbook(await sample());
  assert.equal(r.months, 3);
  assert.deepEqual([...new Set(r.entries.map((e) => e.month))].sort(), ["2025-11", "2025-12", "2026-01"]);
  const kind = Object.fromEntries(r.categories.map((c) => [c.name.toLowerCase(), c.kind]));
  assert.equal(kind.poupanca, "saving");
  assert.equal(kind.investimento, "saving");
  assert.equal(kind.alimentacao, "expense");
  assert.equal(kind["nova categoria"], "expense", "a category used only in the statement is added");
  const jan = r.entries.filter((e) => e.month === "2026-01");
  assert.ok(jan.some((e) => e.desc === "livro <b>&amp;</b>" && e.amount === 1240), "text kept as typed, '12,40' read as 12.40");
  assert.equal(r.conclusions["2026-01"], "mês de teste\nsegunda linha");
  assert.equal(r.conclusions["2025-12"], undefined, "a dash is not a conclusion");
  assert.deepEqual(r.warnings.filter((w) => w.issue === "merged").map((w) => [w.month, w.from, w.to]), [["2025-12", "transportes", "Transporte"]]);
  assert.equal(monthSummary(r.entries, r.categories, "2025-12").rows.find((x) => x.cat.name === "Transporte").total, 1110, "the misspelt row counts in its category");
  assert.equal(r.accounts.length, 2);
  assert.deepEqual(r.accounts[0].last, { desc: "Mercado", date: "2026-01-27", amount: 1174 });
  const ferias = r.goals.find((g) => g.name === "férias");
  assert.equal(ferias.target, 100000);
  assert.equal(ferias.movements.reduce((s, m) => s + m.amount, 0), 30000, "the sheet's current value wins");
  assert.ok(ferias.movements.some((m) => m.date === "2026-02-18"), "dd-mm-yy text dates read");
  assert.equal(r.goals.find((g) => g.name === "dívida").target, null);
  const sum = monthSummary(r.entries, r.categories, "2026-01");
  assert.equal(sum.saved, 5000);
  assert.equal(sum.spent, 3156 + 40000 + 699 + 1250 + 500 + 1240);
});

test("export then import gives the same months, entries, totals and conclusions back", async () => {
  const first = await importWorkbook(await sample());
  first.entries[0].split = { with: "Ana", paidBy: "me", mine: 1000, settled: false };
  const blob = await exportWorkbook(first, { lang: "pt" });
  const again = await importWorkbook(await bytes(blob));
  assert.equal(again.months, first.months);
  for (const m of ["2025-11", "2025-12", "2026-01"]) {
    const a = monthSummary(first.entries, first.categories, m), b = monthSummary(again.entries, again.categories, m);
    assert.equal(b.spent, a.spent, m); assert.equal(b.saved, a.saved, m); assert.equal(b.count, a.count, m);
  }
  assert.equal(again.conclusions["2026-01"], first.conclusions["2026-01"]);
  assert.deepEqual(again.accounts.map((a) => a.last), first.accounts.map((a) => a.last));
  assert.deepEqual(again.goals.map((g) => [g.name, g.target]), first.goals.map((g) => [g.name, g.target]));
});

test("the export has the original sheets plus a flat list, with working formulas", async () => {
  const st = await importWorkbook(await sample());
  const sheets = await readXlsx(await bytes(await exportWorkbook(st, { lang: "en" })));
  assert.deepEqual(sheets.map((s) => s.name), ["Main", "Goals", "Entries"]);
  const main = sheets[0];
  assert.ok([...main.formulas.values()].some((f) => f.startsWith("SUMIF(")));
  assert.ok([...main.formulas.values()].some((f) => /^SUM\([A-Z]+9:/.test(f)));
  assert.equal(sheets[2].cells.get("A1"), "date");
  assert.equal([...sheets[2].cells.keys()].filter((k) => k.startsWith("C") && k !== "C1").length, st.entries.length);
});

test("text that looks like a formula is written as plain text, never run by Excel", async () => {
  const st = { categories: [{ id: "c", name: "outros", kind: "expense", order: 0 }], entries: [{ id: "1", month: "2026-01", date: null, desc: "=HYPERLINK(\"http://x\")", cat: "c", amount: 100, account: null, split: null, note: "+cmd" }], conclusions: {}, accounts: [], goals: [] };
  const sheets = await readXlsx(await bytes(await exportWorkbook(st)));
  const flat = sheets[2];
  assert.ok(![...flat.formulas.values()].length, "no formulas in the flat list");
  assert.equal(flat.cells.get("C2"), "=HYPERLINK(\"http://x\")");
});

test("written files are real zips that read back byte for byte", async () => {
  const enc = new TextEncoder();
  const z = await bytes(await zip([["a.txt", "olá"], ["b/c.xml", "<x/>".repeat(1000)]]));
  const files = await unzip(z);
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "olá");
  assert.equal(files.get("b/c.xml").length, enc.encode("<x/>".repeat(1000)).length);
  const rt = await readXlsx(await bytes(await writeXlsx([{ name: "S", rows: [["a", 1.5, { f: "SUM(B1:B1)" }, true]] }])));
  assert.equal(rt[0].cells.get("A1"), "a"); assert.equal(rt[0].cells.get("B1"), 1.5); assert.equal(rt[0].formulas.get("C1"), "SUM(B1:B1)");
});

test("files that are not spreadsheets are refused, not crashed on", async () => {
  await assert.rejects(importWorkbook(new TextEncoder().encode("hello")), /not-xlsx/);
  await assert.rejects(importWorkbook(new Uint8Array(0)), /not-xlsx/);
  const notOurs = await bytes(await writeXlsx([{ name: "Other", rows: [["nothing", "here"]] }]));
  await assert.rejects(importWorkbook(notOurs), /no-layout/);
  // a truncated file
  const s = await sample();
  await assert.rejects(importWorkbook(s.subarray(0, s.length - 100)), /not-xlsx/);
});

test("a zip bomb is stopped before it fills memory", async () => {
  const huge = new Uint8Array(210 * 1024 * 1024); // 210 MB of zeros compresses to ~200 KB
  const z = await bytes(await zip([["xl/workbook.xml", huge]]));
  assert.ok(z.length < 2_000_000);
  await assert.rejects(unzip(z), /too-big/);
});
