import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/api';
import BackBar from '../components/BackBar';

const BLUE = '#2563eb';
const INK = '#0f172a';
const MUTED = '#64748b';

export default function BusinessIntegrations({ businessId, onNavigate, returnTo }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!businessId) { setError('Business haijachaguliwa.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/business/${businessId}/instagram/connections`);
      const data = response.data;
      setConnections(Array.isArray(data) ? data : (data?.connections || []));
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kupakia miunganisho ya Business hii.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const response = await api.get(`/business/${businessId}/instagram/oauth/start`);
      const url = response.data?.authorizationUrl || response.data?.authUrl || response.data?.url;
      if (!url) throw new Error('Meta authorization link haikurudi kutoka server.');
      window.location.assign(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Imeshindikana kuanza kuunganisha Instagram.');
      setConnecting(false);
    }
  };

  const disconnect = async (connectionId) => {
    if (!window.confirm('Unataka kukata muunganisho wa Instagram hii?')) return;
    setDisconnecting(connectionId);
    setError('');
    try {
      await api.delete(`/business/${businessId}/instagram/connections/${connectionId}`);
      setNotice('Instagram imeondolewa kwenye Business hii.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Imeshindikana kukata muunganisho.');
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: INK }}>
      <BackBar onBack={() => onNavigate(returnTo === 'SellerInbox' ? 'SellerInbox' : 'BusinessHome-' + businessId)} title="Business integrations" top={0} />
      <main style={{ maxWidth: 620, margin: '0 auto', padding: 16 }}>
        <div style={{ margin: '8px 0 18px' }}>
          <h2 style={{ fontSize: 22, lineHeight: 1.2, margin: '0 0 8px', fontWeight: 800 }}>Instagram</h2>
          <p style={{ margin: 0, color: MUTED, fontSize: 15, lineHeight: 1.5 }}>
            Unganisha akaunti ya Instagram Professional ya Business hii ili ujumbe wa wateja uingie kwenye Unified Inbox ya Kentexa.
          </p>
        </div>

        {error && <div role="alert" style={{ padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', fontSize: 14, marginBottom: 12 }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 12, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontSize: 14, marginBottom: 12 }}>{notice}</div>}

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>IG</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Instagram messages</div>
              <div style={{ fontSize: 13, color: MUTED }}>Meta · Business connection</div>
            </div>
          </div>

          {loading ? <p style={{ color: MUTED, fontSize: 14 }}>Inapakia...</p> : connections.length === 0 ? (
            <div style={{ padding: '12px 0' }}>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>Bado hakuna akaunti ya Instagram iliyounganishwa na Business hii.</p>
              <button type="button" onClick={connect} disabled={connecting}
                style={{ width: '100%', minHeight: 48, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontSize: 15, fontWeight: 800, cursor: connecting ? 'wait' : 'pointer', opacity: connecting ? 0.7 : 1 }}>
                {connecting ? 'Inaunganisha...' : 'Connect Instagram'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {connections.map((connection) => {
                const active = connection.status === 'active';
                return (
                  <div key={connection.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>@{connection.instagramUsername || connection.username || 'Instagram account'}</div>
                        <div style={{ color: active ? '#15803d' : '#b45309', fontSize: 13, marginTop: 4 }}>
                          {active ? 'Connected' : connection.status === 'reauth_required' ? 'Needs reconnection' : connection.status || 'Disconnected'}
                        </div>
                        <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                          {connection.webhookSubscribed ? 'Message webhook subscribed' : 'Webhook subscription not confirmed'}
                        </div>
                      </div>
                      <button type="button" onClick={() => disconnect(connection.id)} disabled={disconnecting === connection.id}
                        style={{ minHeight: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', fontSize: 13, fontWeight: 700 }}>
                        {disconnecting === connection.id ? '...' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={connect} disabled={connecting}
                style={{ width: '100%', minHeight: 46, border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', color: INK, fontSize: 14, fontWeight: 800 }}>
                {connecting ? 'Inaunganisha...' : 'Add / reconnect Instagram'}
              </button>
            </div>
          )}
        </section>

        <section style={{ marginTop: 14, padding: 14, borderRadius: 14, background: '#eff6ff', color: '#1e3a8a' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>Jinsi inavyofanya kazi</div>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>Ujumbe mpya wa Instagram utaonekana kwenye Unified Inbox. Majibu ya maandishi yanaweza kutumwa ndani ya dirisha la mazungumzo linaloruhusiwa na Meta. Ruhusa za Business zinathibitishwa na server.</p>
        </section>
      </main>
    </div>
  );
}
