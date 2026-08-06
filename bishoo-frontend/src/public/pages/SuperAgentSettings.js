/**
 * SuperAgentSettings.js — Hub profile and settings for Super Agent
 * Accessed via ⚙️ gear icon on SuperAgentDashboard
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none',
};

const SuperAgentSettings = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t } = useTranslation();
  const [profile, setProfile]   = useState(null);
  const [form, setForm]         = useState({
    businessName: '', phone: '', address: '', city: '',
    region: '', description: '', whatsappNumber: '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [location, setLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
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
      })
      .catch(() => setError(t('super_agent_settings.load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      setSaving(true); setError(''); setSuccess('');
      await api.patch('/super-agents/my-profile', form);
      setSuccess(t('super_agent_settings.save_success'));
    } catch (err) {
      setError(err?.response?.data?.message || t('super_agent_settings.save_failed'));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f1f5f9' }}>
      <Navbar currentPage="SuperAgentSettings" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title={t('super_agent_settings.page_title')} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto',
        width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

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
            { k: 'city',           l: t('super_agent_settings.field_city_label'),                  ph: t('super_agent_settings.field_city_placeholder') },
              { k: 'region',         l: t('super_agent_settings.field_region_label'),                   ph: t('super_agent_settings.field_region_placeholder') },
              { k: 'address',        l: t('super_agent_settings.field_address_label'),          ph: t('super_agent_settings.field_address_placeholder') },
              { k: 'description',    l: t('super_agent_settings.field_description_label'),      ph: t('super_agent_settings.field_description_placeholder') },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                {f.isCustom ? (
                  <LocationPicker
                    label={t('super_agent_settings.location_picker_label')}
                    value={location}
                    onChange={loc => {
                      setLocation(loc);
                      setForm(p => ({
                        ...p,
                        city: loc.districtName || p.city,
                        region: loc.regionName || p.region,
                      }));
                    }}
                  />
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