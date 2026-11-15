// Slow internet (owner approved 2026-11-15): when something has been loading for more than
// 20 seconds, the site says so ("Mtandao ni dhaifu") instead of loading forever.
// Only reads (GET) count: sending photos or forms on a slow line can rightly take longer.
export const SLOW_MS = 20000;

const pending = new Map();
const listeners = new Set();
let seq = 0;
let slow = false;
let timer = null;

const check = () => {
  if (timer) { clearTimeout(timer); timer = null; }
  const now = Date.now();
  let oldest = Infinity;
  pending.forEach((t) => { if (t < oldest) oldest = t; });
  const isSlow = oldest !== Infinity && now - oldest >= SLOW_MS;
  if (isSlow !== slow) {
    slow = isSlow;
    listeners.forEach((fn) => { try { fn(slow); } catch { /* a listener never breaks loading */ } });
  }
  if (oldest !== Infinity && !isSlow) timer = setTimeout(check, SLOW_MS - (now - oldest) + 50);
};

/** A read started. Returns its id, or null when it does not count. */
export const startRequest = (method) => {
  if (String(method || 'get').toLowerCase() !== 'get') return null;
  seq += 1;
  pending.set(seq, Date.now());
  check();
  return seq;
};

/** A read finished (answered or failed). */
export const finishRequest = (id) => {
  if (id == null || !pending.delete(id)) return;
  check();
};

export const isSlow = () => slow;

export const subscribeSlow = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const __resetSlowNetworkForTests = () => {
  pending.clear(); listeners.clear(); slow = false; seq = 0;
  if (timer) { clearTimeout(timer); timer = null; }
};
