import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

/** Line icons (no emoji), the same shapes as the web bottom bar. */
export type IconName = 'home' | 'search' | 'plus' | 'inbox' | 'kazi' | 'back' | 'chevron' | 'comment' | 'heart' | 'eye';

const paths: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h5v-6h4v6h5V9.5'],
  search: ['M21 21l-4.3-4.3'],
  plus: ['M12 5v14', 'M5 12h14'],
  inbox: ['M4 4h16v12H5.2L4 17.2z', 'M8 9h8', 'M8 12h5'],
  kazi: ['M3 7h18v13H3z', 'M8 7V4h8v3', 'M3 12h18'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 6l6 6-6 6'],
  comment: ['M4 5h16v11H8l-4 4z'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'],
};

export default function Icon({ name, size = 24, color = colors.ink, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {name === 'search' && <Circle cx={11} cy={11} r={7} />}
      {name === 'eye' && <Circle cx={12} cy={12} r={3} />}
      {paths[name].map((d) => <Path key={d} d={d} />)}
    </Svg>
  );
}
