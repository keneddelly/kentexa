import React from 'react';
import { render, screen } from '@testing-library/react';
import CommerceCommentSection from './CommerceCommentSection';
import { commenterIdentity } from '../utils/publicActor';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

// A Personal account with no CommerceProfile: authorId stays authoritative, commerceProfile is null.
const personalNoProfile = {
  id: 1, type: 'comment', body: 'personal hello', commerceProfile: null,
  author: { id: 14, name: 'Bob', storeName: 'washing machine tz', avatarUrl: 'https://cdn/bob-avatar.png', logo: 'https://cdn/store-logo.png' },
};
const businessComment = {
  id: 2, type: 'comment', body: 'business hello',
  commerceProfile: { id: 68, displayName: 'Washing Machine Tz', photoUrl: 'https://cdn/biz.png' },
  author: { id: 14, name: 'Bob', storeName: 'washing machine tz', avatarUrl: 'https://cdn/bob-avatar.png', logo: 'https://cdn/store-logo.png' },
};

describe('commenterIdentity (shared comment identity)', () => {
  test('1. NULL profile: the author name is shown, never storeName', () => {
    expect(commenterIdentity(personalNoProfile).name).toBe('Bob');
    expect(commenterIdentity(personalNoProfile).name).not.toMatch(/washing/i);
  });

  test('2. NULL profile: the avatar is the Personal avatar, never the store logo', () => {
    expect(commenterIdentity(personalNoProfile).photo).toBe('https://cdn/bob-avatar.png');
    expect(commenterIdentity({ ...personalNoProfile, author: { ...personalNoProfile.author, avatarUrl: null } }).photo).toBeFalsy();
  });

  test('3/4. a canonical CommerceProfile (Business) continues to be displayed unchanged', () => {
    expect(commenterIdentity(businessComment)).toEqual({ name: 'Washing Machine Tz', photo: 'https://cdn/biz.png' });
    const noPhoto = { ...businessComment, commerceProfile: { id: 68, displayName: 'Washing Machine Tz', photoUrl: null } };
    expect(commenterIdentity(noPhoto).name).toBe('Washing Machine Tz');
  });

  test('a missing author yields no identity rather than a guess', () => {
    expect(commenterIdentity({ commerceProfile: null, author: null })).toEqual({ name: undefined, photo: undefined });
  });
});

describe('CommerceCommentSection renders the shared identity', () => {
  test('personal (no profile) shows name + avatar only; business comment unchanged', async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: url === '/comments'
        ? { pinned: null, items: [personalNoProfile, businessComment] }
        : { average: 0, total: 0, breakdown: {}, verifiedPurchaseCount: 0 },
    }));
    const { container } = render(
      <CommerceCommentSection entityType="product" entityId={1} sellerId={999} isLoggedIn={false} currentUser={null} onNavigate={jest.fn()} />,
    );
    expect(await screen.findByText('personal hello')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Washing Machine Tz')).toBeInTheDocument(); // the Business comment's canonical profile
    expect(screen.queryByText('washing machine tz')).toBeNull(); // storeName never used as a Personal name
    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs).toContain('https://cdn/bob-avatar.png');
    expect(srcs).toContain('https://cdn/biz.png');
    expect(srcs).not.toContain('https://cdn/store-logo.png');
  });
});
