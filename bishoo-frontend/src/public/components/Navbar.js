import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCart } from '../../context/CartContext';

const Navbar = ({ currentPage, onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [sellMenu, setSellMenu] = useState(false);
  const { cartCount } = useCart();
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'sw', label: 'SW', flag: '🇹🇿' },
    { code: 'fr', label: 'FR', flag: '🇫🇷' },
  ];

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('kentexa_lang', code);
    setLangOpen(false);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onNavigate(`Search-${searchQuery}`);
      setSearchQuery('');
      setMenuOpen(false);
    }
  };

  const getRoleTab = () => {
    if (!isLoggedIn) return { icon: '🛒', label: 'Orders', page: 'MyOrders' };
    if (userRole === 'super_agent') return { icon: '🏢', label: 'Hub', page: 'SuperAgentDashboard' };
    if (userRole === 'seller' || userRole === 'admin' || userRole === 'manager') return { icon: '🏪', label: 'Seller', page: 'SellerDashboard' };
    if (userRole === 'agent') return { icon: '🤝', label: 'Agent', page: 'AgentDashboard' };
    return { icon: '🛒', label: 'Orders', page: 'MyOrders' };
  };

  const bottomTabs = [
    { icon: '🏠', label: 'Home',     page: 'Home' },
    { icon: '📋', label: 'Listings', page: 'Listings' },
    { icon: '➕', label: 'Sell',     page: '__sell_menu__', highlight: true },
    getRoleTab(),
    { icon: '👤', label: 'Profile',  page: isLoggedIn ? 'CustomerProfile' : 'PublicLogin' },
  ];

  const getMenuItems = () => {
    const common = [
      { label: '🏠 Home',        page: 'Home' },
      { label: '🏪 Stores',      page: 'Stores' },
      { label: '📋 Classifieds', page: 'ClassifiedsPublic' },
      { label: '💳 Pay Invoice', page: 'PayInvoice' },
    ];
    if (!isLoggedIn) {
      return [...common,
        { label: '🔐 Login',    page: 'PublicLogin' },
        { label: '✨ Register', page: 'Register' },
      ];
    }
    const loggedIn = [
      { label: '🛒 My Orders', page: 'MyOrders' },
      { label: '👤 Profile',   page: 'CustomerProfile' },
    ];
    if (userRole === 'seller' || userRole === 'admin' || userRole === 'manager')
      loggedIn.push({ label: '🏪 Seller Dashboard', page: 'SellerDashboard' });
    if (userRole === 'agent' || userRole === 'admin' || userRole === 'manager')
      loggedIn.push({ label: '🤝 Agent Dashboard', page: 'AgentDashboard' });
    if (userRole === 'super_agent')
      loggedIn.push({ label: '🏢 Super Agent Hub', page: 'SuperAgentDashboard' });
    if (userRole === 'admin' || userRole === 'manager')
      loggedIn.push({ label: '🛡️ Admin Panel', page: 'Dashboard' });
    if (userRole === 'user' || !userRole) {
      loggedIn.push({ label: '🏪 Become a Seller',      page: 'BecomeSeller' });
      loggedIn.push({ label: '🤝 Become an Agent',      page: 'BecomeAgent' });
      loggedIn.push({ label: '🏢 Become a Super Agent', page: 'BecomeSuperAgentInfo' });
    }
    return [...common, ...loggedIn];
  };

  return (
    <>
      <style>{`
        .kx-nav-root { position: sticky; top: 0; z-index: 200; }

        /* Top bar */
        .kx-topbar {
          background: #0f172a;
          padding: 0 12px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.4);
        }

        /* Search */
        .kx-search {
          flex: 1;
          min-width: 0;
          max-width: 280px;
        }
        .kx-search-inner {
          display: flex; align-items: center;
          background: #1e293b; border-radius: 20px;
          padding: 0 12px; height: 34px; gap: 6px;
        }
        .kx-search-input {
          flex: 1; background: none; border: none;
          color: #e2e8f0; font-size: 13px; outline: none; min-width: 0;
        }

        /* Language dropdown */
        .kx-lang-wrap { position: relative; }
        .kx-lang-btn {
          background: #1e293b; border: none; cursor: pointer;
          padding: 5px 9px; border-radius: 8px;
          color: #e2e8f0; font-size: 11px; font-weight: 700;
          display: flex; align-items: center; gap: 4px;
          white-space: nowrap;
        }
        .kx-lang-dropdown {
          position: absolute; top: calc(100% + 6px); right: 0;
          background: #1e293b; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          overflow: hidden; min-width: 110px; z-index: 300;
          border: 1px solid #334155;
        }
        .kx-lang-opt {
          width: 100%; background: none; border: none;
          padding: 10px 14px; color: #cbd5e1;
          font-size: 13px; font-weight: 600; cursor: pointer;
          text-align: left; display: flex; align-items: center; gap: 8px;
        }
        .kx-lang-opt:hover { background: #334155; }
        .kx-lang-opt.active { color: #60a5fa; background: rgba(29,78,216,0.2); }

        /* Bottom tab bar */
        .kx-bottom {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: #ffffff;
          border-top: 2px solid #e2e8f0;
          display: flex; z-index: 150;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
          padding-bottom: env(safe-area-inset-bottom);
        }
        .kx-bottom-hidden { display: none !important; }
        .kx-tab {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 7px 2px 5px;
          background: none; border: none; cursor: pointer; gap: 3px;
          min-width: 0;
        }
        .kx-tab-icon {
          font-size: 21px;
          line-height: 1;
        }
        .kx-tab-label {
          font-size: 9px; font-weight: 700;
          letter-spacing: 0.3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: center;
          color: #1e293b;
        }
        .kx-tab-label.active {
          color: #1d4ed8;
        }
        .kx-tab-highlight {
          width: 44px; height: 44px;
          background: linear-gradient(135deg,#1d4ed8,#2563eb);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; margin-top: -20px;
          box-shadow: 0 4px 20px rgba(29,78,216,0.5);
          border: 3px solid #ffffff;
        }

        /* spacer at bottom so content not hidden behind tab bar */
        .kx-bottom-spacer { height: 62px; }
      `}</style>

      <div className="kx-nav-root">
        <nav className="kx-topbar">

          {/* Logo */}
          <div onClick={() => onNavigate('Home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, backgroundColor: '#1d4ed8', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(29,78,216,0.5)', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                <path d="M3 3 L9 11 L3 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M9 3 L3 11" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M12 3 L19 11 L12 19" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M19 3 L12 11" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, lineHeight: 1 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'Manrope,sans-serif' }}>Kente</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#3b82f6', letterSpacing: '-0.5px', fontFamily: 'Manrope,sans-serif' }}>Xa</span>
            </div>
          </div>

          {/* Search */}
          <div className="kx-search">
            <div className="kx-search-inner">
              <span style={{ fontSize: 12, color: '#475569' }}>🔍</span>
              <input className="kx-search-input" type="text" placeholder="Search..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearch()} />
            </div>
          </div>

          {/* Right: cart + lang dropdown + menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

            {/* Cart */}
            <button onClick={() => onNavigate('Cart')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#94a3b8', fontSize: 20, lineHeight: 1 }}>
              🛒
              {cartCount > 0 && (
                <span style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#ef4444', color: '#fff', borderRadius: '50%', width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900 }}>
                  {cartCount}
                </span>
              )}
            </button>

            {/* Language dropdown */}
            <div className="kx-lang-wrap">
              <button className="kx-lang-btn" onClick={() => setLangOpen(o => !o)}>
                {currentLang.flag} {currentLang.label} <span style={{ fontSize: 9 }}>▾</span>
              </button>
              {langOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setLangOpen(false)} />
                  <div className="kx-lang-dropdown">
                    {languages.map(lang => (
                      <button key={lang.code} className={`kx-lang-opt${i18n.language === lang.code ? ' active' : ''}`}
                        onClick={() => changeLanguage(lang.code)}>
                        {lang.flag} {lang.label}
                        {i18n.language === lang.code && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Hamburger */}
            <button onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: menuOpen ? '#1d4ed8' : '#1e293b', border: 'none', cursor: 'pointer', padding: '7px 9px', borderRadius: 8, color: '#fff', fontSize: 15, lineHeight: 1 }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </nav>
      </div>

      {/* Slide-down Menu */}
      {menuOpen && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 150 }}
          onClick={() => setMenuOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#0f172a', padding: '16px', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input type="text" placeholder="Search..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearch()}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', backgroundColor: '#1e293b', color: '#e2e8f0', fontSize: 14, outline: 'none' }} />
              <button onClick={handleSearch} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>Go</button>
            </div>
            {getMenuItems().map(link => (
              <button key={link.page} onClick={() => { onNavigate(link.page); setMenuOpen(false); }}
                style={{ backgroundColor: currentPage === link.page ? 'rgba(29,78,216,0.3)' : 'transparent', color: currentPage === link.page ? '#93c5fd' : '#cbd5e1', border: 'none', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left', borderLeft: currentPage === link.page ? '3px solid #1d4ed8' : '3px solid transparent' }}>
                {link.label}
              </button>
            ))}
            {isLoggedIn && (
              <button onClick={() => { onLogout(); setMenuOpen(false); }}
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'left', marginTop: 6 }}>
                🚪 Logout
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <div className="kx-bottom">
        {bottomTabs.map(tab => (
          <button key={tab.label} className="kx-tab" onClick={() => {
              if (tab.page === '__sell_menu__') { setSellMenu(s => !s); return; }
              onNavigate(tab.page);
            }}>
            {tab.highlight ? (
              <>
                <div className="kx-tab-highlight">{tab.icon}</div>
                <span className="kx-tab-label" style={{ color: '#60a5fa' }}>{tab.label}</span>
              </>
            ) : (
              <>
                <div className="kx-tab-icon" style={{ opacity: currentPage === tab.page ? 1 : 0.45 }}>{tab.icon}</div>
                <span className={`kx-tab-label${currentPage === tab.page ? ' active' : ''}`}>{tab.label}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="kx-bottom-spacer" />

      {/* ── SELL QUICK MENU ── */}
      {sellMenu && (
        <>
          <div onClick={() => setSellMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 140, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', borderRadius: 20, padding: '16px 12px', zIndex: 141, width: 280, boxShadow: '0 -4px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 4 }}>
              {t('sell_menu.title')}
            </div>

            <button onClick={() => { setSellMenu(false); if (!isLoggedIn) { localStorage.setItem('kentexa_after_login', 'SellerClassifieds'); onNavigate('PublicLogin'); } else { onNavigate('SellerClassifieds'); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 24 }}>📋</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{t('sell_menu.post_ad')}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{t('sell_menu.post_ad_desc')}</div>
              </div>
            </button>

            {(userRole === 'seller' || userRole === 'admin' || userRole === 'manager') ? (
              <>
                <button onClick={() => { setSellMenu(false); onNavigate('SellerProducts'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #dbeafe', backgroundColor: '#eff6ff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 24 }}>🏪</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>Add Product</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>List a new product in your store</div>
                  </div>
                </button>
                <button onClick={() => { setSellMenu(false); onNavigate('SellerDashboard'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 24 }}>📊</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>Seller Dashboard</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Manage your store and orders</div>
                  </div>
                </button>
              </>
            ) : isLoggedIn ? (
              <button onClick={() => { setSellMenu(false); onNavigate('BecomeSeller'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #dcfce7', backgroundColor: '#f0fdf4', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 24 }}>🚀</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a' }}>Open Your Store</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Start selling products — free to apply</div>
                </div>
              </button>
            ) : null}

            {(!userRole || userRole === 'user') && isLoggedIn && (
              <button onClick={() => { setSellMenu(false); onNavigate('BecomeAgent'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '2px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 24 }}>🤝</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>Become an Agent</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Earn commission near you</div>
                </div>
              </button>
            )}

            <button onClick={() => setSellMenu(false)}
              style={{ padding: 10, borderRadius: 10, border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 700, marginTop: 2 }}>
              {t('sell_menu.cancel')}
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default Navbar;