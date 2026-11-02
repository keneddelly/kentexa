import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Welcome from './Welcome';
import { setIntent } from '../../utils/campaignIntent';

// Same pattern as ProfileSwitcherSheet.test.js — the real react-i18next
// instance isn't needed to prove Welcome picks the right KEY per intent;
// mocking t() to the identity function makes that assertable directly.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('../components/LanguageSwitcher', () => () => <div data-testid="language-switcher" />);
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));

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
    fireEvent.click(screen.getAllByText('welcome.log_in_button')[0]);
    expect(onNavigate).toHaveBeenCalledWith('PublicLogin');
  });

  test('reading intent for hero copy does not consume/clear it — it must still be there for Signup/Login/post-auth', () => {
    setIntent('service');
    render(<Welcome onNavigate={jest.fn()} />);
    expect(JSON.parse(sessionStorage.getItem('kentexa_intent')).value).toBe('service');
  });
});

describe('Welcome — the new landing (owner approved 2026-11-02): the live KenteXa a visitor would join', () => {
  const api = require('../../api/api').default;
  const { act } = require('@testing-library/react');
  beforeEach(() => { sessionStorage.clear(); api.get.mockReset(); });
  const answer = (map) => api.get.mockImplementation(async (url) => ({ data: map[url] ?? [] }));

  test('real public talk (conversations first), topics and open communities; a tap asks to open an account', async () => {
    answer({
      '/feed': { items: [
        { id: 1, body: 'Habari za leo kutoka duka letu', intent: 'update', business: { storeName: 'Bishoo' } },
        { id: 2, body: 'Bei ya mchele Kariakoo imepanda, mnapata wapi?', intent: 'question', topic: 'biashara', commentCount: 14, business: { name: 'Asha Juma' } },
        { id: 3, title: '', body: '' },
      ] },
      '/feed/topics': [{ key: 'biashara', label: 'Biashara' }, { key: 'kilimo', label: 'Kilimo' }],
      '/communities': [{ id: 5, name: 'Wafanyabiashara Dar', memberCount: 1240, joinPolicy: 'open' }, { id: 6, name: 'Siri', joinPolicy: 'request' }],
    });
    const onNavigate = jest.fn();
    await act(async () => { render(<Welcome onNavigate={onNavigate} />); });
    expect(api.get).toHaveBeenCalledWith('/feed', { params: { filter: 'for_you', page: 1 } });
    const talk = screen.getByTestId('welcome-talk');
    expect(talk.querySelectorAll('[data-testid^="welcome-post-"]')[0]).toHaveTextContent('Bei ya mchele'); // the question comes first
    expect(screen.queryByTestId('welcome-post-3')).toBeNull(); // nothing to show, not shown
    expect(screen.getByTestId('welcome-post-2')).toHaveTextContent('Biashara');
    expect(screen.getByTestId('welcome-topics')).toHaveTextContent('Kilimo');
    expect(screen.getByTestId('welcome-communities')).toHaveTextContent('Wafanyabiashara Dar');
    expect(screen.getByTestId('welcome-communities')).not.toHaveTextContent('Siri');
    fireEvent.click(screen.getByTestId('welcome-post-2'));
    expect(onNavigate).toHaveBeenCalledWith('Register');
  });

  test('nothing real yet: those blocks are hidden; the page still offers an account and the language choice', async () => {
    answer({});
    await act(async () => { render(<Welcome onNavigate={jest.fn()} />); });
    expect(screen.queryByTestId('welcome-talk')).toBeNull();
    expect(screen.queryByTestId('welcome-topics')).toBeNull();
    expect(screen.queryByTestId('welcome-communities')).toBeNull();
    expect(screen.getByText('welcome.landing.final')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });
});
