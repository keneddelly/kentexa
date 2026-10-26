/**
 * SuperAgentSettings.js — Hub profile and settings for Super Agent
 * Ofisi yangu: name, phone, place. Prices live in the dashboard's "Bei zangu"
 * (OfficePrices), owner 2026-10-26.
 */
import { BOTTOM_NAV_CLEARANCE } from '../components/BottomNav';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import IntelligentLocationInput from '../components/IntelligentLocationInput';
import OfficePoint from '../components/OfficePoint';

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};

const SuperAgentSettings = ({ onNavigate, isLoggedIn }) => {
  const { t } = useTranslation();
  const [profile, setProfile]   = useState(null);
  const [form, setForm]         = useState({
    businessName: '', phone: '', address: '', city: '',
    region: '', description: '', whatsappNumber: '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [locationText, setLocationText] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    api.get('/super-agents/my-profile')
      .then(res => {
        setProfile(res.data);
        setForm({
          businessName:  res.data.businessName  || '',
          phone:         res.data.phone         || '',
          address:       res.data.address       || '',
          city:          res.data.city          || '',
          region:        res.data.region        || '',
          description:   res.data.description   || '',
          whatsappNumber:res.data.whatsappNumber|| '',
        });
        setLocationText(res.data.locationLabel || res.data.address || res.data.city || '');
      })
      .catch(() => setError(t('super_agent_settings.load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      setSaving(true); setError(''); setSuccess('');
      await api.patch('/super-agents/my-profile', {
        businessName: form.businessName, phone: form.phone, address: form.address,
      });
      if (resolvedLocation?.placeRef) {
        const updated = await api.patch('/super-agents/my-profile/location', {
          providerKey: resolvedLocation.placeRef.providerKey,
          providerPlaceId: resolvedLocation.placeRef.providerPlaceId,
          addressDetail: form.address,
        });
        // A GPS office point is kept by the server; a place pick without one
        // gives the office an approximate (place centre) point.
        setProfile(prev => ({ ...updated.data,
          officePointByGps: Boolean(prev?.officePointByGps),
          officePointSet: Boolean(prev?.officePointByGps || updated.data?.latitude != null || prev?.officePointSet) }));
        setForm(p => ({ ...p, city: updated.data.city || p.city, address: updated.data.address || p.address }));
      }
      setSuccess(t('super_agent_settings.save_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('super_agent_settings.save_failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f1f5f9' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_settings.page_title')} top={0} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto',
        width: '100%', boxSizing: 'border-box', paddingBottom: BOTTOM_NAV_CLEARANCE }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳</div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

            {profile?.agentCode && (
              <div style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 14px',
                marginBottom: 20, fontSize: 13, color: '#1d4ed8', fontFamily: 'monospace',
                fontWeight: 800, textAlign: 'center' }}>
                {profile.agentCode}
              </div>
            )}

            {error && (
              <div style={{ color: '#dc2626', backgroundColor: '#fee2e2',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                ❌ {error}
              </div>
            )}
            {success && (
              <div style={{ color: '#16a34a', backgroundColor: '#dcfce7',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
                fontWeight: 700 }}>
                {success}
              </div>
            )}

            {[
              { k: 'businessName',   l: t('super_agent_settings.field_business_name_label'),         ph: 'Geita Express Hub' },
              { k: 'phone',          l: t('super_agent_settings.field_phone_label'),                 ph: '0712345678' },
              { k: 'whatsappNumber', l: t('super_agent_settings.field_whatsapp_label'),               ph: '255712345678' },
              { k: '__location_picker__', isCustom: true },
              { k: 'address',        l: 'Maelezo ya eneo / landmark', ph: 'Mfano: karibu na soko, jengo la pili' },
              { k: 'description',    l: t('super_agent_settings.field_description_label'),      ph: t('super_agent_settings.field_description_placeholder') },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                {f.isCustom ? (
                  <>
                    <IntelligentLocationInput
                      label="Eneo la Hub"
                      value={locationText}
                      onTextChange={setLocationText}
                      onResolved={setResolvedLocation}
                      placeholder="Tafuta eneo, ward au district…"
                      required
                    />
                    {profile?.locationLabel && !resolvedLocation && <div style={{fontSize:11,color:'#16a34a',marginTop:-8}}>📍 {profile.locationLabel}</div>}
                    <div style={{ marginTop: 12 }}>
                      <OfficePoint officePointSet={profile?.officePointSet} officePointByGps={profile?.officePointByGps}
                        onSaved={(r) => setProfile(p => ({ ...p, officePointSet: r.officePointSet, officePointByGps: r.officePointByGps }))} />
                    </div>
                  </>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700,
                      color: '#475569', marginBottom: 5 }}>{f.l}</label>
                    <input type="text" placeholder={f.ph} value={form[f.k] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                      style={inp} />
                  </>
                )}
              </div>
            ))}

            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', backgroundColor: saving ? '#94a3b8' : '#1d4ed8',
                color: '#fff', border: 'none', padding: 14, borderRadius: 10,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 900, marginTop: 8 }}>
              {saving ? t('super_agent_settings.saving') : t('super_agent_settings.save_button')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default SuperAgentSettings;