/**
 * SetupProgressCard.js — the "Your Kentexa setup ████░░ 80%" checklist,
 * generic over any entry in journeys.js. A step counts as done either
 * because its `computeDone(context)` says so against real data the host
 * page already has (no extra fetch), or because the user completed it
 * through a feature tour (journeySteps, via useOnboarding).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from './OnboardingContext';
import { getJourney } from './journeys';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';

const SetupProgressCard = ({ journeyKey, context = {}, onNavigate }) => {
  const { t } = useTranslation();
  const { isJourneyStepDone } = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);

  const journey = getJourney(journeyKey);
  if (!journey) return null;

  const steps = journey.steps.map(s => ({
    ...s,
    done: s.computeDone ? !!s.computeDone(context) : isJourneyStepDone(journeyKey, s.id),
  }));
  const doneCount = steps.filter(s => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);
  const nextStep = steps.find(s => !s.done);

  if (collapsed) return null;

  if (percent === 100) {
    return (
      <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 14,
        padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
          ✅ {t('onboarding.setup_complete')}
        </span>
        <button onClick={() => setCollapsed(true)} aria-label={t('tours.skip')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16, padding: 0 }}>×</button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: WH, borderRadius: 14, padding: 16, marginBottom: 14,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: DK }}>{t('onboarding.setup_title')}</span>
        <button onClick={() => setCollapsed(true)} aria-label={t('tours.skip')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: GR, fontSize: 16, padding: 0 }}>×</button>
      </div>

      <div style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent}%`, backgroundColor: B, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {steps.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ color: s.done ? '#16A34A' : '#CBD5E1', fontWeight: 900 }}>{s.done ? '✓' : '○'}</span>
            <span style={{ color: s.done ? DK : GR, fontWeight: s.done ? 700 : 500 }}>{t(s.labelKey)}</span>
          </div>
        ))}
      </div>

      {nextStep && (
        <button onClick={() => onNavigate?.(nextStep.targetPage)}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg,${B},#7C3AED)`, color: WH,
            cursor: 'pointer', fontSize: 12.5, fontWeight: 800 }}>
          {t('onboarding.continue_setup')} ({percent}%)
        </button>
      )}
    </div>
  );
};

export default SetupProgressCard;
