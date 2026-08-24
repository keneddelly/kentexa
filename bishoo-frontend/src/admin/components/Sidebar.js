import React from 'react';

const Sidebar = ({ activePage, onNavigate, onLogout }) => {
  const menuItems = [
    { icon: '📊', label: 'Dashboard',         page: 'Dashboard' },
    { icon: '👥', label: 'Users',             page: 'Users' },
    { icon: '🏪', label: 'Sellers',           page: 'Sellers' },
    { icon: '🪪', label: 'Identity Verification', page: 'IdentityVerifications' },
    { icon: '🤝', label: 'Agents',            page: 'Agents' },
    { icon: '🏢', label: 'Super Agents',      page: 'SuperAgents' },
    { icon: '📊', label: 'Agent Performance', page: 'AgentPerformance' },
    { icon: '📦', label: 'Products',          page: 'Products' },
    { icon: '📋', label: 'Classifieds',       page: 'Classifieds' },
    { icon: '🛒', label: 'Orders',            page: 'Orders' },
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

  return (
    <aside style={{
      width: 250, height: '100vh', backgroundColor: '#0f172a',
      position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column',
      boxShadow: '4px 0 20px rgba(0,0,0,0.2)', zIndex: 100, overflowY: 'auto',
    }}>
      {/* Logo */}
      <div onClick={() => onNavigate('Home')} style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
        </div>
        <div style={{ fontSize: 10, color: '#475569', letterSpacing: '1.5px', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>Admin Panel</div>
      </div>

      {/* Menu */}
      <nav style={{ flex: '1 0 auto', padding: '12px 10px' }}>
        {menuItems.map(item => (
          <button key={item.page} onClick={() => onNavigate(item.page)}
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
        <button onClick={() => onNavigate('Home')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: '#64748b', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          🌐 View Store
        </button>
        <button onClick={onLogout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, fontWeight: 700 }}>
          🚪 Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;