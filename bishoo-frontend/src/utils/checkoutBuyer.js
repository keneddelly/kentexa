/**
 * checkoutBuyer.js — a person who signed in from the checkout (owner 2026-11-10, "buy without
 * signing up first") goes straight to the order: the photo and the welcome questions wait until
 * they open Home. Kept for this browser tab only.
 */
const KEY = 'kentexa_checkout_buyer';

export function markCheckoutBuyer() {
  try { window.sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked: the usual steps show */ }
}

export function isCheckoutBuyer() {
  try { return window.sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** The photo and welcome steps are held back on every page except Home. */
export const holdWelcomeSteps = (page) => isCheckoutBuyer() && page !== 'Home';
