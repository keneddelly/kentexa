/**
 * TopicPicker.js — "Unapenda kuzungumzia nini?" (Social Home, owner approved 2026-11-02).
 * Shown once to a logged-in person who follows no topic yet; asks for at least 3. Home then
 * follows those topics. "Baadaye" closes it for now; it is not asked again on this device.
 */
import React, { useState } from 'react';
import api from '../../api/api';
import { MIN_TOPICS } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#2563EB';

export default function TopicPicker({ topics = [], initial = [], onDone, onLater }) {
  const [chosen, setChosen] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggle = (key) => setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async () => {
    if (chosen.length < MIN_TOPICS) { setError(`Chagua angalau mada ${MIN_TOPICS}.`); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/feed/topics/follow', { keys: chosen });
      onDone?.(Array.isArray(r.data) ? r.data : null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kuhifadhi. Jaribu tena.');
    } finally { setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Chagua mada" data-testid="topic-picker"
      style={{ position: 'fixed', inset: 0, zIndex: 4600, background: 'rgba(15,20,25,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', padding: '18px 16px max(16px, env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>Unapenda kuzungumzia nini?</div>
        <div style={{ fontSize: 14, color: MUTED }}>Chagua angalau mada {MIN_TOPICS}. Mwanzo itakuonyesha mazungumzo yake.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {topics.map((t) => {
            const on = chosen.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} data-testid={`topic-${t.key}`} onClick={() => toggle(t.key)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${on ? BLUE : '#e6ebef'}`, background: on ? '#eef3fe' : '#fff', color: on ? BLUE : INK,
                  display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</span>
                {t.note && <span style={{ fontSize: 12, color: MUTED }}>{t.note}</span>}
              </button>
            );
          })}
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}
        <button type="button" data-testid="topics-save" onClick={save} disabled={saving}
          style={{ height: 46, borderRadius: 23, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
          Endelea ({chosen.length})
        </button>
        <button type="button" onClick={onLater}
          style={{ height: 36, border: 'none', background: 'none', color: MUTED, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Baadaye
        </button>
      </div>
    </div>
  );
}
