/**
 * Onboarding.js — the first-time Kentexa Setup Wizard.
 * Place at: src/public/pages/Onboarding.js
 *
 * Used to open with a "What do you want to do on Kentexa?" branching
 * step (sell/manage/ship/super agent/transport/buy/AI) — removed per
 * explicit request: every new account now goes straight into the same
 * buyer-oriented steps below regardless of intent. Anyone who actually
 * wants to sell/ship/become a Super Agent or transport provider still
 * reaches those flows the normal way, through their own dedicated
 * BecomeSeller/BecomeSuperAgentInfo/BecomeTransportProvider pages
 * elsewhere in the app — this wizard was never the only path to them.
 *
 * Steps 1-3 (name is NOT asked here — Register.js already collects it):
 * 1. Location (city) — personalized greeting using the name from signup
 * 2. Interests (categories)
 * 3. Follow 3+ suggested businesses
 * 4. Done → HomeFeed
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const getInterests = (t) => [
  { key:'electronics',  icon:'📱', label:t('onboarding.interest_electronics')     },
  { key:'fashion',      icon:'👗', label:t('onboarding.interest_fashion')        },
  { key:'food',         icon:'🍔', label:t('onboarding.interest_food')        },
  { key:'hardware',     icon:'🔨', label:t('onboarding.interest_hardware')          },
  { key:'furniture',    icon:'🛋️', label:t('onboarding.interest_furniture')        },
  { key:'agriculture',  icon:'🌾', label:t('onboarding.interest_agriculture')         },
  { key:'beauty',       icon:'💄', label:t('onboarding.interest_beauty')         },
  { key:'automotive',   icon:'🚗', label:t('onboarding.interest_automotive')         },
  { key:'health',       icon:'💊', label:t('onboarding.interest_health')           },
  { key:'education',    icon:'📚', label:t('onboarding.interest_education')          },
  { key:'services',     icon:'🔧', label:t('onboarding.interest_services')         },
  { key:'transport',    icon:'🚌', label:t('onboarding.interest_transport')        },
];

const Onboarding = ({ onNavigate, currentUser, onLoginSuccess }) => {
  const { t } = useTranslation();
  const INTERESTS = getInterests(t);
  const [step,        setStep]        = useState(1);
  const [name]        = useState(currentUser?.name || '');
  const [city,        setCity]        = useState(currentUser?.city || '');
  const [interests,   setInterests]   = useState([]);
  const [sellers,     setSellers]     = useState([]);
  const [followed,    setFollowed]    = useState(new Set());
  const [saving,      setSaving]      = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(false);

  const TOTAL_STEPS = 3;
  const progress = (step / TOTAL_STEPS) * 100;

  // Load suggested sellers when reaching step 3 (the "follow businesses"
  // step) — TOTAL_STEPS is 3, so step never reaches 4; this was silently
  // never firing, leaving the follow-businesses list permanently empty.
  useEffect(() => {
    if (step !== 3) return;
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
          {t('onboarding.step_indicator', { step, total: TOTAL_STEPS })}
        </div>
        {step < TOTAL_STEPS && (
          <button onClick={() => setStep(s => s + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: GR, fontSize: 12, fontWeight: 700 }}>
            {t('onboarding.skip')}
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
              {t('onboarding.greeting', { name: currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : '' })}
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              {t('onboarding.step1_desc')}
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
              {t('onboarding.step2_title')}
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              {t('onboarding.step2_desc')}
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
                {t('onboarding.selected_count', { count: interests.length })}
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
              {t('onboarding.step3_title')}
            </h1>
            <p style={{ fontSize: 15, color: GR, margin: '0 0 24px', lineHeight: 1.6 }}>
              {t('onboarding.step3_desc_prefix', { city: city ? ` ${city}` : '' })}
              {followed.size >= 3 ? t('onboarding.step3_desc_done') : t('onboarding.step3_desc_progress', { count: followed.size })}
            </p>

            {loadingSellers ? (
              <div style={{ textAlign: 'center', padding: 40, color: GR }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏪</div>
                <div>{t('onboarding.loading_sellers')}</div>
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
                          📍 {s.businessLocation || s.city || t('onboarding.default_location')}
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
                        {isFollowed ? t('onboarding.following_button') : t('onboarding.follow_button')}
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
          {saving ? t('onboarding.saving_button') :
           step === 3 ? (followed.size >= 3 ? t('onboarding.finish_button') : t('onboarding.continue_button')) :
           t('onboarding.continue_button')}
        </button>

        {step === 3 && followed.size < 3 && (
          <button onClick={handleFinish}
            style={{ width: '100%', marginTop: 10, padding: '12px 0',
              background: 'none', border: 'none', cursor: 'pointer',
              color: GR, fontSize: 13, fontWeight: 700 }}>
            {t('onboarding.skip_for_now')}
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