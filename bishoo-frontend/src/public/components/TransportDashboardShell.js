import React from 'react';

/**
 * Transport dashboard (owner 2026-10-26): the same idea as the office dashboard -
 * two jobs and a menu.
 *   KAZI   - work coming in: loads from offices to accept, whole-vehicle requests to price.
 *   SAFARI - my trips: everything on a vehicle moves together (Imepakiwa, Njiani, Imefika).
 */
export const TRANSPORT_COLORS = { kazi: '#0f766e', safari: '#0f1419', ink: '#0f1419', grey: '#536471', line: '#cfd9de' };
const FONT = 'inherit';

const Icon = ({ d, color = TRANSPORT_COLORS.ink, size = 22, width = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function TransportHome({ name, kind, status, kaziCount, safariCount, onKazi, onSafari, onMenu, onInbox, inboxUnread, earnedThisMonth }) {
  const big = (bg, color) => ({
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', minHeight: 190, boxSizing: 'border-box',
    padding: 22, borderRadius: 22, background: bg, color, border: 0, cursor: 'pointer', textAlign: 'left', fontFamily: FONT,
  });
  return (
    <div data-testid="transport-home" style={{ display: 'flex', flexDirection: 'column', gap: 16, color: TRANSPORT_COLORS.ink }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Usafiri wangu'}</div>
          <div style={{ fontSize: 15, color: TRANSPORT_COLORS.grey }}>
            {kind}{status && status !== 'verified' && status !== 'active' ? ' · Inasubiri kuthibitishwa' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" aria-label="Ujumbe" onClick={onInbox} style={{ position: 'relative', width: 44, height: 44, borderRadius: 22, border: `1px solid ${TRANSPORT_COLORS.line}`, background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d="M4 5h16v11H8l-4 4z" />
            {inboxUnread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: '#b91c1c', color: '#ffffff', fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center' }}>{inboxUnread > 99 ? '99+' : inboxUnread}</span>}
          </button>
          <button type="button" aria-label="Fungua menyu" data-testid="transport-menu-button" onClick={onMenu} style={{ width: 44, height: 44, borderRadius: 22, border: `1px solid ${TRANSPORT_COLORS.line}`, background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon d="M4 7h16M4 12h16M4 17h16" />
          </button>
        </div>
      </div>

      <button type="button" data-testid="transport-kazi" onClick={onKazi} style={big(TRANSPORT_COLORS.kazi, '#ffffff')}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>KAZI</span>
            <span style={{ fontSize: 16, color: '#ccfbf1' }}>Mizigo kutoka ofisi, maombi ya gari zima</span>
          </span>
          <Icon d="M12 4v14M6 12l6 6 6-6" color="#ffffff" size={36} width={2.2} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{kaziCount}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>zinasubiri jibu lako</span>
        </span>
      </button>

      <button type="button" data-testid="transport-safari" onClick={onSafari} style={big(TRANSPORT_COLORS.safari, '#ffffff')}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>SAFARI</span>
            <span style={{ fontSize: 16, color: '#cbd5e1' }}>Mzigo uliopakia: njiani, umefika</span>
          </span>
          <Icon d="M3 16V7h11v9M14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" color="#ffffff" size={36} width={2} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{safariCount}</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>safari zinaendelea</span>
        </span>
      </button>

      {earnedThisMonth != null && (
        <div data-testid="transport-month" style={{ fontSize: 15, color: TRANSPORT_COLORS.grey, padding: '0 4px' }}>
          Mwezi huu: <b style={{ color: TRANSPORT_COLORS.ink }}>TZS {Math.round(earnedThisMonth).toLocaleString('en-US')}</b> kutoka safari zilizokamilika
        </div>
      )}
    </div>
  );
}
