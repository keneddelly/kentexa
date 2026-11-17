/** The approved KenteXa look (Twitter-style): same colours and sizes as the web app. */
export const colors = {
  ink: '#0f1419',
  muted: '#536471',
  line: '#eff3f4',
  border: '#cfd9de',
  bg: '#ffffff',
  soft: '#f7f9f9',
  brand: '#1d4ed8',
  accent: '#1d9bf0',
  danger: '#b91c1c',
};

export const type = {
  title: { fontSize: 20, fontWeight: '800' as const, color: colors.ink },
  name: { fontSize: 15, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 15, lineHeight: 20, color: colors.ink },
  meta: { fontSize: 14, color: colors.muted },
};
