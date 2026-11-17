/**
 * FoundingContributor.js — on a profile: "Mchangiaji Mwanzilishi" (Writers programme #417 step B,
 * owner approved 2026-11-18). A label an admin gives to early writers; it is not verification.
 * Nothing when the person does not have it.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

export default function FoundingContributor({ ownerUserId }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ownerUserId) return undefined;
    let alive = true;
    Promise.resolve().then(() => api.get(`/writer-outreach/founding/${ownerUserId}`))
      .then((r) => { if (alive) setOn(Boolean(r?.data?.founding)); }).catch(() => {});
    return () => { alive = false; };
  }, [ownerUserId]);
  if (!on) return null;
  return (
    <div data-testid="founding-contributor" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 999, padding: '4px 12px 4px 6px' }}>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: '#3730a3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </span>
      <b style={{ fontSize: 13, color: '#312e81' }}>Mchangiaji Mwanzilishi</b>
    </div>
  );
}
