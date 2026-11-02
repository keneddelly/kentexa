/**
 * The ready start the first post opens with (owner 2026-11-02, "strong ask, can skip");
 * the person can change every word. Only their own first name and town.
 */
export const firstPostStart = (user, city) => {
  const name = String(user?.name || '').trim().split(/\s+/)[0];
  return `Habari! Mimi ni ${name || 'mgeni'}${city ? ` kutoka ${city}` : ''}. Nimejiunga KenteXa leo.`;
};
