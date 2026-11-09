import React, { useState } from 'react';
import { ADMIN_SECTIONS, adminMenuFor } from '../../navigation/navigationRegistry';
import { useOptionalRoleContext } from '../../context/RoleContext';

// Mobile responsiveness — the sidebar was a fixed 250px column + every
// admin page's <main> hardcoded marginLeft:250 inline. On a phone-width
// screen that left almost no room for content (worse once a page also had
// its own side-by-side panels, e.g. TransportAdmin's list+detail split),
// and there was no way to collapse it. Since every admin page's <main>
// margin is a per-file inline style (not a shared class), the only fix
// that doesn't require touching every page is a global override here —
// Sidebar renders on every one of them, so this <style> tag reaches all
// of them from one place. `!important` is required specifically because
// it's overriding an inline style, not a lower-specificity class.
const RESPONSIVE_CSS = `
  .admin-topbar { display: none; }
  .admin-backdrop { display: none; }
  @media (max-width: 900px) {
    .admin-sidebar {
      transform: translateX(-100%);
      transition: transform 0.25s ease;
    }
    .admin-sidebar.open { transform: translateX(0); }
    .admin-topbar {
      display: flex; align-items: center; gap: 12px;
      position: fixed; top: 0; left: 0; right: 0; height: 56px;
      background: #0f172a; z-index: 90; padding: 0 16px; box-sizing: border-box;
    }
    .admin-backdrop.open {
      display: block; position: fixed; inset: 0;
      background: rgba(0,0,0,0.45); z-index: 99;
    }
    main, .admin-content { margin-left: 0 !important; margin-top: 56px !important; }
  }
`;

// One clean line icon per menu item (owner 2026-11-09: no emoji, a professional look).
export const ADMIN_ICON = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  analytics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  reports: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h7M9 17h7',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-5-5.9',
  identity: 'M3 5h18v14H3zM8 12a2 2 0 100-4 2 2 0 000 4zM5 16a3 3 0 016 0M14 9h4M14 13h4',
  business: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  seller: 'M3 9l2-6h14l2 6M4 12v9h16v-9M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0',
  announce: 'M3 11v2a2 2 0 002 2h2l6 4V5L7 9H5a2 2 0 00-2 2zM17 8a5 5 0 010 8',
  products: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  catalog: 'M4 4h16v16H4zM4 9h16M9 9v11',
  brand: 'M20 12l-8 8-9-9V3h8zM7 7h.01',
  verified: 'M12 2l3 2 4 .5.5 4 2 3-2 3-.5 4-4 .5-3 2-3-2-4-.5-.5-4-2-3 2-3 .5-4 4-.5zM8 12l3 3 5-6',
  warranty: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  services: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  listings: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  orders: 'M6 2l1.5 4h9L18 2M3 6h18l-2 14H5zM9 10v4M15 10v4',
  shipments: 'M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  agent: 'M12 11a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0',
  hub: 'M3 21V8l9-5 9 5v13M9 21v-7h6v7',
  transport: 'M3 6h13v10H3zM16 9h4l1 3v4h-5M6 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z',
  routes: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h6M18 9v6a4 4 0 01-4 4H8',
  zones: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  collection: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  finance: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  payments: 'M2 6h20v12H2zM2 10h20M6 15h4',
  payouts: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  invoices: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  chat: 'M4 5h16v11H8l-4 4z',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  profile: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  store: 'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18M12 21a9 9 0 100-18 9 9 0 000 18z',
  logout: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  menu: 'M3 6h18M3 12h18M3 18h18',
};
const Icon = ({ id, color }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d={ADMIN_ICON[id] || ADMIN_ICON.listings} />
  </svg>
);

const STAFF_TITLE = { manager: 'Meneja', customer_care: 'Huduma kwa wateja', finance: 'Fedha', moderator: 'Ukaguzi' };

const Sidebar = ({ activePage, onNavigate, onLogout, items: givenItems }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Each KenteXa staff role sees only its own area (owner 2026-11-09); admin sees everything.
  const roleType = useOptionalRoleContext()?.activeContext?.roleType || 'admin';
  const items = givenItems || adminMenuFor(roleType);

  const navigate = (page) => {
    setMobileOpen(false);
    onNavigate(page);
  };
  const sections = ADMIN_SECTIONS
    .map(([key, title]) => ({ key, title, items: items.filter((e) => e.section === key) }))
    .filter((sec) => sec.items.length > 0);

  return (
    <>
      <style>{RESPONSIVE_CSS}</style>

      {/* Mobile-only top bar: the sidebar itself is off-canvas below 900px. */}
      <div className="admin-topbar">
        <button type="button" aria-label="Fungua menyu" onClick={() => setMobileOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Icon id="menu" color="#fff" />
        </button>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>
          Kente<span style={{ color: '#1d4ed8' }}>Xa</span> Admin
        </span>
      </div>

      <div className={`admin-backdrop${mobileOpen ? ' open' : ''}`}
        onClick={() => setMobileOpen(false)} />

      <aside className={`admin-sidebar${mobileOpen ? ' open' : ''}`} style={{
        width: 250, height: '100vh', backgroundColor: '#0f172a',
        position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.2)', zIndex: 100, overflowY: 'auto',
      }}>
        <div onClick={() => navigate('Home')} style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', letterSpacing: '1.5px', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>Usimamizi{STAFF_TITLE[roleType] ? ` · ${STAFF_TITLE[roleType]}` : ''}</div>
        </div>

        <nav aria-label="Menyu ya usimamizi" style={{ flex: '1 0 auto', padding: '8px 10px 12px' }}>
          {sections.map((sec) => (
            <div key={sec.key} data-testid={`admin-section-${sec.key}`} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '1.2px', textTransform: 'uppercase', padding: '6px 14px 4px' }}>{sec.title}</div>
              {sec.items.map((item) => {
                const on = activePage === item.destination;
                return (
                  <button key={item.destination} type="button" onClick={() => navigate(item.destination)} aria-current={on ? 'page' : undefined}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      marginBottom: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      backgroundColor: on ? 'rgba(29,78,216,0.4)' : 'transparent',
                      color: on ? '#bfdbfe' : '#94a3b8',
                      borderLeft: on ? '3px solid #1d4ed8' : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <Icon id={item.iconId} color={on ? '#93c5fd' : '#64748b'} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button type="button" onClick={() => navigate('Home')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 4, fontFamily: 'inherit' }}>
            <Icon id="store" color="#64748b" /> Fungua KenteXa
          </button>
          <button type="button" onClick={onLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
            <Icon id="logout" color="#dc2626" /> Toka
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
