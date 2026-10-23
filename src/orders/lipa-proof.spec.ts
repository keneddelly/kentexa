import { v2 as cloudinary } from 'cloudinary';
import { LIPA_PROOF_REF, lipaProofRef, signedLipaProofUrl } from './lipa-proof';

describe('Lipa Namba payment screenshot is private', () => {
  beforeAll(() => cloudinary.config({ cloud_name: 'kentexa', api_key: '123', api_secret: 'secret' }));

  it('accepts only our private proof reference, never a public link', () => {
    expect(LIPA_PROOF_REF.test(lipaProofRef('kentexa/payment-proofs/abc123', 'jpg'))).toBe(true);
    for (const bad of [
      'https://res.cloudinary.com/kentexa/image/upload/v1/slip.jpg',
      'kentexa/digital-products/abc123.jpg',
      'kentexa/payment-proofs/../x.jpg',
      'kentexa/payment-proofs/abc123.pdf',
    ]) {
      expect(LIPA_PROOF_REF.test(bad)).toBe(false);
    }
  });

  it('gives a signed private link that expires after 10 minutes', () => {
    const now = Date.UTC(2026, 9, 23, 12, 0, 0);
    const url = signedLipaProofUrl('kentexa/payment-proofs/abc123.jpg', now)!;
    expect(url).toContain('api.cloudinary.com');
    const q = new URL(url).searchParams;
    expect(q.get('public_id')).toBe('kentexa/payment-proofs/abc123');
    expect(q.get('format')).toBe('jpg');
    expect(q.get('type')).toBe('private');
    expect(q.get('expires_at')).toBe(String(now / 1000 + 600));
    expect(q.get('signature')).toBeTruthy();
  });

  it('gives no link for an empty or non-private value', () => {
    expect(signedLipaProofUrl(null)).toBeNull();
    expect(signedLipaProofUrl('https://res.cloudinary.com/kentexa/image/upload/v1/slip.jpg')).toBeNull();
  });
});
