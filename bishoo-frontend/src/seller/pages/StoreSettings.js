import React, { useEffect, useState } from 'react';
import BackBar from '../../public/components/BackBar';
import api from '../../api/api';
// eslint-disable-next-line no-unused-vars
// eslint-disable-next-line no-unused-vars
import LocationPicker from '../../public/components/LocationPicker';

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff' };

const StoreSettings = ({ userId, onNavigate }) => {
  const [storeLocation, setStoreLocation] = useState({
    regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: ''
  });
  const [form, setForm] = useState({
    storeName: '', storeWhatsApp: '', storeTagline: '', storeDescription: '',
    logo: '', coverImage: '', businessLocation: '', businessHours: '',
    sellerPickupAddress: '',
    pickupAvailable: false, freeDelivery: false, fastShipping: false,
    galleryImages: [],
    payoutMethod: '', payoutAccountName: '', payoutAccountNumber: '',
    payoutBankName: '', payoutBranchName: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');

  useEffect(() => { fetchProfile(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/stores/${userId}`);
      const s = res.data.seller;
      setForm({
        storeName:        s.storeName || '',
        storeWhatsApp:    s.storeWhatsApp || '',
        payoutMethod:        s.payoutMethod || '',
        payoutAccountName:   s.payoutAccountName || '',
        payoutAccountNumber: s.payoutAccountNumber || '',
        payoutBankName:      s.payoutBankName || '',
        payoutBranchName:    s.payoutBranchName || '',
        storeTagline:     s.storeTagline || '',
        storeDescription: s.storeDescription || '',
        logo:             s.logo || '',
        coverImage:       s.coverImage || '',
        sellerPickupAddress: s.sellerPickupAddress || '',
        businessLocation: s.businessLocation || '',
        businessHours:    s.businessHours || '',
        pickupAvailable:  s.pickupAvailable || false,
        freeDelivery:     s.freeDelivery || false,
        fastShipping:     s.fastShipping || false,
        galleryImages:    s.galleryImages || [],
      });
    } catch (err) {
      setError('Failed to load store profile');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setUploading(field);
      const formData = new FormData();
      formData.append('files', file);
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data.urls?.[0] || res.data.url || res.data.path;
      if (field === 'gallery') {
        setForm(f => ({ ...f, galleryImages: [...f.galleryImages, url] }));
      } else {
        setForm(f => ({ ...f, [field]: url }));
      }
    } catch (err) {
      setError('Image upload failed');
    } finally {
      setUploading('');
    }
  };

  const removeGalleryImage = (idx) => {
    setForm(f => ({ ...f, galleryImages: f.galleryImages.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(''); setMessage('');
      await api.patch('/stores/profile', form);
      setMessage('Store profile updated successfully!');
      // Take seller to their public store page so they can see how it looks
      setTimeout(() => {
        if (onNavigate && userId) onNavigate(`CommerceProfile-${userId}`);
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>⏳ Loading store settings...</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16, paddingBottom: 100 }}>
      <BackBar onBack={() => onNavigate('back')} title="⚙️ Mipangilio ya Duka" />
      <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 4, fontFamily: 'Manrope,sans-serif' }}>🏪 Store Settings</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Customize how your store appears to buyers</p>

      {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✅ {message}</div>}
      {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>❌ {error}</div>}

      {/* Branding */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>🎨 Branding</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Store Name</label>
          <input type="text" value={form.storeName} onChange={e => setForm({ ...form, storeName: e.target.value })}
            placeholder="e.g. BIS Security Solutions" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Namba ya WhatsApp ya Duka <span style={{ fontWeight: 400, color: '#94a3b8' }}>(kwa ufuatiliaji wa wateja)</span></label>
          <input type="tel" value={form.storeWhatsApp} onChange={e => setForm({ ...form, storeWhatsApp: e.target.value })}
            placeholder="e.g. 0788075633" style={inputStyle} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            💬 Wateja wataweza kufuatilia agizo kwa kubonyeza kitufe cha WhatsApp — kitaenda kwenye namba hii badala ya namba ya KenteXa
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Tagline</label>
          <input type="text" value={form.storeTagline} onChange={e => setForm({ ...form, storeTagline: e.target.value })}
            placeholder="e.g. Security Cameras • Electronics" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Store Description</label>
          <textarea value={form.storeDescription} onChange={e => setForm({ ...form, storeDescription: e.target.value })}
            placeholder="Tell buyers about your business..." style={{ ...inputStyle, minHeight: 80 }} />
        </div>

        {/* Logo */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Store Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.logo ? <img src={form.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏪'}
            </div>
            <label style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {uploading === 'logo' ? 'Uploading...' : 'Upload Logo'}
              <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'logo')} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Cover */}
        <div>
          <label style={labelStyle}>Cover Banner</label>
          <div style={{ width: '100%', height: 80, borderRadius: 10, backgroundColor: '#f1f5f9', overflow: 'hidden', marginBottom: 8 }}>
            {form.coverImage && <img src={form.coverImage} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <label style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: '#1d4ed8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }}>
            {uploading === 'coverImage' ? 'Uploading...' : 'Upload Cover'}
            <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'coverImage')} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Payout details — how KenteXa sends the seller their money */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>💸 Njia ya Malipo</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
          KenteXa itatumia maelezo haya kukulipa mauzo yako yaliyofanyika ndani ya mfumo. Bila hii, malipo yako hayawezi kutolewa.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Njia ya Malipo *</label>
          <select value={form.payoutMethod} onChange={e => setForm({ ...form, payoutMethod: e.target.value })} style={inputStyle}>
            <option value="">— Chagua njia —</option>
            <option value="mpesa">📱 M-Pesa (Vodacom)</option>
            <option value="airtel_money">📱 Airtel Money</option>
            <option value="tigo_pesa">📱 Tigo Pesa</option>
            <option value="halotel">📱 Halotel</option>
            <option value="bank">🏦 Benki</option>
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Jina kwenye Akaunti *</label>
          <input type="text" value={form.payoutAccountName} onChange={e => setForm({ ...form, payoutAccountName: e.target.value })}
            placeholder="e.g. Juma Hassan Mfaume" style={inputStyle} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Jina lazima lifanane na jina lililosajiliwa kwenye akaunti/namba hii</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>
            {form.payoutMethod === 'bank' ? 'Namba ya Akaunti ya Benki *' : 'Namba ya Simu *'}
          </label>
          <input type="text" value={form.payoutAccountNumber} onChange={e => setForm({ ...form, payoutAccountNumber: e.target.value })}
            placeholder={form.payoutMethod === 'bank' ? 'e.g. 0123456789012' : 'e.g. 0788075633'} style={inputStyle} />
        </div>

        {form.payoutMethod === 'bank' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Jina la Benki *</label>
              <input type="text" value={form.payoutBankName} onChange={e => setForm({ ...form, payoutBankName: e.target.value })}
                placeholder="e.g. CRDB Bank, NMB, NBC..." style={inputStyle} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>Tawi (Optional)</label>
              <input type="text" value={form.payoutBranchName} onChange={e => setForm({ ...form, payoutBranchName: e.target.value })}
                placeholder="e.g. Kariakoo Branch" style={inputStyle} />
            </div>
          </>
        )}
      </div>

      {/* Business info */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>📍 Business Information</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>📍 Eneo la Biashara (Mkoa / Wilaya / Kata)</label>
          <LocationPicker
            value={storeLocation}
            onChange={loc => {
              setStoreLocation(loc);
              setForm(prev => ({
                ...prev,
                businessLocation: [loc.wardName, loc.districtName, loc.regionName].filter(Boolean).join(', '),
                businessCity:     loc.districtName || loc.regionName || '',
                businessDistrict: loc.districtName || '',
                businessRegion:   loc.regionName   || '',
              }));
            }}
          />
          {form.businessLocation ? (
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 6 }}>
              ✅ {form.businessLocation}
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>
            Anwani ya Kuchukua Bidhaa 🚴 <span style={{ fontWeight: 400, color: '#94a3b8' }}>(kwa wakala wa kukusanya)</span>
          </label>
          <textarea value={form.sellerPickupAddress} onChange={e => setForm({ ...form, sellerPickupAddress: e.target.value })}
            rows={3} placeholder="e.g. Nyumba ya Rangi ya Njano, Mtaa wa Geita, karibu na kanisa la KKKT — namba ya simu: 0788..."
            style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            🏠 Maelekezo mazuri husaidia wakala kukupata haraka. Weka alama muhimu karibu nawe.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Business Hours</label>
          <input type="text" value={form.businessHours} onChange={e => setForm({ ...form, businessHours: e.target.value })}
            placeholder="e.g. 8:00 AM - 7:00 PM" style={inputStyle} />
        </div>
      </div>

      {/* Delivery options */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>🚚 Delivery Options</h3>
        {[
          { key: 'pickupAvailable', label: 'Pickup Available', desc: 'Buyers can collect from your location' },
          { key: 'freeDelivery',    label: 'Free Delivery',    desc: 'You offer free shipping on orders' },
          { key: 'fastShipping',    label: 'Fast Shipping',    desc: 'You ship orders quickly (same/next day)' },
        ].map(opt => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
            <input type="checkbox" checked={form[opt.key]} onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#1d4ed8' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Gallery */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>📸 Store Gallery</h3>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Show photos of your shop, office, or warehouse to build trust</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {form.galleryImages.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
              <img src={img} alt={`gallery-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              <button onClick={() => removeGalleryImage(i)}
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>

        <label style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: '#f1f5f9', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-block' }}>
          {uploading === 'gallery' ? 'Uploading...' : '+ Add Photo'}
          <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'gallery')} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
        {saving ? '⏳ Saving...' : '💾 Save Store Settings'}
      </button>
    </div>
  );
};

export default StoreSettings;