/**
 * PollBlock.js — a poll on a post (Home Feed phase E, owner approved 2026-11-02).
 *
 * Shows what the server answers for this viewer (GET /feed/:id/poll): before voting, the
 * options and the total; after voting, after the close, or to the author, each option's
 * share. A vote is sent once (POST /feed/:id/poll/vote) and the server's answer is shown.
 * Nothing is counted or guessed here.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { pollTimeLeft } from '../utils/feedPresentation';

const INK = '#0f1419';
const MUTED = '#536471';
const BLUE = '#2563EB';

export default function PollBlock({ postId, isLoggedIn, onNavigate }) {
  const [poll, setPoll] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.get(`/feed/${postId}/poll`)
      .then((r) => { if (alive) { setPoll(r.data); setState(r.data ? 'ready' : 'missing'); } })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [postId]);

  const vote = async (optionId) => {
    if (!isLoggedIn) { onNavigate?.('PublicLogin'); return; }
    if (sending) return;
    setSending(true); setError('');
    try {
      const r = await api.post(`/feed/${postId}/poll/vote`, { optionId });
      setPoll(r.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Kura haikupigwa. Jaribu tena.');
    } finally { setSending(false); }
  };

  if (state === 'loading') return <div data-testid="poll-loading" style={{ fontSize: 13, color: MUTED }}>Inapakia kura...</div>;
  if (state === 'missing' || !poll) return null;

  return (
    <div data-testid="poll" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {poll.options.map((o) => (poll.showResults ? (
        <div key={o.id} data-testid={`poll-result-${o.id}`}
          style={{ position: 'relative', overflow: 'hidden', borderRadius: 8, background: '#f7f9fa', padding: '8px 10px',
            display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: INK, fontWeight: poll.myOptionId === o.id ? 800 : 400 }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: '0 auto 0 0', width: `${o.percent}%`, background: '#eff6ff' }} />
          <span style={{ position: 'relative', minWidth: 0, overflowWrap: 'anywhere' }}>{o.label}{poll.myOptionId === o.id ? ' (wewe)' : ''}</span>
          <span style={{ position: 'relative', fontVariantNumeric: 'tabular-nums' }}>{o.percent}%</span>
        </div>
      ) : (
        <button key={o.id} type="button" data-testid={`poll-vote-${o.id}`} disabled={sending || poll.closed} onClick={() => vote(o.id)}
          style={{ minHeight: 36, padding: '6px 12px', borderRadius: 18, border: `1px solid ${BLUE}`, background: '#fff', color: BLUE,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>
          {o.label}
        </button>
      )))}
      <div data-testid="poll-meta" style={{ fontSize: 13, color: MUTED }}>
        Kura {poll.totalVotes} · {pollTimeLeft(poll.closesAt)}
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: '#B91C1C' }}>{error}</div>}
    </div>
  );
}
