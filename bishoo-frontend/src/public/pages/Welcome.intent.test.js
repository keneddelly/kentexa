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
    expect(screen.getByText('welcome.create_account_button')).toBeInTheDocument();
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
