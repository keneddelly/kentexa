/**
 * whatsapp-link.util.js — KenteXa WhatsApp messaging
 *
 * TWO messages per shipment:
 *
 * MSG 1 — buildCreationMessage()
 *   Sent right after shipment created (no bus details yet)
 *   Purpose: buyer knows parcel is coming + gets tracking link
 *
 * MSG 2 — buildTransportMessage()
 *   Sent after seller/agent uploads bus/courier details
 *   Purpose: buyer knows HOW to collect — ticket number, terminal etc
 *
 * Tone: conversational Swahili, warm, direct. No corporate language.
 */

const KENTEXA_SUPPORT = '255788075633';
const BASE_URL        = 'https://kentexa.com';

const normalize = (raw) => {
  if (!raw) return null;
  let n = String(raw).replace(/[^\d]/g, '');
  if (n.startsWith('0'))                    n = '255' + n.slice(1);
  if (n.startsWith('255') && n.length === 12) return n;
  if (n.length === 9)                       return '255' + n;
  return n.length >= 11 ? n : null;
};

const wa = (phone, msg) => {
  const n = normalize(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
};

const trackUrl = (tn) => `${BASE_URL}/?track=${encodeURIComponent(tn)}`;

const formatDate = (d) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('sw-TZ', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch { return String(d); }
};

// ─── MSG 1: Shipment Created ──────────────────────────────────────────────────
// No bus details yet. Just inform buyer parcel is coming.
//
// order = {
//   trackingNumber, productName, buyerName, sellerStoreName, senderPhone,
//   originCity, destinationCity, transitCity,
//   expectedArrival, estimatedDays
// }

export const buildCreationMessage = (buyerPhone, order) => {
  const url     = trackUrl(order.trackingNumber);
  const store   = order.sellerStoreName || order.senderName || 'Muuzaji wako';
  const product = order.productName || order.description || 'bidhaa yako';
  const arrival = formatDate(order.expectedArrival);
  const buyer   = order.buyerName || order.recipientName || '';

  const lines = [
    `Habari ${buyer}! 👋`,
    ``,
    `*${store}* amekutumia: *"${product}"*`,
    ``,
    `📦 Namba yako ya kufuatilia:`,
    `*${order.trackingNumber}*`,
  ];

  if (order.originCity && order.destinationCity) {
    lines.push(`📍 ${order.originCity} → ${order.destinationCity}`);
  }
  if (order.transitCity) {
    lines.push(`🔄 Inasimama ${order.transitCity} njiani`);
  }
  if (arrival) {
    lines.push(`📅 Inatarajiwa: *${arrival}*`);
  } else if (order.estimatedDays) {
    lines.push(`📅 Muda: siku ~${order.estimatedDays}`);
  }

  lines.push(``);
  lines.push(`Fuatilia hapa — inafanya kazi bila app:`);
  lines.push(url);

  if (order.senderPhone) {
    lines.push(``);
    lines.push(`📞 Muuzaji: ${order.senderPhone}`);
  }

  lines.push(``);
  lines.push(`Msaada: wa.me/${KENTEXA_SUPPORT}`);

  return wa(buyerPhone, lines.join('\n'));
};

// ─── MSG 2: Transport Confirmed ────────────────────────────────────────────────
// Sent after bus ticket / courier ref is uploaded.
// This is the critical message — buyer needs ticket to collect parcel.
//
// order = {
//   trackingNumber, productName, buyerName, recipientName,
//   busCompany, busTicketNumber, busDeparture,
//   courierName, courierTrackingRef,
//   bodaName, bodaPhone,
//   agentHubName, agentHubPhone, agentName, agentPhone,
//   destinationCity
// }

export const buildTransportMessage = (buyerPhone, order) => {
  const url    = trackUrl(order.trackingNumber);
  const buyer  = order.buyerName || order.recipientName || '';

  const lines = [
    `🚌 Habari ${buyer}!`,
    ``,
    `Bidhaa yako ipo njiani sasa.`,
    ``,
  ];

  // Bus
  if (order.busCompany || order.busTicketNumber) {
    const company = order.busCompany || 'Basi';
    lines.push(`Kampuni: *${company}*`);
    if (order.busTicketNumber) {
      lines.push(`🎫 Tiketi: *${order.busTicketNumber}*`);
      lines.push(`   👆 Sema namba hii terminali ya ${company} kupata kifurushi chako`);
    }
    if (order.busDeparture) {
      lines.push(`⏰ Kuondoka: ${order.busDeparture}`);
    }

  // Courier
  } else if (order.courierName || order.courierTrackingRef) {
    const company = order.courierName || 'Courier';
    lines.push(`Courier: *${company}*`);
    if (order.courierTrackingRef) {
      lines.push(`🔖 Namba ya Kufuatilia: *${order.courierTrackingRef}*`);
    }

  // Boda
  } else if (order.bodaName || order.bodaPhone) {
    lines.push(`🏍️ Boda: *${order.bodaName || 'Dereva'}*`);
    if (order.bodaPhone) lines.push(`📞 ${order.bodaPhone}`);

  // Super Agent hub
  } else if (order.agentHubName) {
    lines.push(`🏢 Hub: *${order.agentHubName}*`);
    if (order.agentHubPhone) lines.push(`📞 ${order.agentHubPhone}`);
    if (order.agentName)     lines.push(`👤 Wakala: ${order.agentName}${order.agentPhone ? ` — ${order.agentPhone}` : ''}`);
  }

  lines.push(``);
  lines.push(`📍 Fuatilia:`);
  lines.push(url);

  return wa(buyerPhone, lines.join('\n'));
};

// ─── Backward-compatible alias (was: buildSellerToBuyerMessage) ───────────────
// Picks the right message automatically based on whether transport details exist

export const buildSellerToBuyerMessage = (buyerPhone, order) => {
  const hasTransport = order.busTicketNumber || order.courierTrackingRef ||
                       order.courierName     || order.busCompany;
  if (hasTransport) return buildTransportMessage(buyerPhone, order);
  return buildCreationMessage(buyerPhone, order);
};

// ─── Buyer → Seller inquiry ────────────────────────────────────────────────────

export const buildBuyerInquiryMessage = (sellerPhone, order) => {
  const lines = [
    `Habari! Nina swali kuhusu kifurushi changu.`,
    ``,
    order.productName ? `📦 Bidhaa: ${order.productName}` : null,
    `🔖 Namba: ${order.trackingNumber}`,
    trackUrl(order.trackingNumber),
  ].filter(Boolean);
  return wa(sellerPhone || KENTEXA_SUPPORT, lines.join('\n'));
};

export const buildTrackingWhatsAppLink = (phone, tn, name) =>
  buildBuyerInquiryMessage(phone, { trackingNumber: tn, productName: name });

export default buildBuyerInquiryMessage;