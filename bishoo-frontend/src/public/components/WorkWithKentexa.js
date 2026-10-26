import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { WORK_ROLES, workRoleStatus, openWorkRole, serviceRecordFromAds, advertiserRecord } from '../../utils/workRoles';

// "Fanya kazi na KenteXa" on the profile's main list (audit B step 2): every
// work role with its status; tapping one opens its form or status page
// directly (no role-picker page in between).
const STATUS_STYLE = {
  none:       { color: '#64748b', bg: '#f1f5f9' },
  waiting:    { color: '#a16207', bg: '#fef9c3' },
  waiting_id: { color: '#a16207', bg: '#fef9c3' },
  active:     { color: '#15803d', bg: '#dcfce7' },
  suspended:  { color: '#b91c1c', bg: '#fee2e2' },
  rejected:   { color: '#b91c1c', bg: '#fee2e2' },
};

const myRecord = (url) => api.get(url).then((r) => r.data || null).catch(() => null);

export default function WorkWithKentexa({ onNavigate, onSwitchAccountRole, availableRoles = [], identityStatus }) {
  const { t } = useTranslation();
  const [records, setRecords] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([myRecord('/agents/my-profile'), myRecord('/super-agents/my-profile'), myRecord('/seller/my-profile'), myRecord('/services/my/ads'), myRecord('/transport/my-profile'), myRecord('/advertisers/application/me')])
      .then(([agent, office, seller, ads, transport, adv]) => { if (alive) setRecords({ agent, office, seller, service: serviceRecordFromAds(ads), transport, advertiser: advertiserRecord(adv) }); });
    return () => { alive = false; };
  }, []);

  return (
    <div data-testid="work-with-kentexa" style={{ backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{t('work_roles.title')}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{t('work_roles.desc')}</div>
      </div>
      {WORK_ROLES.map((role, i) => {
        const roleRow = role.roleType ? availableRoles.find((r) => r.roleType === role.roleType) || null : null;
        const record = role.recordKey && records ? records[role.recordKey] : null;
        const status = records ? workRoleStatus({ record, roleRow, identity: identityStatus, recordWins: !!role.recordWins, noIdentityWait: !!role.noIdentityWait }) : null;
        const s = STATUS_STYLE[status] || STATUS_STYLE.none;
        return (
          <button key={role.key} data-testid={`work-role-${role.key}`} disabled={!status}
            onClick={() => openWorkRole({ role, status, roleRow, onNavigate, onSwitchAccountRole })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none',
              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t(`work_roles.${role.key}`)}</div>
              {status && (
                <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, color: s.color, backgroundColor: s.bg,
                  borderRadius: 999, padding: '2px 8px', lineHeight: 1.4 }}>
                  {t(`work_roles.status_${status}`)}
                </span>
              )}
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0 }}>
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
