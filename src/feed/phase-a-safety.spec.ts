import { BadRequestException } from '@nestjs/common';
import { assertPublishInput } from './publish-input';
import { moderateCommentBody } from './comment-moderation';

const prompts: any = { moderationPrompt: () => ({ system: 's', schema: {}, schemaName: 'm' }) };
const ai = (verdict: string, reason = 'r') => ({ generate: jest.fn().mockResolvedValue({ data: { verdict, reason } }) }) as any;

describe('feed publish input (phase A)', () => {
  const ok = { type: 'moment', title: 'Mzigo mpya umefika', intent: 'update', visibility: 'followers', price: 420000 };

  it('accepts what the app and the product, service and listing Moments send', () => {
    expect(() => assertPublishInput(ok)).not.toThrow();
    expect(() => assertPublishInput({ type: 'looking_for', title: 'Natafuta fundi', category: 'services' })).not.toThrow();
    expect(() => assertPublishInput({ type: 'moment', title: 'Taa', linkedEntityType: 'product', linkedEntityId: 4 })).not.toThrow();
  });

  it('refuses unknown values, empty text, huge text and bad numbers or dates', () => {
    for (const bad of [
      { ...ok, type: 'ad' }, { ...ok, intent: 'spam' }, { ...ok, visibility: 'secret' },
      { ...ok, title: '   ' }, { ...ok, body: 'x'.repeat(5001) }, { ...ok, price: 'abc' },
      { ...ok, price: -5 }, { ...ok, expiresAt: 'kesho' }, { ...ok, title: 42 }, null,
    ]) {
      expect(() => assertPublishInput(bad)).toThrow(BadRequestException);
    }
  });
});

describe('feed comment moderation (phase A: the same check as product comments)', () => {
  it('a blocked comment is refused', async () => {
    await expect(moderateCommentBody(ai('blocked', 'matusi'), prompts, 'maneno mabaya')).rejects.toThrow(BadRequestException);
  });

  it('a flagged comment is kept with its flag for review; a clean one has no reason', async () => {
    expect(await moderateCommentBody(ai('flagged', 'shaka'), prompts, 'nipigie sasa')).toEqual({ moderationFlag: 'flagged', moderationReason: 'shaka' });
    expect(await moderateCommentBody(ai('clean'), prompts, 'Bei nzuri')).toEqual({ moderationFlag: 'clean', moderationReason: null });
  });

  it('fails open: AI down, AI missing or no text never blocks a comment', async () => {
    const down = { generate: jest.fn().mockRejectedValue(new Error('timeout')) } as any;
    expect(await moderateCommentBody(down, prompts, 'Habari')).toEqual({ moderationFlag: null, moderationReason: null });
    expect(await moderateCommentBody(undefined, undefined, 'Habari')).toEqual({ moderationFlag: null, moderationReason: null });
    expect(await moderateCommentBody(ai('blocked'), prompts, '  ')).toEqual({ moderationFlag: null, moderationReason: null });
  });
});
