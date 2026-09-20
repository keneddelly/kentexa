import { actorProfileParams, canOpenActor, isActorUnresolved } from './publicActor';

const wm = { id: 1, commerceProfileId: 2, actorResolved: true, actorType: 'BUSINESS' };
const bobPersonal = { id: 1, commerceProfileId: 1, actorResolved: true, actorType: 'PERSONAL' };
const bobElectronics = { id: 1, commerceProfileId: 3, actorResolved: true, actorType: 'BUSINESS' };
const legacy = { id: 1, commerceProfileId: null, actorResolved: false, actorType: null };

test('Business and Personal actors of the same owner navigate/message to their own exact profile id', () => {
  expect(actorProfileParams(wm)).toEqual({ commerceProfileId: 2 });
  expect(actorProfileParams(bobPersonal)).toEqual({ commerceProfileId: 1 });
  expect(actorProfileParams(bobElectronics)).toEqual({ commerceProfileId: 3 });
  expect([wm, bobPersonal, bobElectronics].every(canOpenActor)).toBe(true);
});

test('an unresolved historical actor is never opened/messaged (no fallback to the owner Personal profile)', () => {
  expect(isActorUnresolved(legacy)).toBe(true);
  expect(canOpenActor(legacy)).toBe(false);
  expect(actorProfileParams(legacy)).toBeUndefined();
});

test('an older response without actorResolved keeps existing behavior', () => {
  expect(canOpenActor({ id: 5 })).toBe(true);
});
