import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Welcome from './Welcome';
import { setIntent } from '../../utils/campaignIntent';

// Same pattern as ProfileSwitcherSheet.test.js — the real react-i18next
// instance isn't needed to prove Welcome picks the right KEY per intent;
// mocking t() to the identity function makes that assertable directly.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../components/LanguageSwitcher', () => () => <div data-testid="language-switcher" />);

describe('Welcome — landing language + campaign intent', () => {
  beforeEach(() => { sessionStorage.clear(); });

  test('renders a language selector on the public landing page', () => {
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  test('with no intent, renders the default welcome keys', () => {
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByText('welcome.headline')).toBeInTheDocument();
    expect(screen.getByText('welcome.subheadline')).toBeInTheDocument();
    // L2: the same create_account_button key is reused for the hero CTA
    // AND the After-Signup/Final CTAs further down the page (§15 — same
    // action, not a different one, at each of the sensible CTA points) —
    // so this is deliberately a multi-match, not an ambiguity bug.
    expect(screen.getAllByText('welcome.create_account_button').length).toBeGreaterThanOrEqual(1);
  });

  test.each(['service', 'classified', 'seller'])('intent=%s customizes hero copy via intent-scoped translation keys', (intent) => {
    setIntent(intent);
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByText(`welcome.intent.${intent}.headline`)).toBeInTheDocument();
    expect(screen.getByText(`welcome.intent.${intent}.subheadline`)).toBeInTheDocument();
    expect(screen.getByText(`welcome.intent.${intent}.cta`)).toBeInTheDocument();
    // default keys must NOT also be rendered — this is a substitution, not an addition
    expect(screen.queryByText('welcome.headline')).not.toBeInTheDocument();
  });

  test('an invalid/unsupported intent value falls back to the default keys, not a broken key', () => {
    sessionStorage.setItem('kentexa_intent', JSON.stringify({ value: 'not-a-real-intent', ts: Date.now() }));
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByText('welcome.headline')).toBeInTheDocument();
  });

  test('both CTA buttons still route to Register/PublicLogin regardless of intent — only copy changes, not destination', () => {
    setIntent('seller');
    const onNavigate = jest.fn();
    render(<Welcome onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('welcome.intent.seller.cta'));
    expect(onNavigate).toHaveBeenCalledWith('Register');
    fireEvent.click(screen.getByText('welcome.log_in_button'));
    expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  });

  test('reading intent for hero copy does not consume/clear it — it must still be there for Signup/Login/post-auth', () => {
    setIntent('service');
    render(<Welcome onNavigate={jest.fn()} />);
    expect(JSON.parse(sessionStorage.getItem('kentexa_intent')).value).toBe('service');
  });
});

describe('Welcome — L2 product education composition', () => {
  beforeEach(() => { sessionStorage.clear(); });

  test('secondary "see how Kentexa works" discovery action is present alongside the hero CTAs', () => {
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByText('welcome.discover_more_button')).toBeInTheDocument();
  });

  test('the full product-education body (LandingEducation) mounts under the hero', () => {
    render(<Welcome onNavigate={jest.fn()} />);
    // A handful of section headings across the education body, proving
    // Welcome.js actually composes LandingEducation rather than just
    // importing it unused.
    expect(screen.getByText('landing.what_is.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.how_it_works.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.after_signup.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.trust.heading')).toBeInTheDocument();
  });

  test('language selector still renders alongside the larger page (L1 behavior not regressed by L2)', () => {
    render(<Welcome onNavigate={jest.fn()} />);
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });
});
