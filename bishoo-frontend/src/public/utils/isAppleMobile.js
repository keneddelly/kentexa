export const isAppleMobile = (nav = typeof navigator === 'undefined' ? {} : navigator) => (
  /iPad|iPhone|iPod/.test(nav.userAgent || '') ||
  (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
);
