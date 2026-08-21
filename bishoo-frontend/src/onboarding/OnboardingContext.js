/**
 * OnboardingContext.js — the single reusable onboarding/tour state store.
 *
 * Everything else in this app's onboarding system (Setup Wizard, feature
 * tours, the "Your Kentexa setup" checklist) reads and writes through this
 * one hook instead of each page inventing its own localStorage flag or
 * hardcoded tutorial logic. Persists to the backend via the existing
 * `PATCH /users/:id` (User.onboardingState, a jsonb blob) and mirrors to
 * localStorage for an instant read before the profile fetch resolves —
 * same key-prefix convention already used for kentexa_user/kentexa_has_ordered.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/api';

const OnboardingCtx = createContext(null);

const CACHE_KEY = 'kentexa_onboarding_cache';

const emptyState = () => ({
  selectedUseCase: null,
  startedAt: null,
  completedAt: null,
  journeySteps: {},
  tours: {},
});

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const writeCache = (state) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
};

export const OnboardingProvider = ({ currentUser, children }) => {
  const [state, setState] = useState(() => readCache() || emptyState());
  const [onboardingCompleted, setOnboardingCompleted] = useState(!!currentUser?.onboardingCompleted);
  const [activeTourKey, setActiveTourKey] = useState(null);
  const saveTimer = useRef(null);
  const userIdRef = useRef(currentUser?.id || null);

  // Hydrate from the real profile once it's known/changes — the cache
  // above is only a bridge for the instant-boot window before this fires.
  useEffect(() => {
    if (!currentUser) return;
    userIdRef.current = currentUser.id;
    setOnboardingCompleted(!!currentUser.onboardingCompleted);
    if (currentUser.onboardingState) {
      const merged = { ...emptyState(), ...currentUser.onboardingState };
      setState(merged);
      writeCache(merged);
    }
  }, [currentUser?.id, currentUser?.onboardingCompleted, currentUser?.onboardingState]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((nextState, nextCompleted) => {
    writeCache(nextState);
    if (!userIdRef.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const body = { onboardingState: nextState };
      if (nextCompleted !== undefined) body.onboardingCompleted = nextCompleted;
      api.patch(`/users/${userIdRef.current}`, body).catch(() => {});
    }, 400);
  }, []);

  const updateState = useCallback((updater, nextCompleted) => {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      persist(next, nextCompleted);
      return next;
    });
  }, [persist]);

  // ── Setup Wizard actions ────────────────────────────────────────────────
  const selectUseCase = useCallback((useCase) => {
    updateState(prev => ({ ...prev, selectedUseCase: useCase, startedAt: prev.startedAt || new Date().toISOString() }));
  }, [updateState]);

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleted(true);
    updateState(prev => ({ ...prev, completedAt: new Date().toISOString() }), true);
  }, [updateState]);

  // ── Journey checklist actions ───────────────────────────────────────────
  const completeJourneyStep = useCallback((journeyKey, stepId) => {
    updateState(prev => {
      const existing = prev.journeySteps[journeyKey] || [];
      if (existing.includes(stepId)) return prev;
      return { ...prev, journeySteps: { ...prev.journeySteps, [journeyKey]: [...existing, stepId] } };
    });
  }, [updateState]);

  const isJourneyStepDone = useCallback((journeyKey, stepId) =>
    (state.journeySteps[journeyKey] || []).includes(stepId),
  [state.journeySteps]);

  // ── Feature tour actions ────────────────────────────────────────────────
  const isTourCompleted = useCallback((tourKey) => state.tours[tourKey]?.status === 'completed', [state.tours]);
  const isTourSkipped   = useCallback((tourKey) => state.tours[tourKey]?.status === 'skipped', [state.tours]);

  const startTour = useCallback((tourKey) => setActiveTourKey(tourKey), []);
  const closeTour = useCallback(() => setActiveTourKey(null), []);

  const completeTour = useCallback((tourKey) => {
    updateState(prev => ({ ...prev, tours: { ...prev.tours, [tourKey]: { status: 'completed', at: new Date().toISOString() } } }));
    setActiveTourKey(null);
  }, [updateState]);

  const skipTour = useCallback((tourKey) => {
    updateState(prev => ({ ...prev, tours: { ...prev.tours, [tourKey]: { status: 'skipped', at: new Date().toISOString() } } }));
    setActiveTourKey(null);
  }, [updateState]);

  // Reopens a tour regardless of prior completed/skipped status — powers
  // the "New to this? Take a quick tour" trigger any page can offer.
  const restartTour = useCallback((tourKey) => setActiveTourKey(tourKey), []);

  const value = {
    onboardingState: state,
    onboardingCompleted,
    selectedUseCase: state.selectedUseCase,
    selectUseCase,
    completeOnboarding,
    completeJourneyStep,
    isJourneyStepDone,
    activeTourKey,
    startTour,
    closeTour,
    completeTour,
    skipTour,
    restartTour,
    isTourCompleted,
    isTourSkipped,
  };

  return <OnboardingCtx.Provider value={value}>{children}</OnboardingCtx.Provider>;
};

export const useOnboarding = () => {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) {
    // A page rendered outside the provider (shouldn't happen once App.js
    // wraps the tree) — fail soft with a harmless no-op shape rather than
    // throwing, so a missing provider never crashes a page, only silently
    // disables onboarding features on it.
    return {
      onboardingState: emptyState(),
      onboardingCompleted: true,
      selectedUseCase: null,
      selectUseCase: () => {},
      completeOnboarding: () => {},
      completeJourneyStep: () => {},
      isJourneyStepDone: () => false,
      activeTourKey: null,
      startTour: () => {},
      closeTour: () => {},
      completeTour: () => {},
      skipTour: () => {},
      restartTour: () => {},
      isTourCompleted: () => true,
      isTourSkipped: () => false,
    };
  }
  return ctx;
};
