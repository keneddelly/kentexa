/**
 * The KenteXa app look (owner approved 2026-11-18, ux-mock): Inter in four weights (bundled, so
 * every phone shows the same letters), Twitter-size text, near-black ink, soft grey lines, KenteXa
 * blue for actions, pink for Penda, teal for Makala.
 */
export const F = {
  regular: 'Inter-Regular',
  semi: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  black: 'Inter-ExtraBold',
};

export const colors = {
  ink: '#0f1419',
  muted: '#536471',
  faint: '#8b98a5',
  line: '#eff3f4',
  border: '#cfd9de',
  bg: '#ffffff',
  soft: '#f7f9f9',
  brand: '#1d4ed8',
  brandSoft: '#eff6ff',
  accent: '#1d9bf0',
  like: '#f91880',
  teal: '#0f766e',
  danger: '#b91c1c',
};

export const type = {
  title: { fontSize: 20, fontFamily: F.black, color: colors.ink, letterSpacing: -0.3 },
  name: { fontSize: 15, fontFamily: F.bold, color: colors.ink },
  body: { fontSize: 15, lineHeight: 20, fontFamily: F.regular, color: colors.ink, letterSpacing: -0.1 },
  big: { fontSize: 17, lineHeight: 24, fontFamily: F.regular, color: colors.ink, letterSpacing: -0.1 },
  meta: { fontSize: 15, fontFamily: F.regular, color: colors.muted },
  small: { fontSize: 13, fontFamily: F.regular, color: colors.muted },
};
