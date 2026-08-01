/**
 * LocationPicker.js — Cascade location dropdown for Tanzania
 *
 * Usage:
 *   <LocationPicker
 *     label="Anwani ya Mpokeaji"
 *     value={location}           // { regionId, regionName, districtId, districtName, wardId, wardName }
 *     onChange={setLocation}
 *     required
 *   />
 *
 * Returns a structured location object that KenteXa stores consistently.
 * No more free-text city names that can be typed differently by different sellers.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const sel = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '2px solid #e2e8f0', fontSize: 14,
  backgroundColor: '#fff', boxSizing: 'border-box',
  appearance: 'none', cursor: 'pointer',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath fill=\'%2394a3b8\' d=\'M6 8L0 0h12z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 36,
};

const LocationPicker = ({
  label,
  value = {},
  onChange,
  required = false,
  showWard = true,          // set false if ward not needed (e.g. just region/district)
  placeholder = 'Chagua...',
  style = {},
}) => {
  const { t } = useTranslation();
  const [regions,   setRegions]   = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards,     setWards]     = useState([]);

  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards,     setLoadingWards]     = useState(false);

  // Load regions once on mount
  useEffect(() => {
    api.get('/locations/regions')
      .then(res => setRegions(res.data || []))
      .catch(() => {});
  }, []);

  // Load districts when region changes
  useEffect(() => {
    if (!value.regionId) { setDistricts([]); setWards([]); return; }
    setLoadingDistricts(true);
    api.get(`/locations/districts?regionId=${value.regionId}`)
      .then(res => setDistricts(res.data || []))
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [value.regionId]);

  // Load wards when district changes
  useEffect(() => {
    if (!value.districtId || !showWard) { setWards([]); return; }
    setLoadingWards(true);
    api.get(`/locations/wards?districtId=${value.districtId}`)
      .then(res => setWards(res.data || []))
      .catch(() => setWards([]))
      .finally(() => setLoadingWards(false));
  }, [value.districtId, showWard]);

  const handleRegion = (e) => {
    const id = Number(e.target.value);
    const region = regions.find(r => r.id === id);
    onChange({
      regionId: id, regionName: region?.name || '',
      districtId: null, districtName: '',
      wardId: null, wardName: '',
    });
  };

  const handleDistrict = (e) => {
    const id = Number(e.target.value);
    const district = districts.find(d => d.id === id);
    onChange({
      ...value,
      districtId: id, districtName: district?.name || '',
      wardId: null, wardName: '',
    });
  };

  const handleWard = (e) => {
    const id = Number(e.target.value);
    const ward = wards.find(w => w.id === id);
    onChange({ ...value, wardId: id, wardName: ward?.name || '' });
  };

  return (
    <div style={{ ...style }}>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700,
          color: '#475569', marginBottom: 6 }}>
          {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
        </label>
      )}

      {/* Region */}
      <select value={value.regionId || ''} onChange={handleRegion}
        style={{ ...sel, marginBottom: 8,
          borderColor: required && !value.regionId ? '#fca5a5' : '#e2e8f0' }}>
        <option value="">{t('location_picker.select_region')}</option>
        {regions.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      {/* District */}
      {value.regionId && (
        <select value={value.districtId || ''} onChange={handleDistrict}
          style={{ ...sel, marginBottom: showWard ? 8 : 0,
            borderColor: required && !value.districtId ? '#fca5a5' : '#e2e8f0',
            opacity: loadingDistricts ? 0.6 : 1 }}>
          <option value="">
            {loadingDistricts ? t('location_picker.loading') : t('location_picker.select_district')}
          </option>
          {districts.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}

      {/* Ward */}
      {showWard && value.districtId && (
        <select value={value.wardId || ''} onChange={handleWard}
          style={{ ...sel,
            opacity: loadingWards ? 0.6 : 1 }}>
          <option value="">
            {loadingWards ? t('location_picker.loading') : t('location_picker.select_ward')}
          </option>
          {wards.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      )}

      {/* Full address preview */}
      {value.wardName && value.districtName && value.regionName && (
        <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#f0fdf4',
          borderRadius: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
          📍 {value.wardName}, {value.districtName}, {value.regionName}
        </div>
      )}
    </div>
  );
};

export default LocationPicker;