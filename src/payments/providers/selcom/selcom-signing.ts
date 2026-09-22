import * as crypto from 'crypto';

/**
 * Selcom Checkout API request signing, per developers.selcommobile.com's
 * own "Authentication" section:
 *
 *   Authorization: SELCOM <Base64(API_KEY)>
 *   Timestamp:     ISO-8601 (YYYY-MM-DDThh:mm:ssTZD)
 *   Digest-Method: HS256
 *   Digest:        Base64( HMAC_SHA256(signingString, API_SECRET) )
 *   Signed-Fields: comma-separated list of the signed field names, in the
 *                  SAME order used to build signingString (timestamp is
 *                  always first and is NOT itself listed in Signed-Fields)
 *
 *   signingString = "timestamp=<ts>&field1=value1&field2=value2&..."
 *
 * `fields` here is the ordered list of top-level request-body keys we are
 * actually sending (the docs' own worked examples sign exactly the request
 * payload's own keys, in payload order — there is no separate/implied
 * field set for create-order-minimal or wallet-payment beyond "what you
 * sent"; only the order-status GET documents an explicit Signed-Fields
 * value, which is a single-field case of the same rule: `order_id`).
 */
export interface SelcomSignedRequest {
  headers: {
    Authorization: string;
    Timestamp: string;
    'Digest-Method': 'HS256';
    Digest: string;
    'Signed-Fields': string;
    Accept: 'application/json';
    'Content-Type': 'application/json';
  };
}

export function buildSigningString(timestamp: string, fields: Array<[string, string]>): string {
  const parts = [`timestamp=${timestamp}`, ...fields.map(([k, v]) => `${k}=${v}`)];
  return parts.join('&');
}

export function isoTimestamp(now: Date = new Date()): string {
  // YYYY-MM-DDThh:mm:ssTZD — Node's toISOString() is UTC with a trailing
  // "Z", which IS a valid ISO-8601 timezone designator (TZD = "Z" or
  // "+hh:mm"), so this satisfies the documented format without needing a
  // separate offset-formatting helper.
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function signSelcomRequest(
  apiKey: string,
  apiSecret: string,
  fields: Array<[string, string]>,
  now: Date = new Date(),
): SelcomSignedRequest {
  const timestamp = isoTimestamp(now);
  const signingString = buildSigningString(timestamp, fields);
  const digest = crypto.createHmac('sha256', apiSecret).update(signingString).digest('base64');
  return {
    headers: {
      Authorization: `SELCOM ${Buffer.from(apiKey).toString('base64')}`,
      Timestamp: timestamp,
      'Digest-Method': 'HS256',
      Digest: digest,
      'Signed-Fields': fields.map(([k]) => k).join(','),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };
}

/** Extracts the ordered [key, stringValue] pairs from a plain JSON body, in insertion order, for signing. */
export function fieldsFromBody(body: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}
