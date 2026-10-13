import { identityState, needsIdentityStep, afterIdentitySent } from './identityState';

// One answer to "is this person's ID verified?" for every form.
test('the four states, from the server identity status (never the phone flag)', () => {
  expect(identityState({ status: 'verified', level: 4 })).toBe('verified');
  expect(identityState({ status: 'pending', level: 0 })).toBe('waiting');
  expect(identityState({ status: 'rejected' })).toBe('rejected');
  expect(identityState({ status: 'not_submitted', level: 0 })).toBe('missing');
  expect(identityState(null)).toBeNull();
});

test('only a missing or rejected ID shows the ID step; never verified or waiting', () => {
  expect(needsIdentityStep({ status: 'not_submitted' })).toBe(true);
  expect(needsIdentityStep({ status: 'rejected' })).toBe(true);
  expect(needsIdentityStep({ status: 'pending', level: 0 })).toBe(false);
  expect(needsIdentityStep({ status: 'verified', level: 1 })).toBe(false);
  expect(needsIdentityStep(null)).toBe(false);
});

test('after "Tuma kitambulisho": waiting, but a verified one stays verified', () => {
  expect(afterIdentitySent({ status: 'not_submitted', level: 0 })).toMatchObject({ status: 'pending', level: 0 });
  expect(afterIdentitySent({ status: 'verified', level: 4 })).toEqual({ status: 'verified', level: 4 });
});
