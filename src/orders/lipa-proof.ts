import { v2 as cloudinary } from 'cloudinary';

/**
 * Lipa Namba payment screenshots are private (owner 2026-10-23): uploaded by
 * POST /upload/payment-proof as Cloudinary type 'private', never public.
 * The order keeps only the reference "<publicId>.<format>" (in order."lipaProofUrl");
 * a viewer gets a short-lived signed link after the authorization check.
 */
export const LIPA_PROOF_FOLDER = 'kentexa/payment-proofs';
export const LIPA_PROOF_REF = /^kentexa\/payment-proofs\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp|heic|heif)$/;
const LINK_SECONDS = 10 * 60;

export function lipaProofRef(publicId: string, format: string): string {
  return `${publicId}.${format}`;
}

/** Signed link valid for 10 minutes, or null when the stored value is not a private proof reference. */
export function signedLipaProofUrl(ref: string | null | undefined, now = Date.now()): string | null {
  if (!ref || !LIPA_PROOF_REF.test(ref)) return null;
  const dot = ref.lastIndexOf('.');
  return cloudinary.utils.private_download_url(ref.slice(0, dot), ref.slice(dot + 1), {
    resource_type: 'image',
    type: 'private',
    expires_at: Math.floor(now / 1000) + LINK_SECONDS,
  });
}
