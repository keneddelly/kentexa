import React from 'react';
import { render, screen } from '@testing-library/react';
import LandingEducation from './LandingEducation';

// Same convention as Welcome.intent.test.js / ProfileSwitcherSheet.test.js —
// t() returns the key itself so assertions are about which KEY rendered,
// not translated prose (that's locales.landing.test.js's job).
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

describe('LandingEducation — generic (no intent)', () => {
  test('includes the core Kentexa education: what-is, business, personal path, moments, trust, final CTA', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.what_is.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.business.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.personal_vs_business.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.moments.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.trust.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.final_cta.heading')).toBeInTheDocument();
  });

  test('"How Kentexa Works" renders with all 5 steps and links to the full HowItWorks page', () => {
    const onNavigate = jest.fn();
    render(<LandingEducation intent={null} onNavigate={onNavigate} />);
    expect(screen.getByText('landing.how_it_works.heading')).toBeInTheDocument();
    [1, 2, 3, 4, 5].forEach((n) => expect(screen.getByText(`landing.how_it_works.step${n}_title`)).toBeInTheDocument());
    screen.getByText('landing.how_it_works.cta_full').click();
    expect(onNavigate).toHaveBeenCalledWith('HowItWorks');
  });

  test('"After Signup" guidance renders every path and its steps', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.after_signup.heading')).toBeInTheDocument();
    ['path_sell_title', 'path_service_title', 'path_classified_title', 'path_buy_title', 'path_business_title']
      .forEach((key) => expect(screen.getByText(`landing.after_signup.${key}`)).toBeInTheDocument());
  });

  test('Moments education explains the concept with examples, not just "post updates"', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.moments.body')).toBeInTheDocument();
    [1, 2, 3, 4, 5].forEach((n) => expect(screen.getByText(`⚡ landing.moments.example${n}`)).toBeInTheDocument());
  });

  test('Business path renders the full create-account-to-tools flow', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    [1, 2, 3, 4, 5, 6].forEach((n) => expect(screen.getByText(`landing.business.step${n}_title`)).toBeInTheDocument());
  });

  test('Personal Classified path is distinguished from Business selling', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.personal_vs_business.personal_title')).toBeInTheDocument();
    expect(screen.getByText('landing.personal_vs_business.business_title')).toBeInTheDocument();
  });

  test('logistics, tracking and POS sections all render', () => {
    const onNavigate = jest.fn();
    render(<LandingEducation intent={null} onNavigate={onNavigate} />);
    expect(screen.getByText('landing.logistics.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.logistics.super_agent_title')).toBeInTheDocument();
    expect(screen.getByText('landing.tracking.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.pos.heading')).toBeInTheDocument();
    screen.getByText('landing.tracking.cta').click();
    expect(onNavigate).toHaveBeenCalledWith('TrackParcel');
  });

  test('all four feature cards (sell/service/classifieds/moments) always render with no intent', () => {
    render(<LandingEducation intent={null} onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.features.sell_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.service_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.classifieds_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.moments_title')).toBeInTheDocument();
  });
});

describe('LandingEducation — campaign intent changes emphasis only, never feature availability', () => {
  const cardOrder = (container) => {
    const titles = ['landing.features.sell_title', 'landing.features.service_title', 'landing.features.classifieds_title', 'landing.features.moments_title'];
    const positions = titles.map((t) => Array.from(container.querySelectorAll('div')).findIndex((el) => el.textContent === t));
    return titles[positions.indexOf(Math.min(...positions.filter((p) => p >= 0)))];
  };

  test('intent=service leads with the service card, but sell/classifieds/moments still all render', () => {
    const { container } = render(<LandingEducation intent="service" onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.features.sell_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.service_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.classifieds_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.moments_title')).toBeInTheDocument();
    expect(cardOrder(container)).toBe('landing.features.service_title');
  });

  test('intent=seller leads with the sell card, every other card still renders', () => {
    const { container } = render(<LandingEducation intent="seller" onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.features.sell_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.service_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.classifieds_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.moments_title')).toBeInTheDocument();
    expect(cardOrder(container)).toBe('landing.features.sell_title');
  });

  test('intent=classified leads with the classifieds card, every other card still renders', () => {
    const { container } = render(<LandingEducation intent="classified" onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.features.sell_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.service_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.classifieds_title')).toBeInTheDocument();
    expect(screen.getByText('landing.features.moments_title')).toBeInTheDocument();
    expect(cardOrder(container)).toBe('landing.features.classifieds_title');
  });

  test('intent never hides or replaces the rest of the Kentexa education — every section still renders regardless', () => {
    render(<LandingEducation intent="seller" onNavigate={jest.fn()} />);
    expect(screen.getByText('landing.what_is.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.business.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.how_it_works.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.after_signup.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.moments.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.logistics.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.trust.heading')).toBeInTheDocument();
    expect(screen.getByText('landing.final_cta.heading')).toBeInTheDocument();
  });
});
