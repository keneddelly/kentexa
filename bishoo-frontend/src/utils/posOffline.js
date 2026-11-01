// The POS that keeps selling without internet (owner 2026-10-27: "allow even storing and
// use offline in desktop").
//
// Kept on this computer (IndexedDB "kentexa-pos"; in memory where IndexedDB is missing):
//   catalog - the shop's products and stock as last loaded online;
//   queue   - sales made while offline (or whose sending failed), each with its own id
//             (clientSaleId): the server records a sale once even if it is sent twice;
//   parked  - sales put aside ("Weka kando") while serving the next customer.
// The till's session (which shop, which cashier, which account role) is in localStorage so
// the POS can open offline on the computer it was last used on. Nothing here gives access to
// the server: a queued sale is sent only with the same signed-in account and role.

const DB_NAME = 'kentexa-pos';
const DB_VERSION = 1;
const STORES = ['catalog', 'queue', 'parked'];
const SESSION_KEY = 'kentexa_pos_session';

const memory = { catalog: new Map(), queue: new Map(), parked: new Map() };
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  if (!db) return fn(null, memory[store]);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let out;
      Promise.resolve(fn(os, null)).then((v) => { out = v; }).catch(reject);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}

const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function put(store, key, value) {
  return run(store, 'readwrite', (os, mem) => { if (mem) { mem.set(key, value); return undefined; } os.put(value, key); return undefined; });
}
export async function get(store, key) {
  const db = await openDb();
  if (!db) return memory[store].get(key) ?? null;
  const tx = db.transaction(store, 'readonly');
  return (await req2p(tx.objectStore(store).get(key))) ?? null;
}
export async function all(store) {
  const db = await openDb();
  if (!db) return [...memory[store].values()];
  const tx = db.transaction(store, 'readonly');
  return (await req2p(tx.objectStore(store).getAll())) || [];
}
export async function del(store, key) {
  return run(store, 'readwrite', (os, mem) => { if (mem) { mem.delete(key); return undefined; } os.delete(key); return undefined; });
}

/** A new id for a sale (UUID v4). */
export function newSaleId() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* older browser */ }
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i += 1) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${'89ab'[Math.floor(Math.random() * 4)]}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

// ── The till's session ────────────────────────────────────────────────────
export function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: new Date().toISOString() })); } catch { /* private mode */ }
}
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

// ── Catalog ───────────────────────────────────────────────────────────────
export async function saveCatalog(products) {
  await put('catalog', 'products', { products, savedAt: new Date().toISOString() });
}
export async function loadCatalog() {
  return (await get('catalog', 'products')) || { products: [], savedAt: null };
}
/** Lowers the local stock after a sale made here, so the till shows what is left. */
export async function takeFromCatalog(lines) {
  const cat = await loadCatalog();
  if (!cat.products.length) return;
  const sold = new Map(lines.map((l) => [l.productId, l.quantity]));
  const products = cat.products.map((p) => (sold.has(p.id) ? { ...p, stock: Math.max(0, Number(p.stock || 0) - sold.get(p.id)) } : p));
  await put('catalog', 'products', { products, savedAt: cat.savedAt });
}

// ── Sales waiting to be sent ──────────────────────────────────────────────
export async function enqueueSale(entry) {
  await put('queue', entry.clientSaleId, { status: 'waiting', error: null, ...entry });
}
export async function listQueue() {
  return (await all('queue')).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * Sends every waiting sale, oldest first. A sale the server refuses (4xx other than
 * auth/limits) is kept as "failed" with the reason, for the cashier to see; a network
 * error stops the run (try again later). Only sales of the same account and role are sent.
 */
export async function syncQueue({ post, isSameTill }) {
  const out = { sent: 0, failed: 0, left: 0, stoppedOffline: false, results: [] };
  for (const entry of await listQueue()) {
    if (entry.status === 'failed') { out.failed += 1; continue; }
    if (isSameTill && !isSameTill(entry)) { out.left += 1; continue; }
    try {
      const res = await post(entry.body);
      await del('queue', entry.clientSaleId);
      out.sent += 1;
      out.results.push({ clientSaleId: entry.clientSaleId, sale: res?.data ?? null });
    } catch (err) {
      const status = err?.response?.status;
      if (!status || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) {
        out.stoppedOffline = !status;
        out.left += 1;
        break;
      }
      const m = err?.response?.data?.message;
      await put('queue', entry.clientSaleId, { ...entry, status: 'failed', error: Array.isArray(m) ? m.join(', ') : (m || 'Imekataliwa') });
      out.failed += 1;
    }
  }
  const remaining = await listQueue();
  out.left = remaining.filter((e) => e.status !== 'failed').length;
  return out;
}
export async function dropFailed(clientSaleId) { await del('queue', clientSaleId); }

// ── Sales put aside ("Weka kando") ────────────────────────────────────────
export async function parkSale(entry) { await put('parked', entry.id, entry); }
export async function listParked() {
  return (await all('parked')).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
export async function unpark(id) { await del('parked', id); }

/** Test helper: forget everything (memory store and the IndexedDB connection). */
export function __resetPosOfflineForTests() {
  STORES.forEach((s) => memory[s].clear());
  dbPromise = null;
}
