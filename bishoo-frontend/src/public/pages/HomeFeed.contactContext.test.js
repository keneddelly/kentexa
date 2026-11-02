import { messageContextFor } from './HomeFeed';

jest.mock('../../api/api', () => ({ get: jest.fn(), post: jest.fn() }));

describe('Contact keeps what the chat started from (phase C, 2026-11-02)', () => {
  it('a real post is the context', () => {
    expect(messageContextFor({ id: 7 }, 'classified')).toEqual({ contextType: 'moment', contextId: 7 });
  });
  it('a listing in the feed without a post is that listing', () => {
    expect(messageContextFor({ id: 'cls-4', entityId: 4 }, 'classified')).toEqual({ contextType: 'classified', contextId: 4 });
  });
  it('nothing known, nothing sent', () => {
    expect(messageContextFor({ id: 'rte-1' }, 'classified')).toEqual({});
  });
});
