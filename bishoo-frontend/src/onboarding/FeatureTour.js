/**
 * FeatureTour.js — the one generic coach-mark engine every feature tour
 * runs through. It knows nothing about any specific page: it reads a
 * tour's step config (tours.js), finds the current step's target via
 * `[data-tour="..."]`, and renders a spotlight highlight + tooltip. Steps
 * with no `target` render as a centered explanatory card instead.
 *
 * The host page stays generic-compatible by handling `requiresState` on a
 * step (e.g. switching its own active tab) inside `onStepChange` — the
 * engine just waits a beat for the DOM to settle, then measures.
 *
 * No new dependency — plain DOM measurement + fixed-position overlays.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboarding } from './OnboardingContext';
import { getTour } from './tours';

const B  = '#2563EB';
const DK = '#0F172A';
const GR = '#64748B';
const WH = '#FFFFFF';
const SCRIM = 'rgba(15,23,42,0.6)';
const PAD = 8;

const measure = (target) => {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};

const FeatureTour = ({ tourKey, onStepChange, autoStart = false, onFinalCta }) => {
  const { t } = useTranslation();
  const {
    activeTourKey, startTour, completeTour, skipTour,
    isTourCompleted, isTourSkipped,
  } = useOnboarding();

  const tour = getTour(tourKey);
  const isActive = activeTourKey === tourKey;
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const startedRef = useRef(false);

  // Auto-launch once, the first time this page is visited.
  useEffect(() => {
    if (!autoStart || startedRef.current || !tour) return;
    startedRef.current = true;
    if (!isTourCompleted(tourKey) && !isTourSkipped(tourKey)) {
      startTour(tourKey);
    }
  }, [autoStart, tour, tourKey, isTourCompleted, isTourSkipped, startTour]);

  useEffect(() => { if (isActive) setStepIndex(0); }, [isActive]);

  const step = tour?.steps?.[stepIndex] || null;

  // Apply requiresState, wait for the DOM to settle (tab switch, form
  // mount, etc.), then measure. Re-measures on resize/scroll while active.
  const doMeasure = useCallback(() => {
    if (!step) return;
    const el = step.target && document.querySelector(`[data-tour="${step.target}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setRect(measure(step.target)));
    });
  }, [step]);

  useEffect(() => {
    if (!isActive || !step) return;
    if (step.requiresState && typeof onStepChange === 'function') {
      onStepChange(step.requiresState);
    }
    const timer = setTimeout(doMeasure, step.requiresState ? 180 : 30);
    return () => clearTimeout(timer);
  }, [isActive, step, onStepChange, doMeasure]);

  useEffect(() => {
    if (!isActive) return;
    const onResize = () => doMeasure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isActive, doMeasure]);

  const finish = useCallback(() => {
    completeTour(tourKey);
    if (typeof onFinalCta === 'function') onFinalCta();
  }, [completeTour, tourKey, onFinalCta]);

  const handleSkip = useCallback(() => skipTour(tourKey), [skipTour, tourKey]);
  const handleNext = useCallback(() => {
    if (!tour) return;
    if (stepIndex >= tour.steps.length - 1) { finish(); return; }
    setStepIndex(i => i + 1);
  }, [tour, stepIndex, finish]);
  const handleBack = useCallback(() => setStepIndex(i => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e) => { if (e.key === 'Escape') handleSkip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, handleSkip]);

  if (!isActive || !tour || !step) return null;

  const isLast = stepIndex === tour.steps.length - 1;
  const centered = !step.target || !rect;

  // ── Tooltip position — clamps to viewport, flips above the target when
  // there isn't room below, falls back to viewport-bottom-anchored on
  // very small screens. ──────────────────────────────────────────────────
  const CARD_W = Math.min(340, window.innerWidth - 32);
  let cardStyle = { position: 'fixed', zIndex: 10002, width: CARD_W, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  if (!centered) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - CARD_W - 16);
    if (spaceBelow > 180 || spaceBelow > spaceAbove) {
      cardStyle = { position: 'fixed', zIndex: 10002, width: CARD_W, left, top: Math.min(rect.bottom + 14, window.innerHeight - 200), transform: 'none' };
    } else {
      cardStyle = { position: 'fixed', zIndex: 10002, width: CARD_W, left, bottom: Math.max(window.innerHeight - rect.top + 14, 16), transform: 'none' };
    }
  }

  return (
    <>
      {centered ? (
        <div onClick={handleSkip} style={{ position: 'fixed', inset: 0, backgroundColor: SCRIM, zIndex: 10000 }} />
      ) : (
        <>
          {/* 4-rectangle spotlight cutout around the target */}
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD), backgroundColor: SCRIM, zIndex: 10000 }} />
          <div style={{ position: 'fixed', top: rect.bottom + PAD, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM, zIndex: 10000 }} />
          <div style={{ position: 'fixed', top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2, backgroundColor: SCRIM, zIndex: 10000 }} />
          <div style={{ position: 'fixed', top: rect.top - PAD, left: rect.right + PAD, right: 0, height: rect.height + PAD * 2, backgroundColor: SCRIM, zIndex: 10000 }} />
          {/* Highlight ring — pointer-events none so the real element underneath stays clickable */}
          <div style={{ position: 'fixed', top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            border: `3px solid ${B}`, borderRadius: 14, boxShadow: '0 0 0 4px rgba(37,99,235,0.25)', zIndex: 10001, pointerEvents: 'none' }} />
        </>
      )}

      <div role="dialog" aria-label={t(step.titleKey)} style={{ ...cardStyle, backgroundColor: WH, borderRadius: 16,
        padding: 18, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: GR }}>
            {t('tours.step_counter', { num: stepIndex + 1, total: tour.steps.length })}
          </span>
          <button onClick={handleSkip} aria-label={t('tours.skip')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GR, fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: DK, marginBottom: 6, lineHeight: 1.3 }}>
          {t(step.titleKey)}
        </div>
        <div style={{ fontSize: 13, color: GR, lineHeight: 1.6, marginBottom: 16 }}>
          {t(step.descKey)}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {stepIndex > 0 && (
            <button onClick={handleBack}
              style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid #E2E8F0`, background: WH, color: DK,
                cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {t('tours.back')}
            </button>
          )}
          <button onClick={handleSkip}
            style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: 'none', color: GR,
              cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            {t('tours.skip')}
          </button>
          <button onClick={handleNext}
            style={{ marginLeft: 'auto', padding: '9px 18px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg,${B},#7C3AED)`, color: WH,
              cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
            {isLast || step.isFinal ? t('tours.finish') : t('tours.next')}
          </button>
        </div>
      </div>
    </>
  );
};

export default FeatureTour;
