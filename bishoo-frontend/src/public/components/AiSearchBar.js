/**
 * AiSearchBar.js — Kentexa's "front door": one input that classifies what
 * the user is looking for (product / classified / service) via the backend
 * AI search-intent endpoint, then routes straight to pre-filtered results.
 *
 * Falls back to a plain (unclassified) search if the AI call fails or times
 * out — Search.js already knows how to handle the absence of `aiIntent`.
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import { theme } from '../Theme';

export default function AiSearchBar({ onNavigate }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || loading) return;
      setLoading(true);
      try {
        const res = await api.get('/search/intent', { params: { q: trimmed } });
        onNavigate('Search-' + trimmed, { aiIntent: res.data });
      } catch {
        onNavigate('Search-' + trimmed);
      } finally {
        setLoading(false);
      }
    },
    [query, loading, onNavigate],
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: theme.white,
        borderRadius: 999,
        padding: '10px 8px 10px 16px',
        boxShadow: theme.shadow,
        border: `1px solid ${theme.border}`,
      }}
    >
      <span style={{ fontSize: 16 }}>🔍</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.front_door_placeholder')}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: theme.text,
          backgroundColor: 'transparent',
        }}
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        style={{
          border: 'none',
          backgroundColor: theme.primary,
          color: theme.white,
          fontSize: 13,
          fontWeight: 700,
          padding: '8px 16px',
          borderRadius: 999,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading || !query.trim() ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '…' : t('search.front_door_button')}
      </button>
    </form>
  );
}
