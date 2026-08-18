import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

// ── Classified categories with subcategories and spec fields ─────────────────
const CLASSIFIED_CATEGORIES = {
  electronics: {
    label: 'Electronics', icon: '📱',
    subcategories: {
      smartphones:    { label: 'Smartphones',     specs: ['Brand','Model','Storage','RAM','Color','Condition','Battery Health'] },
      laptops:        { label: 'Laptops',         specs: ['Brand','Processor','RAM','Storage','Screen Size','OS','Condition'] },
      tvs:            { label: 'TVs & Displays',  specs: ['Brand','Screen Size','Resolution','Smart TV','Condition'] },
      audio:          { label: 'Audio & Sound',   specs: ['Type','Brand','Connectivity','Condition'] },
      cameras:        { label: 'Cameras',         specs: ['Brand','Megapixels','Type','Condition'] },
      accessories:    { label: 'Accessories',     specs: ['Compatible With','Brand','Condition'] },
      other:          { label: 'Other',            specs: ['Brand','Model','Condition'] },
    },
  },
  vehicles: {
    label: 'Vehicles', icon: '🚗',
    subcategories: {
      cars:          { label: 'Cars',              specs: ['Make','Model','Year','Mileage (km)','Fuel Type','Transmission','Color','Engine (cc)','Doors','Condition'] },
      motorcycles:   { label: 'Motorcycles',       specs: ['Make','Model','Year','Engine (cc)','Color','Mileage (km)','Condition'] },
      trucks:        { label: 'Trucks & Buses',    specs: ['Make','Model','Year','Mileage (km)','Fuel Type','Payload (tons)','Condition'] },
      boats:         { label: 'Boats',             specs: ['Type','Engine','Length','Year','Condition'] },
      spare_parts:   { label: 'Spare Parts',       specs: ['Compatible With','Part Name','Brand','Condition'] },
      accessories:   { label: 'Vehicle Accessories', specs: ['Compatible With','Brand','Condition'] },
    },
  },
  property: {
    label: 'Property', icon: '🏢',
    subcategories: {
      house_sale:    { label: 'House for Sale',    specs: ['Bedrooms','Bathrooms','Plot Size (sqm)','Floor Area (sqm)','Title Deed','Location','Parking'] },
      house_rent:    { label: 'House for Rent',    specs: ['Bedrooms','Bathrooms','Floor Area (sqm)','Furnished','Location','Parking'] },
      apartment:     { label: 'Apartment for Sale/Rent', specs: ['Bedrooms','Bathrooms','Floor','Furnished','Floor Area (sqm)','Location'] },
      land:          { label: 'Land for Sale',     specs: ['Plot Size (sqm/acres)','Title Deed','Location','Road Access','Water Available'] },
      commercial:    { label: 'Commercial Property', specs: ['Type','Floor Area (sqm)','Location','Parking'] },
      office:        { label: 'Office Space',      specs: ['Floor Area (sqm)','Floor','Location','Furnished','Parking'] },
    },
  },
  fashion: {
    label: 'Fashion', icon: '👗',
    subcategories: {
      mens:    { label: "Men's Clothing",    specs: ['Size','Brand','Color','Material','Condition'] },
      womens:  { label: "Women's Clothing",  specs: ['Size','Brand','Color','Material','Condition'] },
      kids:    { label: "Kids' Clothing",    specs: ['Age Range','Size','Brand','Color','Condition'] },
      shoes:   { label: 'Shoes',             specs: ['Size (EU)','Brand','Color','Gender','Condition'] },
      bags:    { label: 'Bags',              specs: ['Brand','Material','Color','Condition'] },
      watches: { label: 'Watches',           specs: ['Brand','Movement','Gender','Condition'] },
      jewelry: { label: 'Jewelry',           specs: ['Material','Brand','Condition'] },
    },
  },
  services: {
    label: 'Services', icon: '🔧',
    subcategories: {
      construction:  { label: 'Construction',      specs: ['Service Type','Experience (years)','Coverage Area'] },
      cleaning:      { label: 'Cleaning Services', specs: ['Service Type','Coverage Area','Availability'] },
      transport:     { label: 'Transport & Moving', specs: ['Vehicle Type','Capacity','Coverage Area'] },
      education:     { label: 'Tutoring & Education', specs: ['Subject','Level','Mode','Location/Online'] },
      beauty:        { label: 'Beauty & Salon',    specs: ['Service Type','Location','Availability'] },
      tech:          { label: 'Tech & IT Services', specs: ['Service Type','Experience (years)','Remote/Onsite'] },
      events:        { label: 'Events & Photography', specs: ['Service Type','Experience (years)','Coverage Area'] },
      other:         { label: 'Other Services',    specs: ['Service Type','Location','Availability'] },
    },
  },
  home_garden: {
    label: 'Home & Garden', icon: '🏠',
    subcategories: {
      furniture:   { label: 'Furniture',         specs: ['Material','Dimensions','Color','Condition'] },
      appliances:  { label: 'Home Appliances',   specs: ['Brand','Model','Power (W)','Condition'] },
      kitchen:     { label: 'Kitchen Items',     specs: ['Material','Brand','Condition'] },
      garden:      { label: 'Garden & Outdoor',  specs: ['Type','Material','Condition'] },
      decor:       { label: 'Home Decor',        specs: ['Material','Color','Dimensions','Condition'] },
    },
  },
  health_beauty: {
    label: 'Health & Beauty', icon: '💄',
    subcategories: {
      skincare:    { label: 'Skincare',           specs: ['Brand','Volume','Condition'] },
      fitness:     { label: 'Fitness Equipment',  specs: ['Type','Brand','Condition'] },
      medical:     { label: 'Medical Equipment',  specs: ['Type','Brand','Condition'] },
    },
  },
  food: {
    label: 'Food & Beverages', icon: '🍎',
    subcategories: {
      fresh:    { label: 'Fresh Produce',   specs: ['Type','Weight/Quantity','Origin','Harvest Date'] },
      packaged: { label: 'Packaged Food',   specs: ['Brand','Weight','Expiry Date'] },
      farm:     { label: 'Farm Products',   specs: ['Type','Quantity','Origin'] },
    },
  },
  agriculture: {
    label: 'Agriculture', icon: '🌾',
    subcategories: {
      livestock:   { label: 'Livestock',      specs: ['Type','Breed','Age','Quantity'] },
      farm_equip:  { label: 'Farm Equipment', specs: ['Type','Brand','Condition','Year'] },
      seeds:       { label: 'Seeds & Inputs', specs: ['Crop Type','Weight','Brand'] },
      land:        { label: 'Farm Land',      specs: ['Size (acres)','Location','Water Source','Title'] },
    },
  },
  security: {
    label: 'Security', icon: '🔒',
    subcategories: {
      cctv:    { label: 'CCTV & Cameras',   specs: ['Brand','Resolution','Condition','Quantity'] },
      alarms:  { label: 'Alarm Systems',    specs: ['Type','Brand','Condition'] },
      other:   { label: 'Other Security',   specs: ['Type','Brand','Condition'] },
    },
  },
  baby_kids: {
    label: 'Baby & Kids', icon: '🧸',
    subcategories: {
      toys:     { label: 'Toys & Games',  specs: ['Age Range','Brand','Condition'] },
      gear:     { label: 'Baby Gear',     specs: ['Type','Brand','Condition','Age Range'] },
      clothing: { label: "Kids' Clothing", specs: ['Size','Age Range','Brand','Condition'] },
    },
  },
  sports: {
    label: 'Sports', icon: '⚽',
    subcategories: {
      equipment: { label: 'Sports Equipment', specs: ['Sport','Brand','Condition'] },
      clothing:  { label: 'Sports Clothing',  specs: ['Sport','Size','Brand','Condition'] },
      bikes:     { label: 'Bicycles',         specs: ['Type','Brand','Frame Size','Condition'] },
    },
  },
  books: {
    label: 'Books & Education', icon: '📚',
    subcategories: {
      textbooks:   { label: 'Textbooks',  specs: ['Subject','Level','Author','Edition','Condition'] },
      other_books: { label: 'Other Books', specs: ['Genre','Author','Condition'] },
    },
  },
  arts: {
    label: 'Arts & Crafts', icon: '🎨',
    subcategories: {
      art:    { label: 'Artwork',            specs: ['Medium','Dimensions','Artist'] },
      music:  { label: 'Musical Instruments', specs: ['Type','Brand','Condition'] },
      crafts: { label: 'Craft Supplies',     specs: ['Type','Brand','Condition'] },
    },
  },
  general: {
    label: 'General', icon: '📦',
    subcategories: {
      other: { label: 'Other', specs: ['Type','Brand','Condition'] },
    },
  },
};

const CONDITIONS = ['Brand New', 'Like New', 'Good', 'Fair', 'Parts Only'];

const labelStyle = { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

const EMPTY_FORM = {
  title: '', description: '', price: '',
  category: 'electronics', subcategory: '', location: '',
  images: [], specs: {}, condition: '', isNegotiable: false,
  isFlashSale: false, flashSalePrice: '', flashSaleEndsAt: '', flashSaleQuantity: '',
  contactPhone: '',
};

const SellerClassifieds = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser, editItemId, activeProfileId }) => {
  const { t } = useTranslation();
  const [classifieds, setClassifieds] = useState([]);
  const [classifiedLocation, setClassifiedLocation] = React.useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [message, setMessage]         = useState('');
  const [priceSuggestion, setPriceSuggestion] = useState(null);
  const [loadingPrice,  setLoadingPrice]     = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [userPhone, setUserPhone]     = useState('');

  // Derived
  const currentCat  = CLASSIFIED_CATEGORIES[form.category] || CLASSIFIED_CATEGORIES.general;
  const subOptions  = Object.entries(currentCat.subcategories);
  const currentSub  = currentCat.subcategories[form.subcategory];
  const specFields  = currentSub?.specs || [];

  // Pre-fill location from seller's stored businessLocation
  React.useEffect(() => {
    if (!currentUser?.businessLocation && !currentUser?.businessDistrict) return;
    setForm(prev => ({
      ...prev,
      location: prev.location || currentUser.businessLocation || 
                [currentUser.businessDistrict, currentUser.businessRegion].filter(Boolean).join(', ') || '',
    }));
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps


  const fetchPriceSuggestion = useCallback(async (category, title, condition) => {
    if (!category) return;
    try {
      setLoadingPrice(true);
      const params = new URLSearchParams({ category });
      if (title) params.set('title', title);
      if (condition) params.set('condition', condition);
      const res = await api.get(`/classifieds/price-suggestion?${params}`);
      setPriceSuggestion(res.data);
    } catch { setPriceSuggestion(null); }
    finally { setLoadingPrice(false); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchMyClassifieds();
    // Check if user has a phone number — required for classified contact
    api.get('/auth/profile').then(res => setUserPhone(res.data?.phone || '')).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-linked straight into editing one listing (e.g. from its Classified
  // Detail page's ••• menu) — open the edit form the moment it's loaded.
  useEffect(() => {
    if (!editItemId || !classifieds.length) return;
    const match = classifieds.find(c => c.id === Number(editItemId));
    if (match) handleEdit(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classifieds, editItemId]);

  const handleCategoryChange = (cat) => {
    const firstSub = Object.keys(CLASSIFIED_CATEGORIES[cat]?.subcategories || {})[0] || '';
    setForm(prev => ({ ...prev, category: cat, subcategory: firstSub, specs: {} }));
  };

  const handleSubcategoryChange = (sub) => {
    setForm(prev => ({ ...prev, subcategory: sub, specs: {} }));
  };

  const handleSpecChange = (key, value) => {
    setForm(prev => ({ ...prev, specs: { ...prev.specs, [key]: value } }));
  };

  const fetchMyClassifieds = async () => {
    try {
      setLoading(true);
      const res = await api.get('/classifieds/user/mine');
      setClassifieds(res.data);
    } catch { setError(t('seller_classifieds.load_failed')); }
    finally { setLoading(false); }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (form.images.length + files.length > 5) { setError(t('seller_classifieds.max_images')); return; }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
    try {
      setUploading(true);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      const res = await api.post('/upload/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(prev => ({ ...prev, images: [...prev.images, ...res.data.urls] }));
    } catch { setError(t('seller_classifieds.image_upload_failed')); }
    finally { setUploading(false); }
  };

  const removeImage = (i) => {
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
    setForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));
  };

  const resetForm = () => {
    setShowForm(false); setEditItem(null);
    setImagePreviews([]); setForm(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.price) { setError(t('seller_classifieds.title_price_required')); return; }
    try {
      const payload = {
        ...form,
        price:      Number(form.price),
        specs:      Object.keys(form.specs || {}).length > 0 ? form.specs : null,
        subcategory: form.subcategory || null,
        condition:  form.condition || null,
        contactPhone: form.contactPhone || undefined,
      };
      if (editItem) {
        await api.patch(`/classifieds/${editItem.id}`, payload);
        setMessage(t('seller_classifieds.listing_updated'));
      } else {
        // Attributes the listing to whichever profile is active right now
        // (e.g. a personal side-hustle classified stays on the personal
        // profile instead of resolving to a business brand run from the
        // same account) — set once at creation, never changed on edit.
        await api.post('/classifieds', { ...payload, commerceProfileId: activeProfileId || undefined });
        setMessage(t('seller_classifieds.listing_posted'));
      }
      resetForm(); fetchMyClassifieds();
    } catch (err) { setError(err?.response?.data?.message || t('seller_classifieds.save_failed')); }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({
      title:        item.title,
      description:  item.description || '',
      price:        String(item.price),
      category:     item.category || 'electronics',
      subcategory:  item.subcategory || '',
      location:     item.location || '',
      images:       item.images || [],
      specs:        item.specs || {},
      condition:    item.condition || '',
      isNegotiable: item.isNegotiable || false,
      contactPhone: item.contactPhone || '',
    });
    setImagePreviews(item.images || []);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('seller_classifieds.confirm_delete'))) return;
    try { await api.delete(`/classifieds/${id}`); setMessage(t('seller_classifieds.listing_deleted')); fetchMyClassifieds(); }
    catch { setError(t('seller_classifieds.delete_failed')); }
  };

  const handleMarkSold = async (id) => {
    if (!window.confirm(t('seller_classifieds.confirm_mark_sold'))) return;
    try { await api.patch(`/classifieds/${id}/sold`); setMessage(t('seller_classifieds.marked_sold')); fetchMyClassifieds(); }
    catch { setError(t('seller_classifieds.update_failed')); }
  };

  const statusColor = (status) => ({
    active:  { backgroundColor: '#dcfce7', color: '#16a34a' },
    sold:    { backgroundColor: '#fee2e2', color: '#dc2626' },
    expired: { backgroundColor: '#fef9c3', color: '#ca8a04' },
  }[status] || { backgroundColor: '#f1f5f9', color: '#64748b' });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: 90 }}>
      <BackBar onBack={() => onNavigate('back')} title={t('seller_classifieds.page_title')} />
      <div style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', padding: '20px 16px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <button onClick={() => onNavigate('SellerDashboard')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', marginBottom: '10px', fontWeight: '600' }}>{t('seller_classifieds.back_dashboard')}</button>
            <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#fff', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>{t('seller_classifieds.page_title')}</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>{t('seller_classifieds.listings_count', { count: classifieds.length })}</p>
          </div>
          <button onClick={() => {
              if (!userPhone) {
                if (window.confirm(t('seller_classifieds.phone_required_confirm'))) {
                  onNavigate('CustomerProfile');
                }
                return;
              }
              resetForm(); setShowForm(true);
            }} style={{ background: '#fff', color: '#e91e63', border: 'none', padding: '10px 18px', borderRadius: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}>{t('seller_classifieds.post_button')}</button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}><span>✅ {message}</span><button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button></div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}><span>❌ {error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button></div>}

        {/* Phone number warning */}
        {!userPhone && (
          <div style={{ backgroundColor: '#fef9c3', border: '2px solid #fcd34d', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>📞</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>{t('seller_classifieds.phone_warning_title')}</div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>{t('seller_classifieds.phone_warning_desc')}</div>
            </div>
            <button onClick={() => onNavigate('CustomerProfile')}
              style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t('seller_classifieds.add_phone_button')}
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
          {[
            { label: t('seller_classifieds.stat_total'), value: classifieds.length, gradient: 'linear-gradient(135deg,#f093fb,#f5576c)', icon: '📋' },
            { label: t('seller_classifieds.stat_active'), value: classifieds.filter(c => c.status === 'active').length, gradient: 'linear-gradient(135deg,#43e97b,#38f9d7)', icon: '✅' },
            { label: t('seller_classifieds.stat_sold'), value: classifieds.filter(c => c.status === 'sold').length, gradient: 'linear-gradient(135deg,#667eea,#764ba2)', icon: '🏷️' },
          ].map(s => (
            <div key={s.label} style={{ background: s.gradient, borderRadius: 12, padding: '14px 8px', color: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{s.value}</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}><div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div><p>{t('seller_classifieds.loading')}</p></div>
        ) : classifieds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
            <h3 style={{ color: '#1e293b', marginBottom: 8 }}>{t('seller_classifieds.no_listings_title')}</h3>
            <p style={{ color: '#64748b', marginBottom: 24 }}>{t('seller_classifieds.no_listings_desc')}</p>
            <button onClick={() => {
                if (!userPhone) {
                  if (window.confirm(t('seller_classifieds.phone_required_confirm'))) {
                    onNavigate('CustomerProfile');
                  }
                  return;
                }
                resetForm(); setShowForm(true);
              }} style={{ background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>{t('seller_classifieds.post_first_listing')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {classifieds.map(item => (
              <div key={item.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ height: 180, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {item.images?.[0] ? <img src={item.images[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 48 }}>📋</span>}
                  <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, ...statusColor(item.status) }}>{item.status?.toUpperCase()}</span>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff' }}>
                      {CLASSIFIED_CATEGORIES[item.category]?.icon} {item.category?.replace(/_/g,' ')}
                    </span>
                    {item.subcategory && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                        {CLASSIFIED_CATEGORIES[item.category]?.subcategories?.[item.subcategory]?.label || item.subcategory}
                      </span>
                    )}
                    {item.condition && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>{item.condition}</span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>{item.title}</h3>
                  {item.specs && Object.keys(item.specs).length > 0 && (
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                      {Object.entries(item.specs).slice(0,2).map(([k,v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: '#e91e63' }}>TZS {Number(item.price).toLocaleString()}</span>
                    {item.isNegotiable && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{t('seller_classifieds.negotiable_badge')}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => onNavigate(`ClassifiedDetail-${item.id}`)} style={{ flex: 1, backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{t('seller_classifieds.view_button')}</button>
                    {item.status === 'active' && <>
                      <button onClick={() => handleEdit(item)} style={{ flex: 1, backgroundColor: '#dbeafe', color: '#2563eb', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{t('seller_classifieds.edit_button')}</button>
                      <button onClick={() => handleMarkSold(item.id)} style={{ flex: 1, backgroundColor: '#dcfce7', color: '#16a34a', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{t('seller_classifieds.sold_button')}</button>
                    </>}
                    <button onClick={() => handleDelete(item.id)} style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── POST/EDIT MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 32px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '20px 16px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 18px' }}>
              {editItem ? t('seller_classifieds.modal_edit_title') : t('seller_classifieds.modal_new_title')}
            </h2>

            {/* Images */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('seller_classifieds.photos_label')}</label>
              {imagePreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {imagePreviews.map((p, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={p} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '2px solid #e2e8f0' }} />
                      <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {imagePreviews.length < 5 && (
                <div style={{ border: '2px dashed #e2e8f0', borderRadius: 8, padding: 12, textAlign: 'center', backgroundColor: '#f8fafc' }}>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} id="classifiedImages" />
                  <label htmlFor="classifiedImages" style={{ background: 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    {uploading ? t('seller_classifieds.uploading') : t('seller_classifieds.choose_photos')}
                  </label>
                  <p style={{ color: '#94a3b8', fontSize: 11, margin: '6px 0 0' }}>{t('seller_classifieds.photos_count_hint', { count: imagePreviews.length })}</p>
                </div>
              )}
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('seller_classifieds.title_label')}</label>
              <input type="text" placeholder={t('seller_classifieds.title_placeholder')} value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            </div>

            {/* Category + Subcategory */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t('seller_classifieds.category_label')}</label>
                <select value={form.category} onChange={e => handleCategoryChange(e.target.value)} style={inputStyle}>
                  {Object.entries(CLASSIFIED_CATEGORIES).map(([key, cat]) => (
                    <option key={key} value={key}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('seller_classifieds.subcategory_label')}</label>
                <select value={form.subcategory} onChange={e => handleSubcategoryChange(e.target.value)} style={inputStyle}>
                  <option value="">{t('seller_classifieds.select_subcategory')}</option>
                  {subOptions.map(([key, sub]) => (
                    <option key={key} value={key}>{sub.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('seller_classifieds.description_label')}</label>
              <textarea placeholder={t('seller_classifieds.description_placeholder')} value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            </div>

            {/* ── DYNAMIC SPEC FIELDS ── */}
            {specFields.length > 0 && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                  {t('seller_classifieds.listing_details_title')}
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 8 }}>{t('seller_classifieds.listing_details_hint')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {specFields.map(spec => (
                    <div key={spec}>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>{spec}</label>
                      <input type="text" placeholder={
                        spec === 'Make' ? 'e.g. Toyota' :
                        spec === 'Model' ? 'e.g. Land Cruiser' :
                        spec === 'Year' ? 'e.g. 2019' :
                        spec === 'Mileage (km)' ? 'e.g. 45,000' :
                        spec === 'Bedrooms' ? 'e.g. 3' :
                        spec === 'Condition' ? 'Good / Like New' :
                        spec === 'Color' ? 'e.g. White' : '...'
                      }
                        value={form.specs?.[spec] || ''}
                        onChange={e => handleSpecChange(spec, e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Condition + Negotiable */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t('seller_classifieds.condition_label')}</label>
                <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} style={inputStyle}>
                  <option value="">{t('seller_classifieds.select_condition')}</option>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, border: '2px solid #e2e8f0', height: 40, boxSizing: 'border-box' }}>
                  <input type="checkbox" id="isNeg" checked={form.isNegotiable} onChange={e => setForm({ ...form, isNegotiable: e.target.checked })} style={{ width: 14, height: 14 }} />
                  <label htmlFor="isNeg" style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>{t('seller_classifieds.price_negotiable_label')}</label>
                </div>
              </div>
            {/* Flash Sale toggle */}
            <div style={{ backgroundColor:'#FFF5F5', border:'1.5px solid #FCA5A5', borderRadius:12, padding:14, marginTop:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="checkbox" id="isFlash"
                  checked={form.isFlashSale}
                  onChange={e => setForm({ ...form, isFlashSale: e.target.checked })}
                  style={{ width:16, height:16, cursor:'pointer' }} />
                <label htmlFor="isFlash" style={{ fontSize:13, fontWeight:800,
                  color:'#DC2626', cursor:'pointer' }}>{t('seller_classifieds.flash_sale_label')}</label>
              </div>
              {form.isFlashSale && (
                <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>
                      {t('seller_classifieds.flash_sale_price_label')}
                    </label>
                    <input type="number"
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10,
                        border:'1.5px solid #FCA5A5', fontSize:15, fontWeight:900,
                        color:'#DC2626', outline:'none', boxSizing:'border-box' }}
                      placeholder={t('seller_classifieds.flash_sale_price_placeholder')}
                      value={form.flashSalePrice}
                      onChange={e => setForm({ ...form, flashSalePrice: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>
                      {t('seller_classifieds.flash_sale_ends_label')}
                    </label>
                    <input type="datetime-local"
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10,
                        border:'1.5px solid #FCA5A5', fontSize:13, outline:'none', boxSizing:'border-box' }}
                      value={form.flashSaleEndsAt}
                      onChange={e => setForm({ ...form, flashSaleEndsAt: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:'#64748B', display:'block', marginBottom:4 }}>
                      {t('seller_classifieds.flash_sale_qty_label')}
                    </label>
                    <input type="number"
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10,
                        border:'1.5px solid #FCA5A5', fontSize:13, outline:'none', boxSizing:'border-box' }}
                      placeholder={t('seller_classifieds.flash_sale_qty_placeholder')}
                      value={form.flashSaleQuantity}
                      onChange={e => setForm({ ...form, flashSaleQuantity: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* Price + Location */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>{t('seller_classifieds.price_label')}</label>
                <input type="number" placeholder={t('seller_classifieds.price_placeholder')} value={form.price}
                  onChange={e => setForm({ ...form, price: e.target.value })}
                  onFocus={() => fetchPriceSuggestion(form.category, form.title, form.condition)}
                  style={inputStyle} />
                {/* Price suggestion widget */}
                {(priceSuggestion || loadingPrice) && (
                  <div style={{ marginTop: 8, backgroundColor: '#eff6ff', borderRadius: 10, padding: '10px 14px', border: '1px solid #bfdbfe' }}>
                    {loadingPrice ? (
                      <div style={{ fontSize: 12, color: '#64748b' }}>{t('seller_classifieds.searching_market_prices')}</div>
                    ) : priceSuggestion && priceSuggestion.sampleSize > 0 ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>{t('seller_classifieds.price_suggestion_title')}</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          {[
                            { label: t('seller_classifieds.price_low'),   value: priceSuggestion.low,  color: '#16a34a' },
                            { label: t('seller_classifieds.price_fair'), value: priceSuggestion.fair, color: '#1d4ed8' },
                            { label: t('seller_classifieds.price_high'),     value: priceSuggestion.high, color: '#7c3aed' },
                          ].map(r => (
                            <button key={r.label} onClick={() => setForm(f => ({ ...f, price: String(r.value) }))}
                              style={{ flex: 1, backgroundColor: '#fff', border: `1px solid ${r.color}`,
                                borderRadius: 8, padding: '6px 0', cursor: 'pointer', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: r.color, fontWeight: 700 }}>{r.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 900, color: r.color }}>TZS {Number(r.value).toLocaleString()}</div>
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#475569' }}>{priceSuggestion.insights?.[0]}</div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                  <label style={labelStyle}>{t('seller_classifieds.location_label')}</label>
                  <LocationPicker
                    value={classifiedLocation}
                    onChange={loc => {
                      setClassifiedLocation(loc);
                      setForm(prev => ({
                        ...prev,
                        location: [loc.wardName, loc.districtName, loc.regionName].filter(Boolean).join(', '),
                      }));
                    }}
                  />
                  {form.location && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✅ {form.location}</div>
                  )}
              </div>
            </div>

            {/* Optional contact override — a side-hustle listing posted
                from a personal profile often needs a different number
                than the account's main contact; leave blank to use the
                account phone as before. */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('seller_classifieds.contact_phone_label')}</label>
              <input type="tel" placeholder={userPhone || t('seller_classifieds.contact_phone_placeholder')}
                value={form.contactPhone}
                onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                style={inputStyle} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{t('seller_classifieds.contact_phone_hint')}</div>
            </div>
            <div style={{ height: 16 }} />
          </div>

          {/* Sticky footer — always visible, never scrolls out of view or
              hides behind the bottom nav, regardless of form length */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 10,
            padding: '12px 16px max(12px, env(safe-area-inset-bottom))',
            borderTop: '1px solid #f1f5f9', backgroundColor: '#fff' }}>
              <button onClick={resetForm} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t('seller_classifieds.cancel_button')}</button>
              <button onClick={handleSubmit} disabled={uploading}
                style={{ flex: 2, background: uploading ? '#f48fb1' : 'linear-gradient(135deg,#f093fb,#f5576c)', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                {uploading ? t('seller_classifieds.please_wait') : editItem ? t('seller_classifieds.update_listing_button') : t('seller_classifieds.post_listing_button')}
              </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
};

export default SellerClassifieds;