import React, { useState } from 'react';
import { ADMIN_NAVIGATION } from '../../navigation/navigationRegistry';

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

const Sidebar = ({ activePage, onNavigate, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuPresentation = [
    { icon: '📊', label: 'Dashboard',         page: 'Dashboard' },
    { icon: '👥', label: 'Users',             page: 'Users' },
    { icon: '🏪', label: 'Sellers',           page: 'Sellers' },
    { icon: '🪪', label: 'Identity Verification', page: 'IdentityVerifications' },
    { icon: '🤝', label: 'Agents',            page: 'Agents' },
    { icon: '🏢', label: 'Super Agents',      page: 'SuperAgents' },
    { icon: '📊', label: 'Agent Performance', page: 'AgentPerformance' },
    { icon: '📦', label: 'Products',          page: 'Products' },
    { icon: '🏷️', label: 'Brands',            page: 'AdminBrands' },
    { icon: '✅', label: 'Brand Authorizations', page: 'AdminBrandAuthorizations' },
    { icon: '🛡️', label: 'Warranty Claims',    page: 'AdminWarrantyClaims' },
    { icon: '📋', label: 'Official Catalog', page: 'OfficialProducts' },
    { icon: '🔧', label: 'Services',          page: 'AdminServices' },
    { icon: '📋', label: 'Classifieds',       page: 'Classifieds' },
    { icon: '🛒', label: 'Orders',            page: 'Orders' },
    // Was only reachable via a one-off Dashboard.js shortcut card, unlike
    // every other admin surface — no persistent nav entry at all.
    { icon: '🚌', label: 'Transport Providers', page: 'TransportAdmin' },
    { icon: '⚠️', label: 'Disputes',          page: 'Disputes' },
    { icon: '💰', label: 'Payouts',           page: 'Payouts' },
    { icon: '💳', label: 'Payments',          page: 'Payments' },
    { icon: '🧾', label: 'Invoices',          page: 'Invoices' },
    { icon: '📈', label: 'Fedha (Finance)',   page: 'FinancialDashboard' },
    { icon: '📈', label: 'Reports',           page: 'Reports' },
    { icon: '🗺️', label: 'Njia za Intercity',  page: 'RouteManagement' },
    { icon: '🚴', label: 'Ada za Kukusanya',   page: 'CollectionFees' },
    { icon: '🗺️', label: 'Zones (Dar)',       page: 'ZoneManagement' },
    { icon: '👤', label: 'Profile',           page: 'Profile' },
  ];
  const menuItems = ADMIN_NAVIGATION.map((entry) => {
    const presentation = menuPresentation.find((item) => item.page === entry.destination);
    return { ...entry, page: entry.destination, icon: presentation?.icon || '•' };
  });

  const navigate = (page) => {
    setMobileOpen(false);
    onNavigate(page);
  };

  return (
    <>
      <style>{RESPONSIVE_CSS}</style>

      {/* Mobile-only top bar — the sidebar itself is off-canvas below
          900px, so this is the only way to reach it (and see which page
          is active) on a phone. */}
      <div className="admin-topbar">
        <button onClick={() => setMobileOpen(true)}
          style={{ background: 'none', border: 'none', color: '#fff',
            fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}>
          ☰
        </button>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>
          <span style={{ color: '#3b82f6' }}>Xa</span> Admin
        </span>
      </div>

      {/* Tapping outside the open drawer closes it — same convention as
          every other overlay/drawer already in this admin panel. */}
      <div className={`admin-backdrop${mobileOpen ? ' open' : ''}`}
        onClick={() => setMobileOpen(false)} />

      <aside className={`admin-sidebar${mobileOpen ? ' open' : ''}`} style={{
        width: 250, height: '100vh', backgroundColor: '#0f172a',
        position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column',
        boxShadow: '4px 0 20px rgba(0,0,0,0.2)', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div onClick={() => navigate('Home')} style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
          </div>
          <div style={{ fontSize: 10, color: '#475569', letterSpacing: '1.5px', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>Admin Panel</div>
        </div>

        {/* Menu */}
        <nav style={{ flex: '1 0 auto', padding: '12px 10px' }}>
          {menuItems.map(item => (
            <button key={item.page} onClick={() => navigate(item.page)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                marginBottom: 2, textAlign: 'left', fontSize: 13, fontWeight: 600,
                backgroundColor: activePage === item.page ? 'rgba(29,78,216,0.4)' : 'transparent',
                color: activePage === item.page ? '#93c5fd' : '#94a3b8',
                borderLeft: activePage === item.page ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (activePage !== item.page) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (activePage !== item.page) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={() => navigate('Home')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            🌐 View Store
          </button>
          <button onClick={onLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700 }}>
            🚪 Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
