import React from 'react';

/**
 * Loading.js - one KenteXa loading look (owner 2026-10-26: "the loading spin is
 * emoji, make it look old"). No emoji anywhere:
 *   <Spinner />      a small round spinner, for buttons and inline "working" lines;
 *   <Skeleton />     a grey block that gently fades while content loads;
 *   <SkeletonGrid /> a product grid placeholder (photo, price, title);
 *   <PageLoading />  a whole-page placeholder with a spinner and a label.
 */
const KEYFRAMES = `@keyframes kx-spin{to{transform:rotate(360deg)}}@keyframes kx-fade{0%,100%{opacity:1}50%{opacity:.45}}`;

export const Spinner = ({ size = 18, color = 'currentColor', track = 'rgba(127,127,127,0.25)', label }) => (
  <span role={label ? 'status' : undefined} aria-label={label} style={{ display: 'inline-flex', verticalAlign: 'middle', lineHeight: 0 }}>
    <style>{KEYFRAMES}</style>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ animation: 'kx-spin .8s linear infinite' }}>
      <circle cx="12" cy="12" r="9" stroke={track} strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  </span>
);

export const Skeleton = ({ width = '100%', height = 14, radius = 8, style }) => (
  <span aria-hidden="true" style={{ display: 'block', width, height, borderRadius: radius, background: '#eff3f4',
    animation: 'kx-fade 1.4s ease-in-out infinite', ...style }}>
    <style>{KEYFRAMES}</style>
  </span>
);

export const SkeletonGrid = ({ count = 4, min = 155 }) => (
  <div aria-busy="true" aria-label="Inapakia" data-testid="skeleton-grid"
    style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 12 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton height={0} radius={14} style={{ aspectRatio: '1 / 1', height: 'auto' }} />
        <Skeleton width="60%" height={16} />
        <Skeleton width="90%" height={12} radius={6} />
        <Skeleton width="50%" height={12} radius={6} />
      </div>
    ))}
  </div>
);

export const PageLoading = ({ label = 'Inapakia…', minHeight = '60vh' }) => (
  <div role="status" aria-live="polite" data-testid="page-loading"
    style={{ minHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#536471', fontSize: 15 }}>
    <Spinner size={28} color="#1d4ed8" />
    <span>{label}</span>
  </div>
);

export default Spinner;
