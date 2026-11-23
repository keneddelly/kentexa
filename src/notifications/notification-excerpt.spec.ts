import { excerpt, NOTIFICATION_EXCERPT_MAX } from './in-app-notification.service';

describe('notification body excerpt', () => {
  it('keeps a short line exactly as written', () => {
    expect(excerpt('Habari, bidhaa yako imefika', NOTIFICATION_EXCERPT_MAX)).toBe('Habari, bidhaa yako imefika');
  });

  it('cuts a long post to the limit with an ellipsis', () => {
    const long = 'neno '.repeat(200);
    const out = excerpt(long, NOTIFICATION_EXCERPT_MAX);
    expect(out.length).toBeLessThanOrEqual(NOTIFICATION_EXCERPT_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('collapses line breaks so a post cannot fill the list', () => {
    expect(excerpt('Mstari wa kwanza\n\n\nMstari wa pili', 100)).toBe('Mstari wa kwanza Mstari wa pili');
  });

  it('handles empty input', () => {
    expect(excerpt(null, 50)).toBe('');
  });
});
