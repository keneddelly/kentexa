import {
  ALLOWED_INTENTS, normalizeIntent, destinationForIntent, setIntent, getIntent,
  clearIntent, consumeIntent, intentFromSearch,
} from './campaignIntent';

describe('normalizeIntent / allowlist', () => {
  test('accepts each allowed intent', () => {
    ALLOWED_INTENTS.forEach((intent) => expect(normalizeIntent(intent)).toBe(intent));
  });
  test('is case/whitespace tolerant', () => {
    expect(normalizeIntent(' Service ')).toBe('service');
    expect(normalizeIntent('SELLER')).toBe('seller');
  });
  test('rejects anything off the allowlist', () => {
    expect(normalizeIntent('buyer')).toBeNull();
    expect(normalizeIntent('admin')).toBeNull();
    expect(normalizeIntent('<script>alert(1)</script>')).toBeNull();
    expect(normalizeIntent('')).toBeNull();
    expect(normalizeIntent(null)).toBeNull();
  });
});

describe('destinationForIntent', () => {
  test('maps each valid intent to a real destination page', () => {
    expect(destinationForIntent('service')).toBe('PostService');
    expect(destinationForIntent('classified')).toBe('CreateClassified');
    expect(destinationForIntent('seller')).toBe('BecomeSeller');
  });
  test('invalid intent maps to no destination — never becomes an arbitrary navigation target', () => {
    expect(destinationForIntent('not-a-real-intent')).toBeNull();
    expect(destinationForIntent('SellerDashboard')).toBeNull(); // can't smuggle an operational page in as "intent"
  });
});

describe('intentFromSearch (pure URL parsing)', () => {
  test('reads a valid intent off a query string', () => {
    expect(intentFromSearch('?intent=service&lang=en')).toBe('service');
    expect(intentFromSearch('?lang=sw&intent=classified')).toBe('classified');
  });
  test('ignores an invalid or missing intent', () => {
    expect(intentFromSearch('?intent=hacker')).toBeNull();
    expect(intentFromSearch('?lang=en')).toBeNull();
    expect(intentFromSearch('')).toBeNull();
  });
});

describe('sessionStorage persistence lifecycle', () => {
  beforeEach(() => { sessionStorage.clear(); });

  test('setIntent persists a valid intent; getIntent reads it back', () => {
    expect(setIntent('service')).toBe('service');
    expect(getIntent()).toBe('service');
  });

  test('setIntent ignores an invalid value and stores nothing', () => {
    expect(setIntent('not-real')).toBeNull();
    expect(getIntent()).toBeNull();
  });

  test('consumeIntent returns the value once, then clears it', () => {
    setIntent('classified');
    expect(consumeIntent()).toBe('classified');
    expect(getIntent()).toBeNull();
  });

  test('clearIntent removes a stored intent', () => {
    setIntent('seller');
    clearIntent();
    expect(getIntent()).toBeNull();
  });

  test('a stale (expired) intent does not leak into a later read', () => {
    const now = Date.now();
    sessionStorage.setItem('kentexa_intent', JSON.stringify({ value: 'seller', ts: now - 7 * 60 * 60 * 1000 }));
    expect(getIntent()).toBeNull();
  });

  test('malformed stored data is treated as absent, not thrown', () => {
    sessionStorage.setItem('kentexa_intent', 'not json');
    expect(getIntent()).toBeNull();
  });

  test('intent is independent from language — setting one never touches kentexa_lang', () => {
    localStorage.clear();
    setIntent('seller');
    expect(localStorage.getItem('kentexa_lang')).toBeNull();
  });
});
