import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/api';
import { topicLabel } from '../utils/feedPresentation';

const CSS = `
.kxjh{--ink:#101828;--muted:#667085;--line:#e7ebf2;--blue:#2457d6;min-height:100vh;background:#f7f9fc;color:var(--ink);font-family:inherit}
.kxjh *{box-sizing:border-box}
.kxjh-wrap{width:min(1120px,100%);margin:0 auto;padding:0 18px}
.kxjh-head{background:#fff;border-bottom:1px solid var(--line)}
.kxjh-top{height:64px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.kxjh-brand{font-size:21px;font-weight:900;letter-spacing:-.6px;color:var(--ink)}
.kxjh-brand span{color:#2563eb}
.kxjh-btn{min-height:42px;padding:0 16px;border:1px solid #d8deea;border-radius:11px;background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:750;cursor:pointer}
.kxjh-btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.kxjh-btn:disabled{opacity:.55;cursor:wait}
.kxjh-hero{padding:30px 0 24px;background:linear-gradient(120deg,#0b1533,#183779 72%,#2457d6);color:#fff}
.kxjh-hero h1{font-size:clamp(28px,4vw,40px);line-height:1.12;letter-spacing:-1px;margin:0 0 9px}
.kxjh-hero p{max-width:690px;margin:0;color:#dce7ff;font-size:16px;line-height:1.6}
.kxjh-tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.kxjh-tools input{min-height:46px;flex:1 1 250px;max-width:520px;border:1px solid #ffffff55;border-radius:11px;padding:0 14px;background:#fff;color:var(--ink);font:inherit;font-size:15px;outline:none}
.kxjh-tools .kxjh-btn{min-height:46px}
.kxjh-main{padding:22px 0 60px}
.kxjh-tabs{display:flex;gap:8px;overflow:auto;padding-bottom:14px}
.kxjh-tab{border:1px solid var(--line);border-radius:999px;background:#fff;padding:10px 16px;font:inherit;font-size:14px;font-weight:750;white-space:nowrap;cursor:pointer;color:var(--muted)}
.kxjh-tab[aria-pressed=true]{background:#eaf0ff;color:#1d4ed8;border-color:#c9d8ff}
.kxjh-section{margin-top:18px}
.kxjh-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.kxjh-section-head h2{font-size:19px;letter-spacing:-.3px;margin:0}
.kxjh-section-head span{font-size:13px;color:var(--muted)}
.kxjh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.kxjh-card{background:#fff;border:1px solid var(--line);border-radius:15px;padding:16px;display:flex;gap:13px;min-width:0;align-items:flex-start}
.kxjh-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:14px;background:#edf2ff;color:#244fc1;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900}
.kxjh-info{min-width:0;flex:1}
.kxjh-info h3{font-size:16px;line-height:1.3;margin:1px 0 5px;overflow-wrap:anywhere}
.kxjh-info p{font-size:14px;line-height:1.5;color:var(--muted);margin:0 0 9px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kxjh-meta{font-size:12px;color:var(--muted);display:flex;gap:7px;flex-wrap:wrap}
.kxjh-card-action{margin-top:12px;display:flex;justify-content:flex-end}
.kxjh-empty,.kxjh-state{background:#fff;border:1px dashed #d5dce8;border-radius:15px;padding:26px;text-align:center;color:var(--muted);font-size:14px;line-height:1.6}
.kxjh-empty strong{display:block;color:var(--ink);font-size:16px;margin-bottom:5px}
.kxjh-topics{display:flex;gap:8px;overflow:auto;padding:2px 0 5px}
.kxjh-topic{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;white-space:nowrap;cursor:pointer;color:#344054}
.kxjh-topic[aria-pressed=true]{border-color:#2457d6;background:#edf3ff;color:#1d4ed8}
.kxjh-error{color:#b42318}
@media(max-width:680px){.kxjh-grid{grid-template-columns:1fr}.kxjh-hero{padding:26px 0 22px}.kxjh-main{padding-top:16px}.kxjh-wrap{padding-left:14px;padding-right:14px}.kxjh-card{padding:14px}}
`;

const initials = (name) => String(name || 'J').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const countLabel = (n) => `Wanachama ${Number(n || 0).toLocaleString('en-US')}`;

export default function JumuiyaHome({ onNavigate = () => {}, isLoggedIn = false }) {
  const [mine, setMine] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState('');
  const [tab, setTab] = useState('discover');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const requests = [
      isLoggedIn ? api.get('/communities', { params: { mine: '1' } }) : Promise.resolve({ data: [] }),
      api.get('/communities', { params: topic ? { topic } : {} }),
      api.get('/feed/topics'),
    ];
    const [mineResult, discoverResult, topicsResult] = await Promise.allSettled(requests);
    if (mineResult.status === 'fulfilled') setMine(Array.isArray(mineResult.value?.data) ? mineResult.value.data : []);
    if (discoverResult.status === 'fulfilled') setDiscover(Array.isArray(discoverResult.value?.data) ? discoverResult.value.data : []);
    else setError('Imeshindikana kupakia jumuiya. Tafadhali jaribu tena.');
    if (topicsResult.status === 'fulfilled') setTopics(Array.isArray(topicsResult.value?.data) ? topicsResult.value.data : []);
    setLoading(false);
  }, [isLoggedIn, topic]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const source = tab === 'mine' ? mine : discover;
    const q = query.trim().toLocaleLowerCase();
    if (!q) return source;
    return source.filter((c) => [c.name, c.purpose, topicLabel(c.topicKey)].some((v) => String(v || '').toLocaleLowerCase().includes(q)));
  }, [tab, mine, discover, query]);

  const join = async (community) => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    setJoining(community.id);
    try {
      const result = await api.post(`/communities/${community.id}/join`);
      const updated = result?.data || community;
      setDiscover((old) => old.filter((item) => item.id !== community.id));
      if (updated.myStatus === 'active') {
        setMine((old) => [updated, ...old.filter((item) => item.id !== updated.id)]);
      } else {
        setDiscover((old) => [{ ...community, ...updated }, ...old]);
      }
    } catch {
      setError('Hatukuweza kukamilisha ombi lako. Tafadhali jaribu tena.');
    } finally {
      setJoining(null);
    }
  };

  const openCommunity = (id) => onNavigate(`Community-${id}`);

  return (
    <main className="kxjh">
      <style>{CSS}</style>
      <header className="kxjh-head">
        <div className="kxjh-wrap kxjh-top">
          <div className="kxjh-brand">kentexa<span>.</span> <span style={{ color: '#667085', fontSize: 14, fontWeight: 700, letterSpacing: 0 }}> / Jumuiya</span></div>
          <button type="button" className="kxjh-btn" onClick={() => onNavigate('Home')}>Rudi Mwanzo</button>
        </div>
      </header>

      <section className="kxjh-hero">
        <div className="kxjh-wrap">
          <h1>Jumuiya za Kentexa</h1>
          <p>Gundua watu wenye mawazo na malengo yanayofanana na yako. Jiunge na mijadala, uliza maswali, shiriki maarifa na jenga jumuiya yako.</p>
          <div className="kxjh-tools">
            <input aria-label="Tafuta jumuiya" placeholder="Tafuta jumuiya au mada..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="button" className="kxjh-btn primary" onClick={() => isLoggedIn ? onNavigate('CreateCommunity') : onNavigate('PublicLogin')}>Fungua jumuiya</button>
          </div>
        </div>
      </section>

      <div className="kxjh-wrap kxjh-main">
        <div className="kxjh-tabs" role="group" aria-label="Chagua jumuiya">
          <button type="button" className="kxjh-tab" aria-pressed={tab === 'discover'} onClick={() => setTab('discover')}>Gundua jumuiya</button>
          {isLoggedIn && <button type="button" className="kxjh-tab" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>Jumuiya zangu ({mine.length})</button>}
        </div>

        {tab === 'discover' && topics.length > 0 && (
          <div className="kxjh-topics" aria-label="Chuja kwa mada">
            <button type="button" className="kxjh-topic" aria-pressed={!topic} onClick={() => setTopic('')}>Mada zote</button>
            {topics.map((item) => {
              const key = item.key || item.topicKey;
              if (!key) return null;
              return <button type="button" key={key} className="kxjh-topic" aria-pressed={topic === key} onClick={() => setTopic(topic === key ? '' : key)}>{item.label || item.name || topicLabel(key)}</button>;
            })}
          </div>
        )}

        {error && <div className="kxjh-state kxjh-error" role="alert">{error} <button type="button" className="kxjh-btn" onClick={load}>Jaribu tena</button></div>}

        <section className="kxjh-section">
          <div className="kxjh-section-head">
            <h2>{tab === 'mine' ? 'Jumuiya ulizojiunga' : 'Jumuiya za kugundua'}</h2>
            <span>{loading ? 'Inapakia...' : visible.length + ' jumuiya'}</span>
          </div>

          {loading ? <div className="kxjh-state" role="status">Tunatafuta jumuiya...</div> : visible.length === 0 ? (
            <div className="kxjh-empty">
              <strong>{tab === 'mine' ? 'Bado hujajiunga na jumuiya' : query ? 'Hakuna jumuiya zilizolingana na utafutaji wako' : 'Bado hakuna jumuiya kwenye mada hii'}</strong>
              {tab === 'mine' ? 'Gundua jumuiya zinazokuvutia na ujiunge ili zionekane hapa.' : 'Jaribu mada nyingine au fungua jumuiya mpya.'}
              <div style={{ marginTop: 14 }}>
                {tab === 'mine' ? <button type="button" className="kxjh-btn primary" onClick={() => setTab('discover')}>Gundua jumuiya</button> : <button type="button" className="kxjh-btn primary" onClick={() => isLoggedIn ? onNavigate('CreateCommunity') : onNavigate('PublicLogin')}>Fungua jumuiya</button>}
              </div>
            </div>
          ) : (
            <div className="kxjh-grid">
              {visible.map((community) => (
                <article className="kxjh-card" key={community.id} data-testid={`community-card-${community.id}`}>
                  <div className="kxjh-avatar" aria-hidden="true">{initials(community.name)}</div>
                  <div className="kxjh-info">
                    <h3>{community.name}</h3>
                    <p>{community.purpose || 'Karibu kushiriki kwenye jumuiya hii.'}</p>
                    <div className="kxjh-meta"><span>{topicLabel(community.topicKey)}</span><span>·</span><span>{countLabel(community.memberCount)}</span><span>·</span><span>{community.joinPolicy === 'request' ? 'Kwa ombi' : 'Wazi kwa wote'}</span></div>
                    <div className="kxjh-card-action">
                      {tab === 'mine' ? (
                        <button type="button" className="kxjh-btn primary" onClick={() => openCommunity(community.id)}>Fungua jumuiya</button>
                      ) : (
                        <>
                          <button type="button" className="kxjh-btn" onClick={() => openCommunity(community.id)}>Angalia</button>
                          <button type="button" className="kxjh-btn primary" disabled={joining === community.id || community.myStatus === 'pending'} onClick={() => join(community)}>{joining === community.id ? 'Inatuma...' : community.myStatus === 'pending' ? 'Ombi limetumwa' : community.joinPolicy === 'request' ? 'Omba kujiunga' : 'Jiunge'}</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
