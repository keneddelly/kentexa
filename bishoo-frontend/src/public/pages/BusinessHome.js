/**
 * BusinessHome.js — Business-First Frontend Stage 1.
 *
 * "Bishoo Intelligence Systems / [Commerce] [POS] [Transport] ..." —
 * capability tiles for one Business, driven entirely by
 * GET /business/:id/workspaces (workspaces + server-issued capabilities +
 * the caller's own myAccountRole per workspace). Never infers capability
 * availability from the User's own role list -- only from what this
 * specific Business's workspace(s) actually report.
 *
 * Tapping an actionable tile calls the SAME atomic switchRole flow
 * (onSwitchAccountRole, passed down from App.js's handleSwitchProfile) --
 * never a separate switchBusiness(businessId) authority mechanism. A tile
 * with no server-issued switchable AccountRole is rendered inert with an
 * explicit state label (Requires activation / Coming soon) and never
 * calls switchRole at all.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import { getMyBusinesses, getBusinessWorkspaces } from '../../api/business';
import { tilesForWorkspace, TILE_STATE } from '../../context/capabilityTiles';

const B = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const STATE_LABEL_KEY = {
  [TILE_STATE.PENDING]: 'business_home.state_pending',
  [TILE_STATE.REQUIRES_ACTIVATION]: 'business_home.state_requires_activation',
  [TILE_STATE.COMING_SOON]: 'business_home.state_coming_soon',
};

const Tile = ({ tile, onTap, t }) => {
  const actionable = tile.state === TILE_STATE.AVAILABLE || tile.state === TILE_STATE.ACTIVE;
  const isActive = tile.state === TILE_STATE.ACTIVE;
  return (
    <button onClick={() => actionable && onTap(tile)} disabled={!actionable}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        width: 96, padding: '16px 8px', borderRadius: 16,
        border: isActive ? `2px solid ${B}` : '2px solid transparent',
        backgroundColor: isActive ? '#EFF6FF' : WH,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        cursor: actionable ? 'pointer' : 'default', opacity: actionable ? 1 : 0.6 }}>
      <div style={{ fontSize: 26 }}>{tile.icon}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: DK, textAlign: 'center' }}>{t(tile.labelKey)}</div>
      {isActive && <div style={{ fontSize: 9, fontWeight: 800, color: B }}>{t('profile_switcher.active_label')}</div>}
      {!actionable && (
        <div style={{ fontSize: 9, color: GR, textAlign: 'center' }}>{t(STATE_LABEL_KEY[tile.state] || 'business_home.state_pending')}</div>
      )}
    </button>
  );
};

const BusinessHome = ({ businessId, onNavigate, isLoggedIn, activeContext, roleOptions, onSwitchAccountRole }) => {
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [workspaces, setWorkspaces] = useState(null); // null = loading
  const [error, setError] = useState('');

  const load = async (id) => {
    setError('');
    setWorkspaces(null);
    try {
      let resolvedId = id;
      if (!resolvedId) {
        // Reached without an explicit id (e.g. bare 'BusinessHome' nav) --
        // fall back to the user's own Businesses rather than guessing.
        const mine = await getMyBusinesses();
        if (mine.length === 1) {
          resolvedId = mine[0].id;
          setBusiness(mine[0]);
        } else {
          onNavigate('MyBusinesses');
          return;
        }
      } else {
        const mine = await getMyBusinesses();
        const match = mine.find((b) => Number(b.id) === Number(resolvedId));
        setBusiness(match || { id: resolvedId });
      }
      const ws = await getBusinessWorkspaces(resolvedId);
      setWorkspaces(ws);
    } catch {
      setError(t('business_home.load_failed'));
    }
  };

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    load(businessId);
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTap = (tile) => {
    if (tile.state === TILE_STATE.ACTIVE) {
      onNavigate(tile.destination);
      return;
    }
    if (tile.accountRoleId) {
      onSwitchAccountRole(tile.accountRoleId, tile.destination);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('MyBusinesses')} title={business?.tradingName || business?.legalName || t('business_home.title')} top={0} />

      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
        {workspaces === null && !error && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: GR }}>⏳ {t('common.loading')}</div>
        )}

        {error && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: GR }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => load(businessId)}
                style={{ background: B, color: WH, border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {t('common.try_again')}
              </button>
            </div>
          </div>
        )}

        {workspaces && workspaces.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: GR, fontSize: 13 }}>
            {t('business_home.no_workspaces')}
          </div>
        )}

        {workspaces && workspaces.map((ws) => {
          const tiles = tilesForWorkspace(ws, activeContext?.accountRoleId, roleOptions || []);
          return (
            <div key={ws.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: GR, marginBottom: 10 }}>{ws.name}</div>
              {tiles.length === 0 ? (
                <div style={{ fontSize: 12, color: GR }}>{t('business_home.no_capabilities')}</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {tiles.map((tile) => <Tile key={tile.key} tile={tile} onTap={handleTap} t={t} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BusinessHome;
