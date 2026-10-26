import React from 'react';

/**
 * One set of line icons for menus and lists (owner 2026-10: professional, no emoji).
 * Pages name the icon ('store', 'truck', ...); an unknown name renders as plain text,
 * so a short glyph like '@' still works.
 */
export const LINE_ICONS = {
  office: 'M4 21V6.2L12 3l8 3.2V21h-6v-5h-4v5z',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0114 0v1M16 3.3a4 4 0 010 7.4M22 21v-1a6 6 0 00-4-5.6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  money: 'M3 6h18v12H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 9v.01M18 15v.01',
  bus: 'M5 4h14v12H5zM5 11h14M8 19v-3M16 19v-3M8 14h.01M16 14h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  moto: 'M5 18a3 3 0 100-6 3 3 0 000 6zM19 18a3 3 0 100-6 3 3 0 000 6zM8 15h6l3-6h-4M14 9l-2-4H9',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  phone: 'M7 2h10v20H7zM11 18h2',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  wrench: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  truck: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  chat: 'M12 3.5c4.97 0 9 3.6 9 8.05 0 4.45-4.03 8.05-9 8.05-1.1 0-2.15-.17-3.12-.5L3.5 20.5l1.45-4.1A7.6 7.6 0 013 11.55C3 7.1 7.03 3.5 12 3.5z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-2.6-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 010-4h.1a1.6 1.6 0 001.1-2.6l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V3a2 2 0 014 0v.1a1.6 1.6 0 002.6 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  idcard: 'M3 5h18v14H3zM8 11a2 2 0 100-4 2 2 0 000 4zM5 16a3 3 0 016 0M14 9h4M14 13h4',
  check: 'M5 12.5l4.5 4.5L19 7',
  megaphone: 'M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 010 6',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  bank: 'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 21h8M10 17h4',
  gem: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 6 3-6M12 21l-3-12M12 21l3-12',
  sprout: 'M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 10c0-3 2.5-5 6-5 0 3-2.5 5-6 5z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  heart: 'M12 20s-7.5-4.6-9-9.5C2 6.8 4.6 4 7.6 4c1.9 0 3.4 1 4.4 2.5C13 5 14.5 4 16.4 4c3 0 5.6 2.8 4.6 6.5-1.5 4.9-9 9.5-9 9.5z',
  plus: 'M12 5v14M5 12h14',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  handshake: 'M2 12l4-4 4 2 3-2 4 1 5 3M6 8l-4 6 5 4 2-2M22 12l-3 4-5 3-3-2M10 16l2 2M13 14l2 2',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  home: 'M3.5 10.2L12 3.3l8.5 6.9V20a1 1 0 01-1 1h-5v-6.5h-5V21h-5a1 1 0 01-1-1z',
  cross: 'M6 6l12 12M18 6L6 18',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  headset: 'M4 14v-2a8 8 0 0116 0v2M4 14h3v6H4zM17 14h3v6h-3zM20 20a3 3 0 01-3 2h-3',
  key: 'M14 10a4 4 0 10-3.5 4L7 17.5V20h2.5v-2h2v-2l1-1A4 4 0 0014 10zM15.5 8.5h.01',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
};

export const LineIcon = ({ name, size = 22, color = 'currentColor', strokeWidth = 2, style }) => {
  const d = LINE_ICONS[name];
  if (!d) return name ? <span aria-hidden="true" style={{ fontSize: size * 0.8, fontWeight: 700, lineHeight: 1, ...style }}>{name}</span> : null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d={d} />
    </svg>
  );
};

export default LineIcon;
