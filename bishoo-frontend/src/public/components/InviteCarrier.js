import React, { useState } from 'react';

/**
 * A seller invites a transporter or an office they already work with to join KenteXa
 * (owner 2026-10-25: "seller can invite transporter / office to work with"). The
 * message opens in the seller's own WhatsApp; the link takes the invitee straight to
 * the transporter or office application (?join=transport | ?join=office). Once they
 * are on KenteXa, their prices appear in the seller's delivery choices.
 */
export const JOIN_PAGE = { transport: 'BecomeTransportProvider', office: 'BecomeSuperAgentInfo' };

const tzPhone = (v) => {
  const d = String(v || '').replace(/[^0-9]/g, '');
  if (/^255\d{9}$/.test(d)) return d;
  if (/^0\d{9}$/.test(d)) return `255${d.slice(1)}`;
  if (/^\d{9}$/.test(d)) return `255${d}`;
  return '';
};

export function inviteMessage({ role, shopName, destCity, origin }) {
  const as = role === 'office' ? 'ofisi ya mizigo' : 'msafirishaji';
  const route = destCity ? ` kwenda ${destCity}` : '';
  return `Habari, ni ${shopName || 'muuzaji'} kwenye KenteXa. Nina mizigo${route}. `
    + `Jiunge KenteXa kama ${as} tufanye kazi pamoja: ${origin}/?join=${role === 'office' ? 'office' : 'transport'}`;
}

export function inviteUrl({ phone, text }) {
  const p = tzPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

const btn = (on) => ({ flex: 1, minHeight: 44, borderRadius: 10, border: `2px solid ${on ? '#1d4ed8' : '#e2e8f0'}`,
  background: on ? '#eff6ff' : '#ffffff', color: '#0f172a', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' });

export default function InviteCarrier({ shopName, destCity }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('transport');
  const [phone, setPhone] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://kentexa.com';
  if (!open) {
    return (
      <button type="button" data-testid="invite-carrier" onClick={() => setOpen(true)}
        style={{ background: 'none', border: 0, padding: 0, minHeight: 44, color: '#1d4ed8', fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        + Alika msafirishaji au ofisi unayefanya naye kazi
      </button>
    );
  }
  const text = inviteMessage({ role, shopName, destCity, origin });
  return (
    <div data-testid="invite-carrier-form" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      <div role="radiogroup" aria-label="Unamwalika nani" style={{ display: 'flex', gap: 8 }}>
        <button type="button" role="radio" aria-checked={role === 'transport'} onClick={() => setRole('transport')} style={btn(role === 'transport')}>Msafirishaji</button>
        <button type="button" role="radio" aria-checked={role === 'office'} onClick={() => setRole('office')} style={btn(role === 'office')}>Ofisi ya mizigo</button>
      </div>
      <label htmlFor="invite-phone" style={{ fontSize: 14, fontWeight: 600 }}>Simu yake (hiari)</label>
      <input id="invite-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678"
        style={{ height: 48, border: '1px solid #cbd5e1', borderRadius: 12, padding: '0 14px', fontSize: 16, fontFamily: 'inherit' }} />
      <a data-testid="invite-carrier-send" href={inviteUrl({ phone, text })} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 12, background: '#15803d', color: '#ffffff', fontWeight: 800, textDecoration: 'none' }}>
        Tuma mwaliko kwa WhatsApp
      </a>
    </div>
  );
}
