// "Tumia mahali nilipo" (NEXT_STEPS.md section 18): the phone's GPS position
// with its accuracy, for door pickup. Sender-given; the agent sees it only
// after accepting the job.

export const LANDMARK_MIN = 5;
export const LANDMARK_MAX = 160;
export const WEAK_ACCURACY_M = 200;

export const landmarkOk = (text) => {
  const n = String(text || '').trim().length;
  return n >= LANDMARK_MIN && n <= LANDMARK_MAX;
};

/**
 * Resolves { latitude, longitude, accuracyM, capturedAt } or rejects with an
 * Error whose .code is 'unsupported' | 'denied' | 'unavailable' | 'timeout'.
 */
export function getPhonePosition(geo = (typeof navigator !== 'undefined' ? navigator.geolocation : undefined)) {
  return new Promise((resolve, reject) => {
    const fail = (code) => { const e = new Error(code); e.code = code; reject(e); };
    if (!geo || typeof geo.getCurrentPosition !== 'function') { fail('unsupported'); return; }
    geo.getCurrentPosition(
      (pos) => resolve({
        latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
        longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
        accuracyM: Math.round(pos.coords.accuracy),
        capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
      }),
      (err) => fail(err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
