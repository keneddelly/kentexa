/**
 * Onboarding.js — New user guided setup
 * Place at: src/public/pages/Onboarding.js
 *
 * Steps (name is NOT asked here — Register.js already collects it):
 * 1. Location (city) — personalized greeting using the name from signup
 * 2. Interests (categories)
 * 3. Follow 3+ suggested businesses
 * 4. Done → HomeFeed
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const CITIES = [
  'Dar es Salaam','Mwanza','Arusha','Mbeya','Dodoma','Tanga',
  'Morogoro','Zanzibar','Kigoma','Shinyanga','Tabora','Iringa',
  'Mtwara','Lindi','Musoma','Bukoba','Sumbawanga','Songea',
  'Kahama','Moshi','Geita','Singida',
];

const INTERESTS = [
  { key:'electronics',  icon:'📱', label:'Teknolojia'     },
  { key:'fashion',      icon:'👗', label:'Mitindo'        },
  { key:'food',         icon:'🍔', label:'Chakula'        },
  { key:'hardware',     icon:'🔨', label:'Vifaa'          },
  { key:'furniture',    icon:'🛋️', label:'Samani'        },
  { key:'agriculture',  icon:'🌾', label:'Kilimo'         },
  { key:'beauty',       icon:'💄', label:'Urembo'         },
  { key:'automotive',   icon:'🚗', label:'Magari'         },
  { key:'health',       icon:'💊', label:'Afya'           },
  { key:'education',    icon:'📚', label:'Elimu'          },
  { key:'services',     icon:'🔧', label:'Services'         },
  { key:'transport',    icon:'🚌', label:'Transport'        },
];

const Onboarding = ({ onNavigate, currentUser, onLoginSuccess }) => {
  const [step,        setStep]        = useState(1);
  const [name,        setName]        = useState(currentUser?.name || '');
  const [city,        setCity]        = useState(currentUser?.city || '');
  const [interests,   setInterests]   = useState([]);
  const [sellers,     setSellers]     = useState([]);
  const [followed,    setFollowed]    = useState(new Set());
  const [saving,      setSaving]      = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(false);

  const TOTAL_STEPS = 3;
  const progress = (step / TOTAL_STEPS) * 100;

  // Load suggested sellers when reaching step 4
  useEffect(() => {
    if (step !== 4) return;
    setLoadingSellers(true);
    api.get('/seller/public/all')
      .then(r => setSellers((r.data?.sellers || r.data || []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoadingSellers(false));
  }, [step]);

  const saveStep = async (stepData) => {
    try {
      await api.patch(`/users/${currentUser?.id}`, stepData);
    } catch {}
  };

  const handleFollow = async (sellerId) => {
    try {
      await api.post(`/stores/${sellerId}/follow`);
      setFollowed(prev => new Set([...prev, sellerId]));
    } catch {}
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.patch(`/users/${currentUser?.id}`, {
        onboardingCompleted: true,
        name,
        city,
        interests,
      });
      onNavigate('Home');
    } catch {
      onNavigate('Home');
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 1) return city.length > 0;
    if (step === 2) return interests.length >= 1;
    if (step === 3) return true; // can skip following
    return true;
  };

  const nextStep = async () => {
    if (step === 1) await saveStep({ city });
    if (step === 2) await saveStep({ interests });
    if (step === 3) { handleFinish(); return; }
    setStep(s => s + 1);
  };

  const inp = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: '1.5px solid #E2E8F0', fontSize: 16, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: DK,
    backgroundColor: WH,
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC',
      fontFamily: 'Manrope,Inter,-apple-system,sans-serif',
      display: 'flex', flexDirection: 'column' }}>

      {/* Progress bar */}
      <div style={{ height: 4, backgroundColor: '#E2E8F0' }}>
        <div style={{ height: '100%', backgroundColor: B,
          width: `${progress}%`, transition: 'width 0.4s ease',
          borderRadius: '0 2px 2px 0' }} />
      </div>

      {/* Step indicator */}
      <div style={{ padding: '16px 20px 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: GR, fontWeight: 700 }}>
          Hatua {step} ya {TOTAL_STEPS}
        </div>
        {step < TOTAL_STEPS && (
          <button onClick={() => setStep(s => s + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: GR, fontSize: 12, fontWeight: 700 }}>
            Skip →
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '32px 20px 24px', maxWidth: 480,
        margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* ── STEP 1: Location (personalized greeting — name already known from signup) ── */}
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📍</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: DK,
              margin: '0 0 8px', lineHeight: 1.2 }}>
              Karibu{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}!
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              Tutakuonyesha bidhaa, huduma na wasafirishaji karibu nawe.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CITIES.map(c => (
                <button key={c} onClick={() => setCity(c)}
                  style={{ padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${city === c ? B : '#E2E8F0'}`,
                    backgroundColor: city === c ? '#EFF6FF' : WH,
                    color: city === c ? B : DK,
                    fontSize: 13, fontWeight: city === c ? 800 : 600,
                    textAlign: 'left', transition: 'all 0.15s' }}>
                  {city === c ? '✓ ' : ''}{c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Interests ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🎯</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: DK,
              margin: '0 0 8px', lineHeight: 1.2 }}>
              What are you into?
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              Chagua angalau moja. Tutatumia hii kukuonyesha bidhaa zinazokufaa.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {INTERESTS.map(i => {
                const selected = interests.includes(i.key);
                return (
                  <button key={i.key}
                    onClick={() => setInterests(prev =>
                      selected ? prev.filter(k => k !== i.key) : [...prev, i.key]
                    )}
                    style={{ padding: '14px', borderRadius: 14, cursor: 'pointer',
                      border: `2px solid ${selected ? B : '#E2E8F0'}`,
                      backgroundColor: selected ? '#EFF6FF' : WH,
                      display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 24 }}>{i.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: selected ? 800 : 600,
                      color: selected ? B : DK }}>
                      {i.label}
                    </span>
                    {selected && (
                      <span style={{ marginLeft: 'auto', color: B, fontWeight: 900 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            {interests.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: B, fontWeight: 700 }}>
                ✓ Umechagua {interests.length} — vizuri!
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Follow businesses ── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🏪</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: DK,
              margin: '0 0 8px', lineHeight: 1.2 }}>
              Follow businesses!
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              Fuata biashara unazo{city ? ` ${city}` : ''} ili uone bidhaa zao mpya kwenye feed yako.
              {followed.size >= 3 ? ' 🎉 Umefuata wa kutosha!' : ` Fuata angalau 3 (${followed.size}/3).`}
            </p>

            {loadingSellers ? (
              <div style={{ textAlign: 'center', padding: 40, color: GR }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
                <div>Inapakia biashara...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sellers.map(s => {
                  const isFollowed = followed.has(s.userId || s.id);
                  return (
                    <div key={s.id}
                      style={{ backgroundColor: WH, borderRadius: 14,
                        padding: '14px 16px', display: 'flex',
                        alignItems: 'center', gap: 12,
                        border: isFollowed ? `2px solid ${B}` : '2px solid #F1F5F9',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12,
                        backgroundColor: '#EFF6FF', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden' }}>
                        {s.logo
                          ? <img src={s.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => e.target.style.display = 'none'} />
                          : <span style={{ fontSize: 20, fontWeight: 900, color: B }}>
                              {(s.storeName || s.name || '?').charAt(0).toUpperCase()}
                            </span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: DK,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.storeName || s.name}
                        </div>
                        <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>
                          📍 {s.businessLocation || s.city || 'Tanzania'}
                          {s.reputationScore > 0 && ` · ⭐ ${s.reputationScore}`}
                        </div>
                      </div>
                      <button
                        onClick={() => !isFollowed && handleFollow(s.userId || s.id)}
                        style={{ backgroundColor: isFollowed ? '#F0FDF4' : B,
                          color: isFollowed ? '#16A34A' : WH,
                          border: 'none', borderRadius: 10,
                          padding: '8px 16px', cursor: isFollowed ? 'default' : 'pointer',
                          fontSize: 12, fontWeight: 800, flexShrink: 0,
                          transition: 'all 0.2s' }}>
                        {isFollowed ? '✓ Unafuata' : '+ Fuata'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div style={{ padding: '16px 20px 32px', maxWidth: 480,
        margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <button
          onClick={nextStep}
          disabled={!canNext() || saving}
          style={{ width: '100%', padding: '16px 0',
            background: canNext()
              ? `linear-gradient(135deg,${B},#7C3AED)`
              : '#E2E8F0',
            color: canNext() ? WH : GR,
            border: 'none', borderRadius: 16, cursor: canNext() ? 'pointer' : 'default',
            fontSize: 16, fontWeight: 900,
            boxShadow: canNext() ? '0 4px 16px rgba(37,99,235,0.3)' : 'none',
            transition: 'all 0.2s' }}>
          {saving ? '⏳ Inahifadhi...' :
           step === 3 ? (followed.size >= 3 ? '🎉 Anza KenteXa!' : 'Continue →') :
           'Continue →'}
        </button>

        {step === 3 && followed.size < 3 && (
          <button onClick={handleFinish}
            style={{ width: '100%', marginTop: 10, padding: '12px 0',
              background: 'none', border: 'none', cursor: 'pointer',
              color: GR, fontSize: 13, fontWeight: 700 }}>
            Skip kwa sasa — nitafuata baadaye
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  );
};

export default Onboarding;