/**
 * TeamWork.js — on Kazi: invitations waiting for me and the businesses I work for
 * (owner approved 2026-11-03). "POS ya X" opens that business's till for a cashier.
 * Shows nothing for a person with no invitation and no team.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { savePosTeam } from '../../utils/posTeam';

const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const pill = (dark) => ({ height: 36, padding: '0 14px', borderRadius: 18, border: dark ? 'none' : '1px solid #cfd9de', background: dark ? INK : '#fff',
  color: dark ? '#fff' : INK, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 });

export default function TeamWork({ onNavigate }) {
  const [invites, setInvites] = useState([]);
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    let live = true;
    Promise.resolve(api.get('/team-invitations/mine')).then((r) => { if (live) setInvites(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    Promise.resolve(api.get('/team-invitations/workplaces')).then((r) => { if (live) setPlaces(Array.isArray(r?.data) ? r.data : []); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!invites.length && !places.length) return null;
  const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${LINE}` };
  const badge = (name) => (
    <span style={{ width: 40, height: 40, borderRadius: 10, background: INK, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {String(name || 'K').charAt(0).toUpperCase()}
    </span>
  );

  return (
    <section data-testid="team-work" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {invites.length > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Mialiko</span>}
      {invites.map((i) => (
        <div key={i.token} style={row}>
          {badge(i.businessName)}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 15 }}>{i.businessName}</b>
            <span style={{ fontSize: 13, color: MUTED }}>Amekualika kuwa {i.roleLabel}</span>
          </span>
          <button type="button" data-testid={`team-invite-open-${i.token}`} style={pill(true)} onClick={() => onNavigate(`TeamInvite-${i.token}`)}>Angalia</button>
        </div>
      ))}
      {places.length > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginTop: invites.length ? 8 : 0 }}>Unafanya kazi na</span>}
      {places.map((w) => (
        <div key={w.sellerId} style={row}>
          {badge(w.businessName)}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 15 }}>{w.businessName || 'Biashara'}</b>
            <span style={{ fontSize: 13, color: MUTED }}>{w.roleLabel}</span>
          </span>
          {w.permissions?.canOperatePOS && (
            <button type="button" data-testid={`team-pos-${w.sellerId}`} style={pill(true)}
              onClick={() => { savePosTeam(w); onNavigate('POS', { posTeam: w }); }}>POS ya {w.businessName || 'duka'}</button>
          )}
        </div>
      ))}
    </section>
  );
}
