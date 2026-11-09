import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import TeamWork from '../components/TeamWork';
import { getMyBusinesses } from '../../api/business';
import { personalAttention, roleAttention } from '../../context/workspaceAttention';
import {
  buildWorkspaces, initialWorkspaceKey, startOptionsFor, readRecentTools, rememberTool, usableRecent,
  ROLE_STATE, STATE_TEXT, isFoodBusiness, hotelTools,
} from '../../context/workspaceModel';

// Kazi (My Workspace), phase 1 (owner approved 2026-11-01): every tool a person may use,
// for their own account and for each business they work in, in one place. It reads the
// server's role list (roleOptions) and the person's businesses; it never grants anything.
// A tool of another role is opened through the SAME atomic switch as the profile switcher
// (onSwitchAccountRole), straight to that tool.
const INK = '#0f1419';
const MUTED = '#536471';
const LINE = '#eff3f4';
const BLUE = '#1d4ed8';
const TONE = {
  amber: { fg: '#92400e', bg: '#fef3c7' }, red: { fg: '#b91c1c', bg: '#fef2f2' }, muted: { fg: MUTED, bg: LINE },
};

const Icon = ({ d, color = INK, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const Chevron = () => <Icon d="M9 6l6 6-6 6" color="#8b98a5" size={16} />;

const pill = { height: 40, padding: '0 16px', borderRadius: 20, border: '1px solid #cfd9de', background: '#fff',
  color: INK, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center' };

export default function Workspace({ onNavigate, isLoggedIn, currentUser, activeContext, activeProfileId, roleOptions, onSwitchAccountRole, onRefreshContext, inboxUnread }) {
  const [businesses, setBusinesses] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [recent, setRecent] = useState(readRecentTools);
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    // An approval may have added a role since login: the server's list is reloaded once on entry.
    if (typeof onRefreshContext === 'function') Promise.resolve(onRefreshContext()).catch(() => {});
    getMyBusinesses().then(setBusinesses).catch(() => { setBusinesses([]); setError('Biashara zako hazikupakia. Jaribu tena.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kinachohitaji wewe (phase 2): the active role's items and the account's own, from the
  // endpoints the tools already use. Read again when the active role changes.
  const [roleItems, setRoleItems] = useState([]);
  const [personalItems, setPersonalItems] = useState([]);
  const activeRoleType = activeContext?.roleType || null;
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let live = true;
    roleAttention(api, activeRoleType, { params: activeProfileId ? { commerceProfileId: activeProfileId } : null })
      .then((items) => { if (live) setRoleItems(items); });
    personalAttention(api, { inboxUnread }).then((items) => { if (live) setPersonalItems(items); });
    return () => { live = false; };
  }, [isLoggedIn, activeRoleType, activeContext?.accountRoleId, activeProfileId, inboxUnread]);

  const activeRoleId = activeContext?.accountRoleId ?? null;
  const workspaces = useMemo(() => buildWorkspaces(roleOptions || [], businesses || [], activeRoleId),
    [roleOptions, businesses, activeRoleId]);
  const key = selectedKey || initialWorkspaceKey(workspaces, activeRoleId);
  const current = workspaces.find((w) => w.key === key) || workspaces[0];
  const recentNow = usableRecent(recent, workspaces);

  const open = async (toolItem, role) => {
    const item = { key: toolItem.key, label: toolItem.label, destination: toolItem.destination, params: toolItem.params,
      accountRoleId: role ? role.accountRoleId : null, workspaceKey: current?.key || 'personal' };
    rememberTool(item);
    setRecent(readRecentTools());
    if (!role || role.isActive) { if (toolItem.params) onNavigate(toolItem.destination, toolItem.params); else onNavigate(toolItem.destination); return; }
    if (role.state !== ROLE_STATE.ACTIVE || typeof onSwitchAccountRole !== 'function') return;
    setOpening(toolItem.key);
    try { await onSwitchAccountRole(role.accountRoleId, toolItem.destination); } finally { setOpening(null); }
  };

  const openRecent = (item) => {
    const role = workspaces.flatMap((w) => w.roles).find((r) => Number(r.accountRoleId) === Number(item.accountRoleId));
    open(item, item.accountRoleId == null ? null : role);
  };

  const toolGrid = (tools, role) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
      {tools.map((t) => (
        <button key={t.key} type="button" data-testid={`tool-${t.key}`} onClick={() => open(t, role)} disabled={opening === t.key}
          style={{ minHeight: 84, border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', padding: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: INK, opacity: opening === t.key ? 0.6 : 1 }}>
          <Icon d={t.icon} color={BLUE} />
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );

  const stateCard = (role) => {
    const s = STATE_TEXT[role.state] || STATE_TEXT[ROLE_STATE.UNAVAILABLE];
    const tone = TONE[s.tone] || TONE.muted;
    return (
      <div key={role.accountRoleId} data-testid={`role-state-${role.accountRoleId}`}
        style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>{role.label}</strong>
          <span style={{ fontSize: 13, fontWeight: 700, color: tone.fg, background: tone.bg, borderRadius: 10, padding: '2px 10px' }}>{s.badge}</span>
        </div>
        <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.45 }}>{s.text}</span>
        {role.state !== ROLE_STATE.PENDING && (
          <button type="button" onClick={() => onNavigate('ContactUs')} style={{ ...pill, alignSelf: 'flex-start', height: 36, fontSize: 14 }}>Wasiliana na KenteXa</button>
        )}
      </div>
    );
  };

  const roleBlock = (role) => (
    role.state === ROLE_STATE.ACTIVE ? (
      <section key={role.accountRoleId} aria-label={role.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{role.label}{role.isActive ? ' · unaitumia sasa' : ''}</span>
        {toolGrid(role.tools, role)}
      </section>
    ) : stateCard(role)
  );

  const attentionList = (items) => items.length > 0 && (
    <section aria-label="Kinachohitaji wewe" data-testid="attention" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 18, fontWeight: 800 }}>Kinachohitaji wewe</span>
      {items.map((i) => (
        <button key={i.key} type="button" data-testid={`attention-${i.key}`} onClick={() => onNavigate(i.destination)}
          style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', border: `1px solid ${LINE}`,
            borderRadius: 14, background: '#fff', textAlign: 'left', fontFamily: 'inherit', color: INK, cursor: 'pointer' }}>
          <span style={{ minWidth: 32, height: 32, borderRadius: 16, padding: '0 8px', boxSizing: 'border-box',
            background: i.tone === 'amber' ? '#fef3c7' : '#eff6ff', color: i.tone === 'amber' ? '#92400e' : BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>{i.count}</span>
          <span style={{ flexGrow: 1, fontSize: 15, fontWeight: 700 }}>{i.label}</span>
          <Chevron />
        </button>
      ))}
    </section>
  );
  // The active role's items sit in the workspace that holds that role.
  const holdsActiveRole = (w) => w && w.roles.some((r) => r.isActive);

  // Business: the active role's items when this business holds it. Binafsi: the account's own
  // items, plus the active role's when that role is personal (an agent).
  const attentionNow = !current ? [] : current.kind === 'business'
    ? (holdsActiveRole(current) ? roleItems : [])
    : [...(holdsActiveRole(current) ? roleItems : []), ...personalItems];

  const startOptions = startOptionsFor(roleOptions || []);
  const loading = businesses === null;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: INK, paddingBottom: 90,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Kazi</h1>
          <button type="button" aria-label="Wasifu wangu" onClick={() => onNavigate('MyProfile')}
            style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {currentUser?.avatarUrl
              ? <img src={currentUser.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover' }} />
              : <span style={{ width: 32, height: 32, borderRadius: 16, background: '#cfd9de', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{(currentUser?.name || 'U').charAt(0).toUpperCase()}</span>}
          </button>
        </div>
      </div>

      {/* Phase 3: on a computer, two columns -- who you are and what needs you on the left,
          the tools on the right. On a phone the columns stack (flex-wrap). */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, boxSizing: 'border-box' }}>
      <div data-testid="workspace-side" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div role="alert" style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>{error}</div>}

        {/* Invitations to a business's team and the businesses I work for (owner 2026-11-03). */}
        <TeamWork onNavigate={onNavigate} />

        {/* The workspace switcher: Binafsi and each business. Choosing one shows its tools;
            the active role on the server changes only when a tool of another role is opened. */}
        {current && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" data-testid="workspace-switcher" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${LINE}`, borderRadius: 16,
                background: '#fff', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: INK }}>
              <span style={{ width: 44, height: 44, borderRadius: current.kind === 'personal' ? 22 : 10, background: current.kind === 'personal' ? '#cfd9de' : '#0f172a',
                color: current.kind === 'personal' ? INK : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                {current.title.charAt(0).toUpperCase()}
              </span>
              <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, color: MUTED }}>Unafanya kazi kama</span>
                <span style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.title}{current.subtitle ? ` · ${current.subtitle}` : ''}</span>
              </span>
              {workspaces.length > 1 && <span style={{ fontSize: 14, fontWeight: 700, color: BLUE }}>Badilisha</span>}
            </button>
            {choosing && workspaces.length > 1 && (
              <div role="listbox" aria-label="Chagua mahali pa kazi" style={{ border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
                {workspaces.map((w) => (
                  <button key={w.key} type="button" role="option" aria-selected={w.key === current.key}
                    onClick={() => { setSelectedKey(w.key); setChoosing(false); }}
                    style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', border: 'none',
                      borderBottom: `1px solid ${LINE}`, background: w.key === current.key ? '#eff6ff' : '#fff', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: INK }}>
                    <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{w.title}</span>
                      <span style={{ fontSize: 13, color: MUTED }}>{w.subtitle}</span>
                    </span>
                    {w.key === current.key && <Icon d="M5 12l5 5L20 7" color={BLUE} size={18} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {recentNow.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Ulizotumia karibuni</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {recentNow.map((r) => (
                <button key={`${r.key}-${r.accountRoleId}`} type="button" onClick={() => openRecent(r)} style={pill}>{r.label}</button>
              ))}
            </div>
          </div>
        )}

        {attentionList(attentionNow)}
      </div>
      <div data-testid="workspace-main" style={{ flex: '999 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div role="status" style={{ color: MUTED, fontSize: 15, padding: '24px 0' }}>Inapakia kazi zako…</div>}

        {!loading && current && current.kind === 'business' && (
          <div data-testid="business-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {current.roles.length === 0 && (
              <div style={{ border: `1px dashed #cfd9de`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 15, lineHeight: 1.45 }}>Biashara hii bado haina kazi kwenye KenteXa. Anza kuuza, kutoa huduma au usafiri.</span>
                <button type="button" onClick={() => onNavigate(`BusinessHome-${current.businessId}`)}
                  style={{ ...pill, alignSelf: 'flex-start', background: BLUE, color: '#fff', border: 'none' }}>Anza</button>
              </div>
            )}
            {current.roles.map(roleBlock)}
            {/* Hotel tools (owner 2026-11-02): kitchen and menu for a food business; any other
                business can switch its menu on (the server checks the caller runs it). */}
            {isFoodBusiness(current.category) ? (
              <section aria-label="Hoteli" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>Hoteli</span>
                {toolGrid(hotelTools(current.businessId), null)}
              </section>
            ) : (
              <button type="button" data-testid="hotel-start" onClick={() => onNavigate('HotelMenuManager', { businessId: current.businessId })}
                style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 14px',
                  border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: INK, cursor: 'pointer' }}>
                <span>Una hoteli au mgahawa? Weka menyu ya chakula</span><Chevron />
              </button>
            )}
            <button type="button" data-testid="business-today" onClick={() => onNavigate(`BusinessDashboard-${current.businessId}`)}
              style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 14px',
                border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: INK, cursor: 'pointer' }}>
              <span>Leo: wateja, oda na wafuasi</span><Chevron />
            </button>
            <button type="button" onClick={() => onNavigate(`BusinessHome-${current.businessId}`)}
              style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 14px',
                border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: INK, cursor: 'pointer' }}>
              <span>Ukurasa wa biashara: ongeza huduma, usafiri au menyu</span><Chevron />
            </button>
          </div>
        )}

        {!loading && current && current.kind === 'personal' && (
          <div data-testid="personal-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {current.roles.map(roleBlock)}
            <section aria-label="Binafsi" style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, fontWeight: 800, paddingBottom: 4 }}>Binafsi</span>
              {current.tools.map((t) => (
                <button key={t.key} type="button" data-testid={`tool-${t.key}`} onClick={() => open(t, null)}
                  style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, border: 'none', borderBottom: `1px solid ${LINE}`,
                    background: '#fff', textAlign: 'left', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: INK, cursor: 'pointer', padding: 0 }}>
                  <Icon d={t.icon} size={20} /><span style={{ flexGrow: 1 }}>{t.label}</span><Chevron />
                </button>
              ))}
            </section>
            {startOptions.length > 0 && (
              <section aria-label="Fanya kazi na KenteXa" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>Fanya kazi na KenteXa</span>
                  <span style={{ fontSize: 14, color: MUTED }}>Chagua kazi yako. Zana zake zitaonekana hapa ukishaidhinishwa.</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {startOptions.map((s) => (
                    <button key={s.key} type="button" data-testid={`start-${s.key}`} onClick={() => (s.params ? onNavigate(s.destination, s.params) : onNavigate(s.destination))}
                      style={{ minHeight: 96, border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, background: '#fff', textAlign: 'left',
                        display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'inherit', color: INK, cursor: 'pointer' }}>
                      <Icon d={s.icon} color={BLUE} />
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{s.label}</span>
                      <span style={{ fontSize: 13, color: MUTED }}>{s.note}</span>
                      {s.held && <span style={{ fontSize: 12, color: '#05603a', fontWeight: 700 }}>Unayo tayari: ongeza nyingine</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
