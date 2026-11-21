import React from 'react';

/**
 * Public campaign landing page for Kentexa Jumuiya.
 * Explains the community experience before sending visitors into discovery.
 */
const CSS = `
.kxj{--ink:#101828;--muted:#667085;--blue:#2457d6;--line:#e7ebf2;color:var(--ink);background:#fff;min-height:100vh;font-family:inherit}
.kxj *{box-sizing:border-box}
.kxj-in{width:min(1080px,100%);margin:0 auto;padding:0 20px}
.kxj-nav{height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.kxj-brand{font-size:22px;font-weight:900;letter-spacing:-.7px;color:#101828;text-decoration:none}
.kxj-brand span{color:#2563eb}
.kxj-btn{min-height:48px;padding:0 20px;border-radius:12px;border:1px solid transparent;background:#2457d6;color:#fff;font:inherit;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.kxj-btn.alt{background:#fff;color:#172033;border-color:#d8deea}
.kxj-hero{background:radial-gradient(ellipse at 80% 10%,#315edb 0,transparent 38%),linear-gradient(135deg,#0b1533,#172d69 65%,#244db8);color:#fff;padding:76px 0 82px}
.kxj-hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:42px;align-items:center}
.kxj-tag{display:inline-flex;border:1px solid #ffffff55;background:#ffffff12;border-radius:30px;padding:7px 12px;font-size:13px;font-weight:800;color:#dce7ff}
.kxj h1{font-size:clamp(36px,5.5vw,62px);line-height:1.04;letter-spacing:-1.8px;margin:20px 0 16px;font-weight:900;max-width:650px}
.kxj-lead{font-size:18px;line-height:1.65;color:#d9e3ff;max-width:590px;margin:0}
.kxj-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.kxj-hero .kxj-btn.alt{background:#ffffff12;color:#fff;border-color:#ffffff55}
.kxj-preview{border:1px solid #ffffff35;background:#ffffff12;border-radius:22px;padding:22px;box-shadow:0 24px 70px #050d2b55}
.kxj-preview-label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#c9d8ff;font-weight:900}
.kxj-topic{margin-top:12px;padding:15px;border-radius:14px;background:#fff;color:#172033}
.kxj-topic small{color:#667085;font-weight:700}
.kxj-topic strong{display:block;margin:5px 0;font-size:16px}
.kxj-topic p{margin:0;color:#667085;font-size:13px;line-height:1.45}
.kxj-section{padding:66px 0}
.kxj-section.soft{background:#f7f9fc}
.kxj-eyebrow{color:#2457d6;font-size:13px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.kxj h2{font-size:clamp(27px,3.5vw,40px);line-height:1.12;letter-spacing:-.8px;margin:10px 0 12px}
.kxj-copy{color:#667085;font-size:17px;line-height:1.65;max-width:700px;margin:0}
.kxj-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:28px}
.kxj-card{border:1px solid var(--line);border-radius:18px;padding:22px;background:#fff}
.kxj-num{width:38px;height:38px;border-radius:12px;background:#edf3ff;color:#2457d6;display:flex;align-items:center;justify-content:center;font-weight:900}
.kxj-card h3{font-size:18px;margin:15px 0 7px}
.kxj-card p{font-size:15px;line-height:1.6;color:#667085;margin:0}
.kxj-bottom{background:#101b3c;color:#fff;text-align:center;padding:62px 0}
.kxj-bottom p{color:#cbd6f2;line-height:1.6;font-size:16px;max-width:620px;margin:0 auto}
.kxj-bottom .kxj-btn{margin-top:22px}
.kxj-foot{padding:22px 0;color:#667085;font-size:13px;text-align:center}
@media(max-width:760px){.kxj-hero{padding:54px 0 60px}.kxj-hero-grid{grid-template-columns:1fr;gap:28px}.kxj-cards{grid-template-columns:1fr}.kxj-section{padding:50px 0}.kxj-nav{height:62px}.kxj h1{letter-spacing:-1px}}
`;

export default function JumuiyaLanding({ onNavigate = () => {} }) {
  return (
    <main className="kxj">
      <style>{CSS}</style>
      <header className="kxj-in kxj-nav">
        <a className="kxj-brand" href="/" onClick={(e) => { e.preventDefault(); onNavigate('Home'); }}>kentexa<span>.</span></a>
        <button className="kxj-btn alt" onClick={() => onNavigate('Discover', { initialTab: 'communities' })}>Gundua Jumuiya</button>
      </header>

      <section className="kxj-hero">
        <div className="kxj-in kxj-hero-grid">
          <div>
            <span className="kxj-tag">Jumuiya ndani ya Kentexa</span>
            <h1>Mahali pa watu kukutana, kujadili na kujenga pamoja.</h1>
            <p className="kxj-lead">Jumuiya za Kentexa zinaunganisha watu wenye maslahi, maarifa na malengo yanayofanana. Jiunge na mazungumzo, uliza maswali, shiriki uzoefu na gundua mitazamo mipya.</p>
            <div className="kxj-actions">
              <button className="kxj-btn" onClick={() => onNavigate('Discover', { initialTab: 'communities' })}>Gundua Jumuiya</button>
              <button className="kxj-btn alt" onClick={() => onNavigate('Register')}>Jiunge na Kentexa</button>
            </div>
          </div>
          <div className="kxj-preview" aria-label="Mfano wa mijadala ya Jumuiya">
            <div className="kxj-preview-label">Mazungumzo yanayoendelea</div>
            <div className="kxj-topic"><small>Biashara na Ujasiriamali</small><strong>Ni changamoto gani kubwa kwa mfanyabiashara anayeanza?</strong><p>Shiriki uzoefu wako na ujifunze kutoka kwa wengine.</p></div>
            <div className="kxj-topic"><small>Teknolojia</small><strong>Teknolojia gani inabadilisha kazi zetu?</strong><p>Maswali, mawazo na maarifa kutoka kwa jamii.</p></div>
            <div className="kxj-topic"><small>Maisha na Ujuzi</small><strong>Ungependa kujifunza ujuzi gani mwaka huu?</strong><p>Gundua watu wenye shauku zinazofanana na zako.</p></div>
          </div>
        </div>
      </section>

      <section className="kxj-section">
        <div className="kxj-in">
          <div className="kxj-eyebrow">Zaidi ya kufuatilia machapisho</div>
          <h2>Jumuiya hujengwa kwa ushiriki wako.</h2>
          <p className="kxj-copy">Hapa si sehemu ya kusoma tu. Ni nafasi ya kuuliza, kujibu, kubadilishana mawazo na kusaidiana. Kila mwanachama anaweza kuongeza thamani kwenye mjadala.</p>
          <div className="kxj-cards">
            <article className="kxj-card"><div className="kxj-num">01</div><h3>Jiunge na mada unazopenda</h3><p>Gundua jumuiya zinazohusiana na biashara, teknolojia, elimu, maisha na mambo mengine yanayokuvutia.</p></article>
            <article className="kxj-card"><div className="kxj-num">02</div><h3>Shiriki kwenye mijadala</h3><p>Uliza swali, toa maoni, shiriki uzoefu na jifunze kupitia mitazamo ya wanachama wengine.</p></article>
            <article className="kxj-card"><div className="kxj-num">03</div><h3>Unda jumuiya yako</h3><p>Ukiwa na mada au wazo linaloweza kuwaunganisha watu, anza jumuiya na ujenge nafasi ya mazungumzo.</p></article>
          </div>
        </div>
      </section>

      <section className="kxj-section soft">
        <div className="kxj-in">
          <div className="kxj-eyebrow">Anza hapa</div>
          <h2>Watu wako wapo kwenye mazungumzo.</h2>
          <p className="kxj-copy">Ingia Kentexa, chunguza jumuiya zilizopo na uanze kushiriki. Unahitaji akaunti ili kuendelea na kushiriki kikamilifu.</p>
        </div>
      </section>

      <section className="kxj-bottom">
        <div className="kxj-in">
          <h2>Karibu kwenye Jumuiya za Kentexa.</h2>
          <p>Gundua watu, mawazo na mazungumzo yanayoweza kukupa maarifa mapya na kukusaidia kukua.</p>
          <button className="kxj-btn" onClick={() => onNavigate('Discover', { initialTab: 'communities' })}>Gundua Jumuiya sasa</button>
        </div>
      </section>
      <footer className="kxj-foot">Kentexa · Social commerce network ya Tanzania</footer>
    </main>
  );
}
