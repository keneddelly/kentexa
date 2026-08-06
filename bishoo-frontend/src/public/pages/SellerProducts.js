import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import BackBar from '../components/BackBar';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';

const TZ_CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Dodoma','Mbeya','Tanga','Zanzibar',
  'Morogoro','Kigoma','Songea','Tabora','Shinyanga','Iringa','Lindi',
  'Mtwara','Musoma','Bukoba','Sumbawanga','Singida','Babati','Kibaha',
  'Kilosa','Njombe','Kasulu','Mpanda','Masasi','Korogwe','Moshi',
];

// ── Full category → subcategory → spec fields structure ──────────────────────
const CATEGORIES = {
  electronics: {
    label: 'Electronics', icon: '📱',
    subcategories: {
      hidden_cameras:    { label: 'Zimefichwa Cameras',     specs: ['Resolution','Night Vision','WiFi','Battery Life','Storage','Motion Detection','Dimensions','Weight'] },
      voice_recorders:   { label: 'Voice Recorders',    specs: ['Battery Life','Storage','Microphone Range','VOX Mode','File Format','Dimensions'] },
      gps_trackers:      { label: 'GPS Trackers',       specs: ['Network Support','Battery Life','Update Interval','Waterproof','SIM Required','Dimensions'] },
      smartphones:       { label: 'Smartphones',        specs: ['Brand','RAM','Internal Storage','Camera','Battery','OS','Screen Size','Color'] },
      laptops:           { label: 'Laptops',            specs: ['Brand','Processor','RAM','Storage','Screen Size','OS','Battery','Color'] },
      tvs:               { label: 'TVs & Displays',     specs: ['Screen Size','Resolution','Smart TV','HDMI Ports','Brand','Refresh Rate'] },
      audio:             { label: 'Audio & Sound',      specs: ['Type','Connectivity','Battery Life','Brand','Frequency Response'] },
      accessories:       { label: 'Accessories',        specs: ['Compatible With','Material','Color','Brand'] },
      other_electronics: { label: 'Other Electronics',  specs: ['Brand','Model','Condition'] },
    },
  },
  fashion: {
    label: 'Fashion', icon: '👗',
    subcategories: {
      mens_clothing:   { label: "Men's Clothing",    specs: ['Size','Material','Color','Brand','Occasion'] },
      womens_clothing: { label: "Women's Clothing",  specs: ['Size','Material','Color','Brand','Occasion'] },
      kids_clothing:   { label: "Kids' Clothing",    specs: ['Age Range','Size','Material','Color','Gender'] },
      shoes:           { label: 'Shoes',             specs: ['Size (EU/UK)','Material','Color','Gender','Brand','Sole Material'] },
      bags:            { label: 'Bags & Handbags',   specs: ['Material','Color','Dimensions','Brand','Closure Type'] },
      watches:         { label: 'Watches',           specs: ['Brand','Movement Type','Water Resistance','Strap Material','Case Size'] },
      jewelry:         { label: 'Jewelry',           specs: ['Material','Color','Size','Brand','Occasion'] },
    },
  },
  home_garden: {
    label: 'Home & Garden', icon: '🏠',
    subcategories: {
      furniture:    { label: 'Furniture',          specs: ['Material','Dimensions','Color','Weight Capacity','Assembly Required'] },
      bedding:      { label: 'Bedding & Pillows',  specs: ['Size','Material','Color','Thread Count'] },
      kitchen:      { label: 'Kitchen & Dining',   specs: ['Material','Capacity','Brand','Dishwasher Safe'] },
      appliances:   { label: 'Home Appliances',    specs: ['Brand','Power (W)','Voltage','Dimensions','Weight','Warranty'] },
      garden:       { label: 'Garden & Outdoor',   specs: ['Material','Dimensions','Color','Weatherproof'] },
      cleaning:     { label: 'Cleaning Supplies',  specs: ['Type','Volume','Scent','Concentrated'] },
    },
  },
  health_beauty: {
    label: 'Health & Beauty', icon: '💄',
    subcategories: {
      skincare:    { label: 'Skincare',           specs: ['Skin Type','Volume (ml)','Brand','Key Ingredients','SPF'] },
      haircare:    { label: 'Hair Care',          specs: ['Hair Type','Volume (ml)','Brand','Key Ingredients'] },
      cosmetics:   { label: 'Cosmetics',          specs: ['Shade','Brand','Volume/Weight','Finish'] },
      supplements: { label: 'Health Supplements', specs: ['Type','Quantity','Brand','Expiry Date','Dosage'] },
      medical:     { label: 'Medical Equipment',  specs: ['Brand','Model','Certification','Power Source'] },
    },
  },
  food: {
    label: 'Food & Beverages', icon: '🍎',
    subcategories: {
      fresh_food: { label: 'Fresh Food',      specs: ['Weight (kg)','Origin','Expiry Date','Organic'] },
      packaged:   { label: 'Packaged Food',   specs: ['Weight','Brand','Expiry Date','Ingredients','Allergens'] },
      beverages:  { label: 'Beverages',       specs: ['Volume (ml)','Brand','Type','Flavour'] },
      spices:     { label: 'Spices & Herbs',  specs: ['Weight','Origin','Brand','Organic'] },
    },
  },
  baby_kids: {
    label: 'Baby & Kids', icon: '🧸',
    subcategories: {
      toys:      { label: 'Toys & Games',    specs: ['Age Range','Material','Brand','Safety Certified','Battery Required'] },
      baby_care: { label: 'Baby Care',       specs: ['Age Range','Volume/Weight','Brand','Ingredients'] },
      school:    { label: 'School Supplies', specs: ['Grade Level','Brand','Quantity','Color'] },
    },
  },
  sports: {
    label: 'Sports & Fitness', icon: '⚽',
    subcategories: {
      gym:        { label: 'Gym Equipment', specs: ['Weight Capacity','Material','Dimensions','Brand','Weight (kg)'] },
      outdoor:    { label: 'Outdoor Sports', specs: ['Material','Size','Brand','Waterproof'] },
      sportswear: { label: 'Sportswear',    specs: ['Size','Material','Color','Gender','Brand'] },
      cycling:    { label: 'Cycling',       specs: ['Frame Size','Material','Gears','Brand','Wheel Size'] },
    },
  },
  agriculture: {
    label: 'Agriculture', icon: '🌾',
    subcategories: {
      seeds:       { label: 'Seeds & Seedlings', specs: ['Crop Type','Weight','Planting Season','Origin','Germination Rate'] },
      tools:       { label: 'Farming Tools',     specs: ['Material','Brand','Dimensions','Weight'] },
      fertilizers: { label: 'Fertilizers',       specs: ['Type','Weight (kg)','NPK Ratio','Organic','Application Method'] },
      livestock:   { label: 'Livestock Products', specs: ['Type','Quantity','Origin','Breed'] },
    },
  },
  security: {
    label: 'Security', icon: '🔒',
    subcategories: {
      cctv:    { label: 'CCTV Cameras',    specs: ['Resolution','Night Vision','Indoor/Outdoor','Storage','Brand','Power Source','Viewing Angle'] },
      alarms:  { label: 'Alarm Systems',   specs: ['Type','Coverage Area','Brand','Power Source','GSM Compatible'] },
      access:  { label: 'Access Control',  specs: ['Type','Brand','User Capacity','Connectivity'] },
      safes:   { label: 'Safes & Locks',   specs: ['Material','Dimensions','Lock Type','Brand','Fire Resistant'] },
    },
  },
  vehicles: {
    label: 'Vehicles & Parts', icon: '🚗',
    subcategories: {
      cars:        { label: 'Cars',               specs: ['Make','Model','Year','Mileage (km)','Fuel Type','Transmission','Color','Engine (cc)','Condition'] },
      motorcycles: { label: 'Motorcycles',        specs: ['Make','Model','Year','Engine (cc)','Color','Mileage (km)','Condition'] },
      spare_parts: { label: 'Spare Parts',        specs: ['Compatible With','Part Number','Brand','Condition','OEM/Aftermarket'] },
      accessories: { label: 'Vehicle Accessories', specs: ['Compatible With','Material','Color','Brand'] },
    },
  },
  books: {
    label: 'Books & Education', icon: '📚',
    subcategories: {
      textbooks:  { label: 'Textbooks',        specs: ['Subject','Grade/Level','Author','Publisher','Edition','Language','Condition'] },
      fiction:    { label: 'Fiction & Novels', specs: ['Author','Publisher','Language','Pages','Genre','Condition'] },
      stationery: { label: 'Stationery',       specs: ['Type','Brand','Quantity','Color'] },
    },
  },
  arts: {
    label: 'Arts & Crafts', icon: '🎨',
    subcategories: {
      paintings: { label: 'Paintings & Art',     specs: ['Medium','Dimensions','Style','Framed','Artist'] },
      crafts:    { label: 'Craft Supplies',      specs: ['Type','Brand','Quantity','Material'] },
      music:     { label: 'Musical Instruments', specs: ['Type','Brand','Material','Condition','Key/Tuning'] },
    },
  },
  general: {
    label: 'General', icon: '📦',
    subcategories: {
      other: { label: 'Other', specs: ['Brand','Model','Condition','Color'] },
    },
  },
};

const labelStyle = { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

const EMPTY_FORM = {
  name: '', description: '', basePrice: '', deliveryFee: '0', bodaFee: '0', sellerCity: 'Dar es Salaam',
  displayPrice: 0, stock: '', category: 'electronics', subcategory: '', model: '',
  specs: {}, features: [], images: [], isAvailable: true, weightKg: '',
  isFlashSale: false, flashSalePrice: '', flashSaleEndsAt: '', flashSaleQuantity: '',
};

const SellerProducts = ({ onNavigate, isLoggedIn, onLogout, userRole, editProductId }) => {
  const { t } = useTranslation();
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [message, setMessage]         = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [shippingEstimate, setShippingEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading]   = useState(false);

  // Boda fee suggestions
  const [bodaSuggestions, setBodaSuggestions]   = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const fetchBodaSuggestions = async () => {
    try {
      setLoadingSuggestions(true);
      const res = await api.get(`/daily-batches/boda-fee-suggestions?sellerAddress=${encodeURIComponent(form.sellerCity || 'Kariakoo')}`);
      setBodaSuggestions(res.data.suggestions || []);
    } catch { setBodaSuggestions([]); }
    finally { setLoadingSuggestions(false); }
  };
  const [originCity, setOriginCity]             = useState('');
  const [featureInput, setFeatureInput]         = useState('');

  // Derived: current subcategory options + spec fields
  const currentCat    = CATEGORIES[form.category] || CATEGORIES.general;
  const subOptions    = Object.entries(currentCat.subcategories);
  const currentSub    = currentCat.subcategories[form.subcategory];
  const specFields    = currentSub?.specs || [];

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { onNavigate('PublicLogin'); return; }
    fetchMyProducts();
    const saved = localStorage.getItem('sellerOriginCity');
    if (saved) setOriginCity(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-linked straight into editing one product (e.g. from its Product
  // Detail page's ••• menu) — open the edit form the moment it's loaded.
  useEffect(() => {
    if (!editProductId || !products.length) return;
    const match = products.find(p => p.id === Number(editProductId));
    if (match) handleEdit(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, editProductId]);

  // When category changes, reset subcategory + specs
  const handleCategoryChange = (cat) => {
    const firstSub = Object.keys(CATEGORIES[cat]?.subcategories || {})[0] || '';
    setForm(prev => ({ ...prev, category: cat, subcategory: firstSub, specs: {} }));
  };

  const handleSubcategoryChange = (sub) => {
    setForm(prev => ({ ...prev, subcategory: sub, specs: {} }));
  };

  const handleSpecChange = (key, value) => {
    setForm(prev => ({ ...prev, specs: { ...prev.specs, [key]: value } }));
  };

  const addFeature = () => {
    if (!featureInput.trim()) return;
    setForm(prev => ({ ...prev, features: [...(prev.features || []), featureInput.trim()] }));
    setFeatureInput('');
  };

  const removeFeature = (i) => {
    setForm(prev => ({ ...prev, features: prev.features.filter((_, idx) => idx !== i) }));
  };

  const handleOriginCityChange = (city) => {
    setOriginCity(city);
    localStorage.setItem('sellerOriginCity', city);
    if (form.weightKg) fetchShippingEstimate(form.weightKg, city);
  };

  const fetchShippingEstimate = async (weight, cityOverride) => {
    const city = cityOverride || originCity;
    if (!weight || Number(weight) <= 0 || !city) { setShippingEstimate(null); return; }
    try {
      setEstimateLoading(true);
      const res = await api.get(`/super-agents/estimate-shipping?originCity=${encodeURIComponent(city)}&weightKg=${weight}`);
      setShippingEstimate(res.data);
    } catch { setShippingEstimate(null); }
    finally { setEstimateLoading(false); }
  };

  const fetchMyProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/products/my/products');
      setProducts(res.data);
    } catch { setError(t('seller_products.load_failed')); }
    finally { setLoading(false); }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (form.images.length + files.length > 5) { setError(t('seller_products.max_images')); return; }
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
    } catch { setError(t('seller_products.image_upload_failed')); }
    finally { setUploading(false); }
  };

  const removeImage = (i) => {
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
    setForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));
  };

  const resetForm = () => {
    setShowForm(false); setEditProduct(null);
    setImagePreviews([]); setForm(EMPTY_FORM);
    setFeatureInput(''); setShippingEstimate(null);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.basePrice || !form.stock) { setError(t('seller_products.name_required')); return; }
    try {
      const base = Number(form.basePrice) || 0;
      const delivery = Number(form.deliveryFee) || 0;
      const payload = {
        name:         form.name,
        description:  form.description,
        category:     form.category,
        subcategory:  form.subcategory,
        model:        form.model,
        isAvailable:  form.isAvailable,
        shippingMethod: form.shippingMethod,
        estimatedDelivery: form.estimatedDelivery,
        shippingNotes: form.shippingNotes,
        images:       form.images,
        basePrice:    base,
        deliveryFee:  delivery,
        bodaFee:      Number(form.bodaFee) || 0,
        sellerCity:   form.sellerCity || 'Dar es Salaam',
        displayPrice: base + delivery,
        price:        base + delivery,
        stock:        Number(form.stock),
        weightKg:     form.weightKg ? Number(form.weightKg) : null,
        specs:        Object.keys(form.specs || {}).length > 0 ? form.specs : null,
        features:     form.features?.length > 0 ? form.features : null,
        isFlashSale:  form.isFlashSale,
        originalPrice: form.isFlashSale ? base + delivery : undefined,
        flashSalePrice: form.isFlashSale && form.flashSalePrice
          ? Number(form.flashSalePrice) : undefined,
        flashSaleEndsAt: form.isFlashSale && form.flashSaleEndsAt
          ? new Date(form.flashSaleEndsAt).toISOString() : undefined,
        flashSaleQuantity: form.isFlashSale && form.flashSaleQuantity
          ? Number(form.flashSaleQuantity) : undefined,
      };
      if (editProduct) {
        await api.patch(`/products/${editProduct.id}`, payload);
        setMessage(t('seller_products.updated'));
      } else {
        await api.post('/products', payload);
        setMessage(t('seller_products.added'));
      }
      resetForm(); fetchMyProducts();
    } catch (err) {
      setError(err?.response?.data?.message || t('seller_products.save_failed'));
    }
  };

  const handleEdit = (product) => {
    setEditProduct(product);
    setForm({
      name:         product.name,
      description:  product.description || '',
      basePrice:    String(product.basePrice || product.price || ''),
      deliveryFee:  String(product.deliveryFee || '0'),
      bodaFee:      String(product.bodaFee || '0'),
      sellerCity:   product.sellerCity || 'Dar es Salaam',
      displayPrice: Number(product.displayPrice || product.price || 0),
      stock:        String(product.stock),
      category:     product.category || 'electronics',
      subcategory:  product.subcategory || '',
      model:        product.model || '',
      specs:        product.specs || {},
      features:     product.features || [],
      images:       product.images || [],
      isAvailable:  product.isAvailable,
      weightKg:     product.weightKg ? String(product.weightKg) : '',
      isFlashSale:  product.isFlashSale || false,
      flashSalePrice: product.flashSalePrice ? String(product.flashSalePrice) : '',
      flashSaleEndsAt: product.flashSaleEndsAt ? product.flashSaleEndsAt.slice(0, 16) : '',
      flashSaleQuantity: product.flashSaleQuantity ? String(product.flashSaleQuantity) : '',
    });
    setImagePreviews(product.images || []);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('seller_products.delete_confirm'))) return;
    try { await api.delete(`/products/${id}`); setMessage(t('seller_products.deleted')); fetchMyProducts(); }
    catch { setError(t('seller_products.delete_failed')); }
  };

  const handleToggleZipo = async (product) => {
    try {
      await api.patch(`/products/${product.id}`, { isAvailable: !product.isAvailable });
      setMessage(!product.isAvailable ? t('seller_products.marked_available') : t('seller_products.marked_unavailable'));
      fetchMyProducts();
    } catch { setError(t('seller_products.update_failed')); }
  };

  const updatePrices = (field, value) => {
    const base     = field === 'basePrice'   ? Number(value) || 0 : Number(form.basePrice)   || 0;
    const delivery = field === 'deliveryFee' ? Number(value) || 0 : Number(form.deliveryFee) || 0;
    setForm(prev => ({ ...prev, [field]: value, displayPrice: base + delivery }));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="SellerProducts" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      <BackBar onBack={() => onNavigate('back')} title={`📦 ${t('seller_products.title')}`} />
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '20px 16px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <button onClick={() => onNavigate('SellerDashboard')} style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, marginBottom: 10 }}>{t('seller_products.back')}</button>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>{t('seller_products.title')}</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>{t('seller_products.products_in_store', { count: products.length })}</p>
          </div>
          <button onClick={() => { resetForm(); setShowForm(true); }} style={{ background: '#fff', color: '#1d4ed8', border: 'none', padding: '10px 18px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            {`+ ${t('seller_products.add')}`}
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 32px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && <div style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>✅ {message}</span><button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 'bold' }}>×</button></div>}
        {error   && <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>❌ {error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button></div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: t('seller_products.total'), value: products.length, bg: '#ede9fe', color: '#7c3aed', icon: '📦' },
            { label: t('seller_products.available'), value: products.filter(p => p.isAvailable).length, bg: '#dcfce7', color: '#16a34a', icon: '✅' },
            { label: t('seller_products.hidden'), value: products.filter(p => !p.isAvailable).length, bg: '#fee2e2', color: '#dc2626', icon: '❌' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 14, padding: '16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 24 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>{t('seller_products.loading')}</div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📦</div>
            <h3 style={{ color: '#1e293b', marginBottom: 8 }}>{t('seller_products.no_products')}</h3>
            <p style={{ color: '#64748b', marginBottom: 24 }}>{t('seller_products.no_products_desc')}</p>
            <button onClick={() => { resetForm(); setShowForm(true); }} style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>{`+ ${t('seller_products.add_first')}`}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {products.map(product => (
              <div key={product.id} style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ height: 160, backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {product.images?.[0] ? <img src={product.images[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 48 }}>📦</span>}
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, backgroundColor: product.isAvailable ? '#dcfce7' : '#fee2e2', color: product.isAvailable ? '#16a34a' : '#dc2626' }}>
                    {product.isAvailable ? `✅ ${t('seller_products.on_sale')}` : t('seller_products.hidden_badge')}
                  </span>
                  {product.isFlashSale && (
                    <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 10, backgroundColor: '#DC2626', color: '#fff' }}>
                      🔥 {t('seller_products.flash_sale_badge')}
                    </span>
                  )}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                      {CATEGORIES[product.category]?.icon} {product.category?.replace(/_/g,' ')}
                    </span>
                    {product.subcategory && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                        {CATEGORIES[product.category]?.subcategories[product.subcategory]?.label || product.subcategory}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>{product.name}</h3>
                  {product.model && (
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                      {t('seller_products.model_label')}: {product.model}
                    </div>
                  )}
                  {product.isFlashSale && product.flashSalePrice ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: '#DC2626' }}>
                        TZS {Number(product.flashSalePrice).toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>
                        TZS {Number(product.originalPrice || product.displayPrice || product.price || 0).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#1d4ed8', marginBottom: 4 }}>
                      TZS {Number(product.displayPrice || product.price || 0).toLocaleString()}
                    </div>
                  )}
                  {product.specs && Object.keys(product.specs).length > 0 && (
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>
                      {Object.entries(product.specs).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>{t('seller_products.stock_label', { count: product.stock })}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleEdit(product)} style={{ flex: 1, backgroundColor: '#ede9fe', color: '#7c3aed', border: 'none', padding: '7px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{`✏️ ${t('seller_products.edit')}`}</button>
                    <button onClick={() => handleToggleZipo(product)} style={{ flex: 1, backgroundColor: product.isAvailable ? '#fee2e2' : '#dcfce7', color: product.isAvailable ? '#dc2626' : '#16a34a', border: 'none', padding: '7px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      {product.isAvailable ? `🚫 ${t('seller_products.hide')}` : `✅ ${t('seller_products.show')}`}
                    </button>
                    <button onClick={() => handleDelete(product.id)} style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ADD/EDIT MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 32px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '20px 16px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1e293b', margin: '0 0 18px', fontFamily: 'Manrope,sans-serif' }}>
              {editProduct ? `✏️ ${t('seller_products.edit_modal_title')}` : `+ ${t('seller_products.add_modal_title')}`}
            </h2>

            {/* Images */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('seller_products.images')}</label>
              {imagePreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {imagePreviews.map((preview, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '2px solid #e2e8f0' }} />
                      <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {imagePreviews.length < 5 && (
                <div style={{ border: '2px dashed #e2e8f0', borderRadius: 8, padding: 12, textAlign: 'center', backgroundColor: '#f8fafc' }}>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} id="productImages" />
                  <label htmlFor="productImages" style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    {uploading ? `⏳ ${t('seller_products.uploading')}` : `📷 ${t('seller_products.choose_images')}`}
                  </label>
                  <p style={{ color: '#94a3b8', fontSize: 11, margin: '6px 0 0' }}>{imagePreviews.length}/5 · {t('seller_products.first_image')}</p>
                </div>
              )}
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('seller_products.product_name')} *</label>
              <input type="text" placeholder={t('seller_products.name_placeholder')} value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            </div>

            {/* Category + Subcategory */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t('seller_products.category')}</label>
                <select value={form.category} onChange={e => handleCategoryChange(e.target.value)} style={inputStyle}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <option key={key} value={key}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('seller_products.subcategory')}</label>
                <select value={form.subcategory} onChange={e => handleSubcategoryChange(e.target.value)} style={inputStyle}>
                  <option value="">{t('seller_products.select_subcategory')}</option>
                  {subOptions.map(([key, sub]) => (
                    <option key={key} value={key}>{sub.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('seller_products.model_label')}</label>
              <input type="text" placeholder={t('seller_products.model_placeholder')} value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })} style={inputStyle} />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('seller_products.description')}</label>
              <textarea placeholder={t('seller_products.description_placeholder')} value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            </div>

            {/* ── DYNAMIC SPEC FIELDS ── */}
            {specFields.length > 0 && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>
                  {`📋 ${t('seller_products.specs')}`}
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 8 }}>{t('seller_products.specs_hint')}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {specFields.map(spec => (
                    <div key={spec}>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>{spec}</label>
                      <input type="text" placeholder={`e.g. ${
                        spec === 'Resolution' ? '1080P Full HD' :
                        spec === 'Battery Life' ? '2 hours' :
                        spec === 'Storage' ? '128GB microSD' :
                        spec === 'Night Vision' ? 'Up to 5 metres' :
                        spec === 'Brand' ? 'Your brand name' :
                        spec === 'Color' ? 'Black' :
                        spec === 'Size' ? 'Medium / L / XL' : '...'
                      }`}
                        value={form.specs?.[spec] || ''}
                        onChange={e => handleSpecChange(spec, e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FEATURES (bullet points) ── */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                {`✨ ${t('seller_products.features')}`}
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 8 }}>{t('seller_products.features_hint')}</span>
              </div>
              {(form.features || []).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, backgroundColor: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 12, flex: 1, color: '#1e293b' }}>✓ {f}</span>
                  <button onClick={() => removeFeature(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14, fontWeight: 900 }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder={t('seller_products.feature_placeholder')}
                  value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFeature()}
                  style={{ ...inputStyle, flex: 1, padding: '8px 10px', fontSize: 12 }} />
                <button onClick={addFeature} style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{`+ ${t('seller_products.add_feature')}`}</button>
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>{t('seller_products.feature_hint')}</p>
            </div>

            {/* Price fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>{t('seller_products.price')} *</label>
                <input type="number" placeholder="e.g. 90000" value={form.basePrice}
                  onChange={e => updatePrices('basePrice', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t('seller_products.stock')} *</label>
                <input type="number" placeholder="e.g. 10" value={form.stock}
                  onChange={e => setForm({ ...form, stock: e.target.value })} style={inputStyle} />
              </div>
            </div>

            {/* Flash Sale toggle */}
            <div style={{ backgroundColor:'#FFF5F5', border:'1.5px solid #FCA5A5', borderRadius:12, padding:14, marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="checkbox" id="prodIsFlash"
                  checked={form.isFlashSale}
                  onChange={e => setForm({ ...form, isFlashSale: e.target.checked })}
                  style={{ width:16, height:16, cursor:'pointer' }} />
                <label htmlFor="prodIsFlash" style={{ fontSize:13, fontWeight:800,
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

            {/* Shipping calculator */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>{`📦 ${t('seller_products.shipping_calc')}`}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>{t('seller_products.your_city')}</label>
                  <select value={originCity} onChange={e => handleOriginCityChange(e.target.value)} style={inputStyle}>
                    {/* */}<option value="">{t('seller_products.select_city')}</option>
                    {TZ_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('seller_products.weight')}</label>
                  <input type="number" placeholder="e.g. 0.5" value={form.weightKg}
                    onChange={e => { setForm({ ...form, weightKg: e.target.value }); fetchShippingEstimate(e.target.value); }}
                    style={inputStyle} />
                </div>
              </div>

              {estimateLoading && <div style={{ fontSize: 11, color: '#94a3b8' }}>{`⏳ ${t('seller_products.estimating')}`}</div>}
              {shippingEstimate && !shippingEstimate.available && <div style={{ fontSize: 11, color: '#94a3b8' }}>{shippingEstimate.message}</div>}
              {shippingEstimate?.available && (
                <div style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: '#1d4ed8' }}>
                    {t('seller_products.suggested_label')} <strong>TZS {shippingEstimate.min.toLocaleString()} – {shippingEstimate.max.toLocaleString()}</strong>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{shippingEstimate.routeCount} {t('seller_products.routes_from')} {shippingEstimate.originCity}</div>
                  </div>
                  <button onClick={() => updatePrices('deliveryFee', String(shippingEstimate.suggested))}
                    style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    {t('seller_products.use_suggested')} TZS {shippingEstimate.suggested.toLocaleString()}
                  </button>
                </div>
              )}

              <div>
                <label style={labelStyle}>{t('seller_products.intercity_fee_label')} <span style={{fontSize:10,fontWeight:400,color:'#94a3b8'}}>{t('seller_products.intercity_fee_note')}</span></label>
                <input type="number" placeholder="e.g. 10000" value={form.deliveryFee}
                  onChange={e => updatePrices('deliveryFee', e.target.value)} style={inputStyle} />
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '3px 0 0' }}>{t('seller_products.intercity_fee_hint')}</p>

              </div>

              {/* Boda Fee — KenteXa suggestions for Dar es Salaam buyers */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={labelStyle}>{`🛵 ${t('seller_products.boda_fee')}`} <span style={{fontSize:10,fontWeight:400,color:'#94a3b8'}}>{t('seller_products.boda_fee_note')}</span></label>
                  <button type="button" onClick={fetchBodaSuggestions}
                    style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: 'none', border: '1px solid #c4b5fd', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                    {loadingSuggestions ? '⏳' : t('seller_products.boda_fee_check_button')}
                  </button>
                </div>
                <input type="number" placeholder="e.g. 5000" value={form.bodaFee}
                  onChange={e => setForm({...form, bodaFee: e.target.value})} style={inputStyle} />
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>
                  {t('seller_products.boda_fee_formula_note', { formula: t('seller_products.boda_fee_formula') })}
                </p>

                {/* KenteXa suggestions — shown when button clicked */}
                {bodaSuggestions?.suggestions?.length > 0 && (
                  <div style={{ marginTop: 10, backgroundColor: '#faf5ff', borderRadius: 12, padding: 12, border: '1px solid #e9d5ff' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', marginBottom: 4 }}>
                      {t('seller_products.kentexa_suggestions_title')}
                    </div>
                    {bodaSuggestions.sellerZone && (
                      <div style={{ fontSize: 10, color: '#7c3aed', marginBottom: 6, fontWeight: 600 }}>
                        {t('seller_products.sending_from_label')} {bodaSuggestions.sellerZone}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
                      {t('seller_products.tap_buyer_area_hint')}
                    </div>
                    {(bodaSuggestions?.suggestions || []).map((s, i) => (
                      <button key={i} type="button"
                        onClick={() => setForm({...form, bodaFee: String(s.maxFee)})}
                        style={{
                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 6,
                          backgroundColor: String(form.bodaFee) === String(s.maxFee) ? '#ede9fe' : '#fff',
                          border: String(form.bodaFee) === String(s.maxFee) ? '2px solid #7c3aed' : '1px solid #e9d5ff',
                          textAlign: 'left',
                        }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>📍 {s.zone}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{s.note}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: '#7c3aed' }}>
                            TZS {s.minFee.toLocaleString()} – {s.maxFee.toLocaleString()}
                          </div>
                          {String(form.bodaFee) === String(s.maxFee) && (
                            <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>{t('seller_products.selected_label')}</div>
                          )}
                        </div>
                      </button>
                    ))}
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '6px 0 0' }}>
                      {t('seller_products.choose_furthest_hint')}
                    </p>
                  </div>
                )}

              </div>



              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>{t('seller_products.ship_from_city_label')}</label>
                <select value={form.sellerCity} onChange={e => setForm({...form, sellerCity: e.target.value})} style={inputStyle}>
                  <option value="Dar es Salaam">Dar es Salaam</option>
                  <option value="Mwanza">Mwanza</option>
                  <option value="Arusha">Arusha</option>
                  <option value="Dodoma">Dodoma</option>
                  <option value="Mbeya">Mbeya</option>
                  <option value="Tanga">Tanga</option>
                  <option value="Zanzibar">Zanzibar</option>
                  <option value="Morogoro">Morogoro</option>
                  <option value="Other">{t('seller_products.other_city')}</option>
                </select>
              </div>
            </div>

            {/* Buyer price preview */}
            {(Number(form.basePrice) > 0 || Number(form.deliveryFee) > 0) && (
              <div style={{ backgroundColor: '#0f172a', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{t('seller_products.buyer_sees')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#ffd200' }}>
                    TZS {(Number(form.basePrice || 0) + Number(form.deliveryFee || 0)).toLocaleString()}
                  </span>
                  <span style={{ backgroundColor: '#16a34a', color: '#fff', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{t('seller_products.free_delivery_badge')}</span>
                </div>
              </div>
            )}

            {/* Zipo toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8 }}>
              <input type="checkbox" id="isAvailable" checked={form.isAvailable}
                onChange={e => setForm({ ...form, isAvailable: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="isAvailable" style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>{t('seller_products.is_available')}</label>
            </div>
            <div style={{ height: 16 }} />
          </div>

          {/* Sticky footer — always visible, never scrolls out of view or
              hides behind the bottom nav, regardless of form length */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 10,
            padding: '12px 16px max(12px, env(safe-area-inset-bottom))',
            borderTop: '1px solid #f1f5f9', backgroundColor: '#fff' }}>
              <button onClick={resetForm} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t('seller_products.cancel')}</button>
              <button onClick={handleSubmit} disabled={uploading}
                style={{ flex: 2, background: uploading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 12, borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800 }}>
                {uploading ? t('seller_products.please_wait') : editProduct ? `✅ ${t('seller_products.update')}` : `+ ${t('seller_products.add_product')}`}
              </button>
          </div>
        </div>
        </div>
      )}

    </div>
  );
};

export default SellerProducts;