import React, { useState } from 'react';

/**
 * The office dashboard's shell (approved mockup "KenteXa Super Agent Dashboard",
 * owner 2026-10-11: "two jobs only, POKEA and TUMA; everything else in the menu").
 * Plain words, KenteXa colours, no emoji: POKEA blue #1d4ed8, TUMA orange #f97316,
 * text #0f172a. The forms behind each button are the dashboard's existing ones.
 */
export const OFFICE_COLORS = { pokea: '#1d4ed8', tuma: '#f97316', ink: '#0f172a', grey: '#475569', line: '#cbd5e1', paper: '#f8fafc' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const Icon = ({ d, color = OFFICE_COLORS.ink, size = 22, width = 2 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

/** Mwanzo: search, then the two jobs with what is waiting in each. */
export function OfficeHome({ officeName, city, pokeaCount, tumaCount, onPokea, onTuma, onMenu, onInbox, inboxUnread, onSearch }) {
  const [q, setQ] = useState('');
  const submit = (e) => { e.preventDefault(); if (q.trim()) onSearch(q.trim()); };
  const big = (bg, color) => ({
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', minHeight: 200, boxSizing: 'border-box',
    padding: 22, borderRadius: 22, background: bg, color, border: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
  });
  return (
    <div data-testid="office-home" style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT, color: OFFICE_COLORS.ink }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{officeName || 'Ofisi yangu'}</div>
          {city && <div style={{ fontSize: 14, color: OFFICE_COLORS.grey }}>{city}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-label="Ujumbe" onClick={onInbox} style={{ position: 'relative', width: 44, height: 44, borderRadius: 12, border: `1px solid ${OFFICE_COLORS.line}`, background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d="M4 5h16v11H8l-4 4z" />
            {inboxUnread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: '#b91c1c', color: '#ffffff', fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{inboxUnread > 99 ? '99+' : inboxUnread}</span>}
          </button>
          <button type="button" aria-label="Fungua menyu" data-testid="office-menu-button" onClick={onMenu} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${OFFICE_COLORS.line}`, background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d="M4 7h16M4 12h16M4 17h16" />
          </button>
        </div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="office-search" style={{ fontSize: 13, fontWeight: 600, color: OFFICE_COLORS.grey }}>Tafuta mzigo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', border: `1px solid ${OFFICE_COLORS.line}`, borderRadius: 14, padding: '0 6px 0 14px', height: 52 }}>
          <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" color={OFFICE_COLORS.grey} size={20} />
          <input id="office-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Namba ya mzigo"
            style={{ flexGrow: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontFamily: FONT, fontSize: 16, color: OFFICE_COLORS.ink }} />
          <button type="submit" style={{ height: 40, padding: '0 14px', border: 0, borderRadius: 10, background: OFFICE_COLORS.ink, color: '#ffffff', fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}>Tafuta</button>
        </div>
      </form>

      <button type="button" data-tour="sa-tab-pokea" data-testid="office-pokea" onClick={onPokea} style={big(OFFICE_COLORS.pokea, '#ffffff')}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>POKEA</span>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#dbeafe' }}>Mzigo unaingia ofisini</span>
          </span>
          <Icon d="M12 4v14M6 12l6 6 6-6" color="#ffffff" size={36} width={2.2} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{pokeaCount}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>zinasubiri kupokelewa</span>
        </span>
      </button>

      <button type="button" data-tour="sa-tab-tuma" data-testid="office-tuma" onClick={onTuma} style={big(OFFICE_COLORS.tuma, OFFICE_COLORS.ink)}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>TUMA</span>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#431407' }}>Mzigo unatoka ofisini</span>
          </span>
          <Icon d="M12 20V6M6 12l6-6 6 6" size={36} width={2.2} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{tumaCount}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>zinasubiri kutumwa</span>
        </span>
      </button>
    </div>
  );
}

/** The coloured bar on top of POKEA / TUMA and the plain one on menu pages. */
export function OfficeScreenHeader({ title, count, kind, onBack, backLabel = 'Mwanzo' }) {
  const bg = kind === 'pokea' ? OFFICE_COLORS.pokea : kind === 'tuma' ? OFFICE_COLORS.tuma : '#ffffff';
  const fg = kind === 'pokea' ? '#ffffff' : OFFICE_COLORS.ink;
  const soft = kind === 'pokea' ? '#dbeafe' : kind === 'tuma' ? '#431407' : OFFICE_COLORS.grey;
  return (
    <div data-testid="office-screen-header" style={{ background: bg, color: fg, padding: '12px 16px 18px', borderBottom: kind ? 0 : '1px solid #e2e8f0', fontFamily: FONT }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" onClick={onBack} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: 0, border: 0, background: 'none', color: soft, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
          <Icon d="M15 5l-7 7 7 7" color={soft} size={18} width={2.4} />{backLabel}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: kind ? 44 : 30, fontWeight: 800, lineHeight: 1 }}>{title}</div>
          {count != null && <div style={{ fontSize: 16, fontWeight: 600, color: soft }}>{count} zinasubiri</div>}
        </div>
      </div>
    </div>
  );
}

/** A row that opens one kind of work, with how many are waiting. */
export function OfficeRow({ title, hint, count, onClick, testId, tour, alert }) {
  return (
    <button type="button" data-testid={testId} data-tour={tour} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 72, boxSizing: 'border-box',
        padding: '12px 16px', marginBottom: 10, borderRadius: 16, background: '#ffffff', border: alert ? '2px solid #b91c1c' : `1px solid ${OFFICE_COLORS.line}`,
        color: OFFICE_COLORS.ink, cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{title}</span>
        {hint && <span style={{ fontSize: 13, color: OFFICE_COLORS.grey }}>{hint}</span>}
      </span>
      {count != null && (
        <span style={{ minWidth: 34, height: 34, boxSizing: 'border-box', padding: '0 10px', borderRadius: 999, background: alert ? '#b91c1c' : OFFICE_COLORS.ink, color: '#ffffff', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
      )}
    </button>
  );
}

export const officeSection = { fontSize: 13, fontWeight: 700, color: OFFICE_COLORS.grey, letterSpacing: '0.04em', margin: '6px 0 8px', fontFamily: FONT };

/** Menyu: everything that supports the office's business, outside the two jobs. */
export function OfficeMenu({ items }) {
  return (
    <div data-testid="office-menu" style={{ fontFamily: FONT }}>
      <div style={{ fontSize: 14, color: OFFICE_COLORS.grey, marginBottom: 12 }}>Mambo yanayosaidia biashara ya ofisi. Kazi ya kila siku iko kwenye POKEA na TUMA.</div>
      {items.map((it) => <OfficeRow key={it.key} testId={`office-menu-${it.key}`} tour={it.tour} title={it.title} hint={it.hint} onClick={it.onClick} />)}
    </div>
  );
}
