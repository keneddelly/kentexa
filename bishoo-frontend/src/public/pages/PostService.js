/**
 * PostService.js — Any user can post a service ad
 * Place at: src/public/pages/PostService.js
 */
import React, { useState } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const CATEGORIES = [
  { value: 'ufundi',       icon: '🔧', label: 'Ufundi (Umeme, Mabomba, Seremala)' },
  { value: 'usafi',        icon: '🧹', label: 'Usafi (Nyumba, Ofisi, Nguo)'       },
  { value: 'elimu',        icon: '📚', label: 'Elimu (Masomo, Mafunzo)'            },
  { value: 'upishi',       icon: '👨‍🍳', label: 'Upishi (Catering, Mikate, Mapishi)'},
  { value: 'usafirishaji', icon: '🚗', label: 'Usafirishaji (Dereva, Hamahama)'    },
  { value: 'afya',         icon: '🏥', label: 'Afya (Uuguzi, Fizikia, Dalili)'    },
  { value: 'ubunifu',      icon: '🎨', label: 'Ubunifu (Picha, Video, Muziki, Usanifu)'},
  { value: 'matengenezo',  icon: '🔨', label: 'Matengenezo (Simu, Vifaa, Magari)' },
  { value: 'biashara',     icon: '💼', label: 'Biashara (Uhasibu, Kisheria, Ushauri)'},
  { value: 'kilimo',       icon: '🌱', label: 'Kilimo (Bustani, Unyunyiziaji)'     },
  { value: 'nyumbani',     icon: '🏠', label: 'Nyumbani (Mtoto, Wazee, Usafi)'     },
  { value: 'mengineyo',    icon: '📋', label: 'Mengineyo'                           },
];

const PRICE_TYPES = [
  { value: 'per_hour',  label: 'Kwa Saa'           },
  { value: 'per_job',   label: 'Kwa Kazi'           },
  { value: 'per_day',   label: 'Kwa Siku'           },
  { value: 'negotiate', label: 'Kwa Mazungumzo'     },
  { value: 'free_quote',label: 'Omba Bei (Bure)'    },
];

const DAYS = [
  { v: 'Mon', l: 'Jumatatu' }, { v: 'Tue', l: 'Jumanne' },
  { v: 'Wed', l: 'Jumatano' }, { v: 'Thu', l: 'Alhamisi' },
  { v: 'Fri', l: 'Ijumaa'   }, { v: 'Sat', l: 'Jumamosi' },
  { v: 'Sun', l: 'Jumapili'  },
];

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const PostService = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [step,  setStep]  = useState(1);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [form,  setForm]  = useState({
    title: '', description: '', category: '', subcategory: '',
    priceType: 'per_job', price: '', priceMax: '',
    coverageCity: '', coverageWards: '',
    workingDays: ['Mon','Tue','Wed','Thu','Fri'],
    workingHours: '08:00 - 18:00',
    isAvailableNow: true,
    whatsappPhone: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (day) => {
    set('workingDays', form.workingDays.includes(day)
      ? form.workingDays.filter(d => d !== day)
      : [...form.workingDays, day]
    );
  };

  const handleSubmit = async () => {
    if (!form.title.trim())       return setError('Weka kichwa cha tangazo');
    if (!form.description.trim()) return setError('Eleza huduma yako');
    if (!form.category)           return setError('Chagua aina ya huduma');
    if (!form.coverageCity.trim()) return setError('Weka mji unaohudumia');
    try {
      setSaving(true); setError('');
      const payload = {
        ...form,
        price:         form.price    ? Number(form.price)    : 0,
        priceMax:      form.priceMax ? Number(form.priceMax) : null,
        coverageWards: form.coverageWards
          ? form.coverageWards.split(',').map(w => w.trim()).filter(Boolean)
          : [],
      };
      const res = await api.post('/services', payload);
      onNavigate(`ServiceDetail-${res.data.id}`);
    } catch (e) {
      setError(e.response?.data?.message || 'Imeshindwa. Jaribu tena.');
    } finally { setSaving(false); }
  };

  const progress = [
    { n: 1, label: 'Aina'     },
    { n: 2, label: 'Maelezo'  },
    { n: 3, label: 'Bei'      },
    { n: 4, label: 'Eneo'     },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      paddingBottom: 90,
      backgroundColor: '#f8fafc', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <Navbar currentPage="PostService" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => step > 1 ? setStep(s => s - 1) : onNavigate('Services')}
        title="➕ Tangaza Huduma Yako" />

      <div style={{ flex: 1, padding: '16px 16px 48px', maxWidth: 600,
        margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
          {progress.map(s => (
            <div key={s.n} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 4, borderRadius: 100, marginBottom: 6,
                backgroundColor: step >= s.n ? '#1d4ed8' : '#e2e8f0' }} />
              <div style={{ fontSize: 10, fontWeight: 700,
                color: step >= s.n ? '#1d4ed8' : '#94a3b8' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Step 1: Category */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 6 }}>
              Ni huduma gani unatoa?
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Chagua aina inayoelezea huduma yako vizuri
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c.value}
                  onClick={() => { set('category', c.value); setStep(2); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px', backgroundColor: '#fff', borderRadius: 12,
                    border: `2px solid ${form.category === c.value ? '#1d4ed8' : '#e2e8f0'}`,
                    cursor: 'pointer', textAlign: 'left',
                    backgroundColor: form.category === c.value ? '#eff6ff' : '#fff' }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{c.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{c.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              Eleza huduma yako
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                Kichwa cha Tangazo *
              </label>
              <input style={inp} value={form.title}
                placeholder="e.g. Fundi wa Umeme — Dar es Salaam"
                onChange={e => set('title', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                Maelezo *
              </label>
              <textarea rows={5} style={{ ...inp, resize: 'vertical' }}
                value={form.description}
                placeholder="Eleza kwa undani zaidi huduma unayotoa, uzoefu wako, na unavyoweza kusaidia wateja wako..."
                onChange={e => set('description', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                Utaalamu Mahususi (hiari)
              </label>
              <input style={inp} value={form.subcategory}
                placeholder="e.g. Umeme, Mabomba, AC"
                onChange={e => set('subcategory', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                WhatsApp (hiari — ili wateja wakuwasiliane haraka)
              </label>
              <input type="tel" style={inp} value={form.whatsappPhone}
                placeholder="0788 000 000"
                onChange={e => set('whatsappPhone', e.target.value)} />
            </div>
            {/* Working days */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 8 }}>
                Siku za Kazi
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <button key={d.v} onClick={() => toggleDay(d.v)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      backgroundColor: form.workingDays.includes(d.v) ? '#1d4ed8' : '#f1f5f9',
                      color: form.workingDays.includes(d.v) ? '#fff' : '#64748b' }}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>Masaa ya Kazi</label>
              <input style={inp} value={form.workingHours}
                placeholder="08:00 - 18:00"
                onChange={e => set('workingHours', e.target.value)} />
            </div>
            <button onClick={() => { if (!form.title.trim() || !form.description.trim()) return setError('Jaza sehemu zote zinazohitajika'); setError(''); setStep(3); }}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
              Endelea →
            </button>
          </div>
        )}

        {/* Step 3: Pricing */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              Bei ya Huduma
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 8 }}>
                Aina ya Bei
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PRICE_TYPES.map(pt => (
                  <label key={pt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${form.priceType === pt.value ? '#1d4ed8' : '#e2e8f0'}`,
                      backgroundColor: form.priceType === pt.value ? '#eff6ff' : '#fff' }}>
                    <input type="radio" name="priceType" value={pt.value}
                      checked={form.priceType === pt.value}
                      onChange={() => set('priceType', pt.value)} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {pt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {!['negotiate','free_quote'].includes(form.priceType) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                    color: '#64748b', marginBottom: 6 }}>Bei (TZS)</label>
                  <input type="number" style={inp} value={form.price}
                    placeholder="5000"
                    onChange={e => set('price', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                    color: '#64748b', marginBottom: 6 }}>Bei ya Juu (hiari)</label>
                  <input type="number" style={inp} value={form.priceMax}
                    placeholder="15000"
                    onChange={e => set('priceMax', e.target.value)} />
                </div>
              </div>
            )}
            <button onClick={() => setStep(4)}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
              Endelea →
            </button>
          </div>
        )}

        {/* Step 4: Location */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1e293b', marginBottom: 20 }}>
              Unafanya kazi wapi?
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                Mji Mkuu *
              </label>
              <input style={inp} value={form.coverageCity}
                placeholder="e.g. Dar es Salaam"
                onChange={e => set('coverageCity', e.target.value)} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700,
                color: '#64748b', marginBottom: 6 }}>
                Maeneo Mahususi (tenganisha kwa koma)
              </label>
              <input style={inp} value={form.coverageWards}
                placeholder="e.g. Kariakoo, Kinondoni, Mbezi, Tegeta"
                onChange={e => set('coverageWards', e.target.value)} />
            </div>
            {/* Preview */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: 12,
              padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                📋 Muhtasari wa Tangazo
              </div>
              {[
                ['Huduma', form.title],
                ['Aina', CATEGORIES.find(c => c.value === form.category)?.label || '—'],
                ['Bei', form.priceType === 'negotiate' ? 'Mazungumzo' : form.priceType === 'free_quote' ? 'Omba Bei' : `TZS ${Number(form.price||0).toLocaleString()}`],
                ['Mji', form.coverageCity || '—'],
              ].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{k}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSubmit} disabled={saving}
              style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 800 }}>
              {saving ? '⏳ Inatuma...' : '🚀 Chapisha Tangazo'}
            </button>
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default PostService;