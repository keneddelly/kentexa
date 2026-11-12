/**
 * Public "Uza tena" page, kentexa.com/uza-tena (owner 2026-11-10, growth plan): the one link every
 * campaign points to. Explains reselling before sign-up: three steps, an example (labelled as an
 * example), the rules, short answers, and the live number of shops and products open for
 * resellers (GET /resale/stats: counts only, never a price). The button joins: signed in it opens
 * the catalogue; otherwise sign-up, then straight to Uza tena.
 */
import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const LINE = '#eff3f4';
const GREEN = '#166534';

const STEPS = [
  ['Jiunge bure', 'Namba ya simu iliyothibitishwa na kanuni 3 fupi. Hakuna ada, hakuna kusubiri.'],
  ['Chagua bidhaa, weka bei yako', 'Unaona bei unayolipa duka. Unaongeza bei yako juu; tofauti ni faida yako.'],
  ['Shiriki, mteja anaagiza', 'Weka Status ya WhatsApp au tuma kiungo. Duka linafikisha mzigo na kupokea malipo, kisha linakulipa faida.'],
];
const FAQ = [
  ['Nahitaji mtaji au duka?', 'Hapana. Huna mzigo wala duka. Duka lenye bidhaa ndilo linafikisha.'],
  ['Nalipwa lini?', 'Mteja akipokea mzigo, duka linakulipa faida yako kwa simu ndani ya siku 3. Unaona kila malipo kwenye "Faida zangu", na unathibitisha "Nimepokea".'],
  ['Duka likichelewa kunilipa?', 'Baada ya siku 7 bila kulipa, duka hilo halipati oda mpya za wauzaji mpaka likulipe. KenteXa inaona kila deni.'],
  ['Mteja akirudisha bidhaa?', 'Oda iliyoghairiwa au kurudishwa haina faida. Unapata faida pale tu oda inapokamilika.'],
  ['Mzigo unafika mikoani?', 'Ndiyo. Unasafirishwa kupitia ofisi za usafirishaji za KenteXa hadi mkoa wa mteja.'],
];

const btn = { height: 48, padding: '0 22px', borderRadius: 24, border: 'none', background: DK, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };

export default function UzaTena({ onNavigate, isLoggedIn }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get('/resale/stats').then((r) => setStats(r?.data || null)).catch(() => setStats(null));
  }, []);

  const join = () => {
    if (isLoggedIn) { onNavigate('MyResales', { tab: 'open' }); return; }
    try { localStorage.setItem('kentexa_after_login', 'MyResales'); } catch { /* storage blocked */ }
    onNavigate('Register');
  };

  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: DK, paddingBottom: 96 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: B, letterSpacing: 0.5 }}>KENTEXA UZA TENA</span>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.15, fontWeight: 800 }}>Pata kipato bila duka, bila mtaji</h1>
          <p style={{ margin: 0, fontSize: 17, color: GR, lineHeight: 1.5 }}>
            Uza bidhaa za maduka kwa bei yako. Duka linafikisha mzigo kwa mteja na linakulipa faida yako kwa kila mauzo.
          </p>
          {stats && stats.products > 0 && (
            <p data-testid="uza-stats" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: GREEN }}>
              Maduka {stats.shops.toLocaleString('en-US')} · bidhaa {stats.products.toLocaleString('en-US')} ziko tayari kuuzwa sasa
            </p>
          )}
          <div><button type="button" onClick={join} data-testid="uza-join" style={btn}>{isLoggedIn ? 'Anza kuuza' : 'Jiunge bure'}</button></div>
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Inavyofanya kazi</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map(([h, p], i) => (
              <li key={h} style={{ display: 'flex', gap: 12, padding: 14, border: `1px solid ${LINE}`, borderRadius: 14 }}>
                <span style={{ width: 32, height: 32, borderRadius: 16, background: B, color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b style={{ fontSize: 16 }}>{h}</b>
                  <span style={{ fontSize: 15, color: GR, lineHeight: 1.45 }}>{p}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section data-testid="uza-example" style={{ padding: 16, borderRadius: 16, background: '#f7f9f9', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 16 }}>Mfano</b>
          <span style={{ fontSize: 15 }}>Simu dukani: TZS 50,000</span>
          <span style={{ fontSize: 15 }}>Unalipa duka: TZS 42,000</span>
          <span style={{ fontSize: 15 }}>Unauza kwa: TZS 55,000</span>
          <b style={{ fontSize: 17, color: GREEN }}>Faida yako: TZS 13,000</b>
          <span style={{ fontSize: 13, color: GR }}>Huu ni mfano tu. Bei halisi unaziona ukishajiunga.</span>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Kanuni 3</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.6 }}>
            <li>Sema ukweli kuhusu bidhaa: picha na maelezo ni ya duka.</li>
            <li>Uza unachoweza kufikisha: mteja apate alichoagiza.</li>
            <li>Hakuna ada ya kujiunga. Faida ni kwa kila mauzo yaliyofika tu.</li>
          </ul>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Maswali</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} style={{ borderBottom: `1px solid ${LINE}`, padding: '10px 0' }}>
              <summary style={{ fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{q}</summary>
              <p style={{ margin: '8px 0 0', fontSize: 15, color: GR, lineHeight: 1.5 }}>{a}</p>
            </details>
          ))}
        </section>

        <section style={{ padding: 16, borderRadius: 16, border: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 16 }}>Una duka?</b>
          <span style={{ fontSize: 15, color: GR, lineHeight: 1.45 }}>Fungua bidhaa zako kwa wauzaji upate wauzaji wengi bure. Unalipa ada ya kawaida ya 2% tu, kwenye unachobaki nacho.</span>
          <div>
            <button type="button" onClick={() => { if (isLoggedIn) { onNavigate('MyResales', { tab: 'supplier' }); return; } try { localStorage.setItem('kentexa_after_login', 'MyResales'); } catch { /* storage blocked */ } onNavigate('Register'); }}
              style={{ ...btn, background: '#fff', color: DK, border: '1px solid #cfd9de' }}>Fungua bidhaa zangu</button>
          </div>
        </section>

        <div><button type="button" onClick={join} style={btn}>{isLoggedIn ? 'Anza kuuza' : 'Jiunge bure'}</button></div>
      </div>
    </main>
  );
}
