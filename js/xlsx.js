// A small .xlsx reader and writer with no dependencies, so no third-party
// spreadsheet code runs on people's money data. Works in browsers and Node 18+
// (both have CompressionStream). Reads cell values (cached formula results
// included); writes values, formulas, a few styles, merged cells and widths.

const MAX_FILE = 30 * 1024 * 1024;        // refuse bigger uploads
const MAX_UNZIPPED = 200 * 1024 * 1024;   // zip-bomb guard (all parts together)

/* ---------- cell references ---------- */
export function colName(n) { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
export function colIndex(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
export function ref(col, row) { return colName(col) + (row + 1); }
export function parseRef(r) { const m = /^([A-Z]+)(\d+)$/.exec(r); return m ? { col: colIndex(m[1]), row: Number(m[2]) - 1 } : null; }

/* ---------- zip ---------- */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function pipe(bytes, stream, limit) {
  const out = []; let size = 0;
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (limit && size > limit) { await reader.cancel(); throw new Error("too-big"); }
    out.push(value);
  }
  const all = new Uint8Array(size); let o = 0;
  for (const c of out) { all.set(c, o); o += c.length; }
  return all;
}

export async function unzip(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (bytes.length > MAX_FILE) throw new Error("too-big");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not-xlsx");
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const files = new Map(); let budget = MAX_UNZIPPED;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new Error("not-xlsx");
    const method = u16(bytes, p + 10), csize = u32(bytes, p + 20), nlen = u16(bytes, p + 28);
    const elen = u16(bytes, p + 30), clen = u16(bytes, p + 32), local = u32(bytes, p + 42);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) throw new Error("not-xlsx");
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.subarray(start, start + csize);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) raw = await pipe(data, new DecompressionStream("deflate-raw"), budget);
    else throw new Error("not-xlsx");
    budget -= raw.length;
    if (budget < 0) throw new Error("too-big");
    files.set(name, raw);
  }
  return files;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export async function zip(entries) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  for (const [name, content] of entries) {
    const raw = typeof content === "string" ? enc.encode(content) : content;
    const comp = await pipe(raw, new CompressionStream("deflate-raw"));
    const n = enc.encode(name), crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 8, true);
    h.setUint32(14, crc, true); h.setUint32(18, comp.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    parts.push(new Uint8Array(h.buffer), n, comp); central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + comp.length;
  }
  const csize = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)]);
}

/* ---------- XML (no DTDs or entities beyond the five standard ones) ---------- */
export const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()]);
// Strips characters XML 1.0 forbids, so any pasted text writes a valid file.
export const escapeXml = (s) => String(s).replace(/[^\x09\x0a\x0d\x20-퟿-�\u{10000}-\u{10ffff}]/gu, "")
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescapeXml(m[1]) : null; };
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

/* ---------- read ---------- */
// Returns [{ name, cells: Map("A1" -> value), formulas: Map("A1" -> "SUM(..)") }].
// Values are numbers, strings or booleans; dates stay as Excel serial numbers.
export async function readXlsx(bytes) {
  const files = await unzip(bytes);
  const dec = new TextDecoder();
  const get = (n) => files.has(n) ? dec.decode(files.get(n)) : null;
  const wb = get("xl/workbook.xml");
  if (!wb) throw new Error("not-xlsx");
  const rels = get("xl/_rels/workbook.xml.rels") || "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const shared = [...(get("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], "name"), rid = attr(m[0], "r:id");
    let path = target.get(rid) || "";
    path = path.startsWith("/") ? path.slice(1) : "xl/" + path.replace(/^\.\//, "");
    const xml = get(path);
    if (!xml) continue;
    const cells = new Map(), formulas = new Map();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = attr(c[0], "r"); if (!r) continue;
      const t = attr(c[0], "t"), body = c[2] || "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body), f = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(body);
      if (f) formulas.set(r, unescapeXml(f[1]));
      let val = null;
      if (t === "s" && v) val = shared[Number(v[1])] ?? null;
      else if (t === "inlineStr") val = texts(body);
      else if (t === "str" && v) val = unescapeXml(v[1]);
      else if (t === "b" && v) val = v[1] === "1";
      else if (t === "e") val = null;
      else if (v) { const n = Number(v[1]); val = Number.isFinite(n) ? n : null; }
      if (val !== null && val !== "") cells.set(r, val);
    }
    sheets.push({ name, cells, formulas });
  }
  return sheets;
}

/* ---------- write ---------- */
// styles: 0 normal, 1 bold, 2 money, 3 date, 4 month header (bold, white on red), 5 wrapped, 6 bold money
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE06666"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;
export const S = { normal: 0, bold: 1, money: 2, date: 3, header: 4, wrap: 5, boldMoney: 6 };

// A cell is a value, or { v, f, s } (value, formula without "=", style).
function cellXml(r, c) {
  const o = c !== null && typeof c === "object" && !(c instanceof Date) ? c : { v: c };
  const s = o.s ? ` s="${o.s}"` : "";
  if (o.f) return `<c r="${r}"${s}><f>${escapeXml(o.f)}</f></c>`;
  let v = o.v;
  if (v instanceof Date) v = toSerial(v);
  if (v === null || v === undefined || v === "") return o.s ? `<c r="${r}"${s}/>` : "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${r}"${s}><v>${v}</v></c>`;
  // Inline strings are never read as formulas, so "=cmd|..." typed in a description stays text.
  return `<c r="${r}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
}

// sheets: [{ name, rows: [[cell, ...], ...], merges: ["A6:C6"], widths: [12, ...] }]
export async function writeXlsx(sheets) {
  const ws = sheets.map((sh) => {
    const rows = sh.rows.map((row, ri) => {
      const cells = (row || []).map((c, ci) => cellXml(ref(ci, ri), c)).join("");
      return cells ? `<row r="${ri + 1}">${cells}</row>` : "";
    }).join("");
    const cols = sh.widths ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData>${merges}</worksheet>`;
  });
  const names = sheets.map((s) => escapeXml(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " ")));
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...ws.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ];
  return zip(files);
}

/* ---------- dates ---------- */
const EPOCH = Date.UTC(1899, 11, 30);
export const toSerial = (d) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000;
export function fromSerial(n) { const d = new Date(EPOCH + Math.round(n) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
