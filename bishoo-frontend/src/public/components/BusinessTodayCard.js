/**
 * "Leo kwa biashara": today's real counts and the AI insight, on Business Home (owner 2026-11-09
 * audit: the only AI business insight sat on a page few people open). Counts come from
 * GET /business/:id/today; the insight (POST .../today/insight) is asked only after the counts
 * show, and if AI is down the card simply shows no insight. Never invents numbers.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';

const DK = '#0F172A';
const GR = '#64748B';
const LINE = '#e2e8f0';

export default function BusinessTodayCard({ businessId, onNavigate }) {
  const { i18n } = useTranslation();
  const [today, setToday] = useState(null);
  const [insight, setInsight] = useState(null);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (!businessId) return undefined;
    let gone = false;
    setToday(null); setInsight(null);
    api.get(`/business/${businessId}/today`).then(({ data }) => {
      if (gone || !data) return;
      setToday(data);
      setThinking(true);
      api.post(`/business/${businessId}/today/insight`, { today: data, language: i18n?.language })
        .then((r) => { if (!gone) setInsight(r.data?.insight ? r.data : null); })
        .catch(() => undefined)
        .finally(() => { if (!gone) setThinking(false); });
    }).catch(() => undefined);
    return () => { gone = true; };
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!today) return null;
  const n = [
    ['Oda leo', today.commerce?.ordersToday],
    ['Malipo leo', today.commerce?.paymentsCompletedToday],
    ['Ankara zinasubiri', today.commerce?.pendingInvoicesCount],
    ['Waliotembelea', today.customerActivity?.profileVisitsToday],
    ['Wafuasi wapya', today.customerActivity?.newFollowersToday],
    ['Waliotazama bidhaa', today.customerActivity?.productViewsToday],
  ];
  return (
    <section data-testid="business-today-card" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, margin: '0 0 18px', color: DK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <strong style={{ fontSize: 16 }}>Leo kwa biashara</strong>
        <button type="button" onClick={() => onNavigate(`BusinessDashboard-${businessId}`)}
          style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', padding: 0 }}>Ona zaidi</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {n.map(([label, v]) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{Number(v ?? 0).toLocaleString('en-US')}</div>
            <div style={{ fontSize: 12, color: GR, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {(thinking || insight) && (
        <div data-testid="business-insight" style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12, fontSize: 14, lineHeight: 1.5 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f1419', marginBottom: 4 }}>Ushauri wa KenteXa AI</div>
          {!insight ? <span style={{ color: GR }}>Inaandaa ushauri...</span> : (
            <>
              <div>{insight.insight}</div>
              {insight.recommendation && <div style={{ marginTop: 6, fontWeight: 700 }}>{insight.recommendation}</div>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
