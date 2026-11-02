/**
 * photoLater.js — the profile photo is optional (owner approved 2026-11-02, "Optional,
 * asked again later"): a person who taps "Ruka kwa sasa" is not stopped again on this
 * phone; Home keeps a small "Weka picha" reminder until they add one.
 */
const key = (userId) => `kentexa_photo_later_${userId}`;

export function photoSkipped(userId) {
  if (!userId) return false;
  try { return window.localStorage.getItem(key(userId)) === '1'; } catch { return false; }
}

export function skipPhoto(userId) {
  if (!userId) return;
  try { window.localStorage.setItem(key(userId), '1'); } catch { /* storage blocked: asked again next time */ }
}
