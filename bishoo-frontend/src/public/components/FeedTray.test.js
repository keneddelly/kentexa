import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArticleTray, HashtagTray, ListTray, PollTray, QuestionTray } from './FeedTray';

/** Feed trays (owner approved 2026-11-16). */
test('conversation trays open the right page; empty trays show nothing', () => {
  const onNavigate = jest.fn();
  render(<>
    <ArticleTray onNavigate={onNavigate} items={[{ id: 4, title: 'jinsi ya kuanza', owner: 'asha', minutes: 6, cover: null }]} />
    <QuestionTray onNavigate={onNavigate} items={[{ id: 5, words: 'bei ya mahindi leo?', owner: 'juma' }]} />
    <PollTray onNavigate={onNavigate} items={[{ id: 6, words: 'siku gani?', owner: 'neema', votes: 9, closesAt: new Date(Date.now() + 86400000 * 2).toISOString() }]} />
    <HashtagTray onNavigate={onNavigate} items={[{ key: 'mitumba', display: 'Mitumba', posts: 12 }]} />
  </>);
  expect(screen.getByTestId('tray-articles')).toHaveTextContent('Jinsi ya kuanza');
  expect(screen.getByTestId('tray-articles')).toHaveTextContent('Asha · dakika 6');
  fireEvent.click(screen.getByTestId('tray-question-5'));
  expect(onNavigate).toHaveBeenCalledWith('PostDetail-5-comments');
  expect(screen.getByTestId('tray-poll-6')).toHaveTextContent('kura 9');
  fireEvent.click(screen.getByTestId('tray-tag-mitumba'));
  expect(onNavigate).toHaveBeenCalledWith('Tag-mitumba');
  const { container } = render(<QuestionTray onNavigate={onNavigate} items={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test('list trays: offices, agents, providers, hotels, with "Ona zote" when there is a full list', () => {
  const onOpen = jest.fn();
  const onSeeAll = jest.fn();
  render(<ListTray testid="tray-hotels" title="Hoteli na chakula" items={[{ key: 'h1', name: 'mama ntilie', line: 'Inapokea oda sasa', page: 'HotelMenu-1' }]} onOpen={onOpen} onSeeAll={onSeeAll} />);
  expect(screen.getByTestId('tray-hotels')).toHaveTextContent('Mama Ntilie');
  fireEvent.click(screen.getByText('Mama Ntilie'));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ page: 'HotelMenu-1' }));
  fireEvent.click(screen.getByTestId('tray-hotels-all'));
  expect(onSeeAll).toHaveBeenCalled();
});
