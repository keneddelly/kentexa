/**
 * TourTrigger.js — "❓ New to this? Take a quick tour" button. Drop this
 * on any page that has a FeatureTour mounted to let a user replay it,
 * regardless of whether they already completed or skipped it.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from './OnboardingContext';

const TourTrigger = ({ tourKey, style }) => {
  const { t } = useTranslation();
  const { restartTour } = useOnboarding();
  return (
    <button onClick={() => restartTour(tourKey)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
        backgroundColor: '#EFF6FF', color: '#1D4ED8', border: 'none',
        borderRadius: 20, padding: '6px 12px', cursor: 'pointer',
        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', ...style }}>
      ❓ {t('tours.trigger_label')}
    </button>
  );
};

export default TourTrigger;
