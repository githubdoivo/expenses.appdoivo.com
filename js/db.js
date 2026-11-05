// On-device storage (IndexedDB). Nothing here leaves the browser.
// Stores: "entries" (one row per expense) and "kv" (categories, accounts, goals,
// conclusions, settings), so a whole year of typing is a few hundred KB.
const NAME = "expenses", VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "id" }).createIndex("month", "month");
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
  return dbp;
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error("abort")); });
const result = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(["entries", "kv"], "readonly");
  const [entries, keys, values] = await Promise.all([result(tx.objectStore("entries").getAll()), result(tx.objectStore("kv").getAllKeys()), result(tx.objectStore("kv").getAll())]);
  const kv = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  return { entries, kv };
}

export async function putEntries(list) {
  const db = await open(); const tx = db.transaction("entries", "readwrite");
  for (const e of list) tx.objectStore("entries").put(e);
  return done(tx);
}
export async function deleteEntries(ids) {
  const db = await open(); const tx = db.transaction("entries", "readwrite");
  for (const id of ids) tx.objectStore("entries").delete(id);
  return done(tx);
}
export async function setKV(key, value) {
  const db = await open(); const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  return done(tx);
}
// Replaces everything in one transaction (import, restore): all or nothing.
export async function replaceAll({ entries, kv }) {
  const db = await open(); const tx = db.transaction(["entries", "kv"], "readwrite");
  tx.objectStore("entries").clear(); tx.objectStore("kv").clear();
  for (const e of entries) tx.objectStore("entries").put(e);
  for (const [k, v] of Object.entries(kv)) tx.objectStore("kv").put(v, k);
  return done(tx);
}
export async function wipe() {
  const db = await open(); db.close(); dbp = null;
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(NAME); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = res; });
}
// Asks the browser not to clear this data when space runs low (Safari especially).
export async function persist() { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } }
