import React from 'react';
import { useTranslation } from 'react-i18next';

const COPY = {
  sw: {
    eyebrow: 'KENTEXA • JUKWAA LA BIASHARA',
    title: 'Fungua soko lako. Fikia wateja wengi zaidi.',
    intro: 'Jiunge na Kentexa kama muuzaji, weka bidhaa zako mtandaoni, na waruhusu wateja wakupate, wakuulize na kuagiza moja kwa moja.',
    cta: 'Anza kuuza',
    trust: 'Hakuna mfumo mpya wa kujiandikisha — tumia akaunti yako ya Kentexa.',
    heading: 'Biashara yako inapata nini?',
    benefits: [['Duka lako mtandaoni', 'Onyesha bidhaa na taarifa za biashara yako sehemu moja.'], ['Wateja wapya', 'Fanya bidhaa zako zionekane kwa watu wanaotafuta cha kununua.'], ['Udhibiti wa mauzo', 'Simamia bidhaa, oda na mawasiliano kupitia zana za Kentexa.'], ['Wewe unapokea malipo', 'Mteja analipa moja kwa moja kwenye namba yako ya malipo. Kentexa haitunzi fedha za mauzo yako.']],
    steps: 'Jinsi ya kuanza',
    stepList: ['Fungua akaunti au ingia Kentexa.', 'Tuma maombi ya kuwa muuzaji na chagua aina ya biashara.', 'Baada ya hatua za uthibitishaji na idhini, weka bidhaa zako na anza kupokea oda.'],
    who: 'Kwa nani?',
    whoText: 'Maduka, wauzaji wa jumla, wasambazaji, wazalishaji na watoa huduma wanaotaka kufikia wateja zaidi.',
    reseller: 'Unataka kuuza bidhaa za maduka bila kununua stock?',
    resellerText: 'Huo ni mpango tofauti wa Kentexa Uza Tena. Una ukurasa na maelezo yake.',
    resellerCta: 'Jifunze kuhusu Uza Tena',
    note: 'Maombi yanapitiwa kulingana na taarifa na uthibitishaji unaohitajika. Kujiunga hakumaanishi idhini ya moja kwa moja.'
  },
  en: {
    eyebrow: 'KENTEXA • BUSINESS MARKETPLACE',
    title: 'Open your market. Reach more customers.',
    intro: 'Join Kentexa as a seller, publish your products, and let customers discover your business, ask questions and order directly.',
    cta: 'Start selling',
    trust: 'No separate registration system — use your Kentexa account.',
    heading: 'What your business gets',
    benefits: [['Your online storefront', 'Present your products and business information in one place.'], ['More customer discovery', 'Make your products visible to people looking for what to buy.'], ['Sales tools', 'Manage products, orders and customer conversations with Kentexa tools.'], ['You receive the money', 'Customers pay directly to your own payment number. Kentexa does not hold your sales revenue.']],
    steps: 'How to get started',
    stepList: ['Create a Kentexa account or sign in.', 'Apply to become a seller and choose your seller type.', 'Complete the required verification and approval steps, then publish products and receive orders.'],
    who: 'Who is this for?',
    whoText: 'Retail shops, wholesalers, distributors, manufacturers and service businesses that want to reach more customers.',
    reseller: 'Want to resell shop products without buying stock?',
    resellerText: 'That is a separate Kentexa programme: Uza Tena, with its own page and information.',
    resellerCta: 'Explore Uza Tena',
    note: 'Applications are reviewed against the required information and verification. Applying does not mean automatic approval.'
  },
  fr: {
    eyebrow: 'KENTEXA • PLACE DE MARCHÉ',
    title: 'Développez votre marché. Touchez plus de clients.',
    intro: 'Rejoignez Kentexa comme vendeur, publiez vos produits et permettez aux clients de découvrir votre activité et de commander directement.',
    cta: 'Commencer à vendre',
    trust: 'Pas de système d’inscription séparé : utilisez votre compte Kentexa.',
    heading: 'Les avantages pour votre activité',
    benefits: [['Votre boutique en ligne', 'Présentez vos produits et les informations de votre activité au même endroit.'], ['De nouveaux clients', 'Rendez vos produits visibles auprès des personnes qui recherchent quoi acheter.'], ['Outils de vente', 'Gérez vos produits, commandes et échanges avec les clients grâce à Kentexa.'], ['Vous recevez le paiement', 'Les clients paient directement sur votre propre numéro de paiement. Kentexa ne conserve pas vos recettes.']],
    steps: 'Comment commencer',
    stepList: ['Créez un compte Kentexa ou connectez-vous.', 'Faites une demande pour devenir vendeur et choisissez votre type de vendeur.', 'Effectuez les vérifications et étapes d’approbation requises, puis publiez vos produits.'],
    who: 'À qui s’adresse ce programme ?',
    whoText: 'Magasins, grossistes, distributeurs, fabricants et prestataires de services qui souhaitent toucher plus de clients.',
    reseller: 'Vous souhaitez revendre des produits sans acheter de stock ?',
    resellerText: 'C’est un programme Kentexa distinct : Uza Tena, avec sa propre page.',
    resellerCta: 'Découvrir Uza Tena',
    note: 'Les demandes sont examinées selon les informations et vérifications requises. Une demande ne garantit pas une approbation automatique.'
  }
};

export default function SellerRecruitment({ onNavigate }) {
  const { i18n } = useTranslation();
  const lang = String(i18n.resolvedLanguage || i18n.language || 'sw').split('-')[0];
  const c = COPY[lang] || COPY.sw;
  const start = () => onNavigate('BecomeSeller');
  return (
    <main style={{ minHeight: '100vh', background: '#fff', color: '#0f1419', padding: '28px 16px 64px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 30 }}>
        <header style={{ padding: '28px 22px', borderRadius: 22, background: '#f3f7ff', border: '1px solid #dbeafe' }}>
          <div style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>{c.eyebrow}</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.12, margin: '14px 0', fontWeight: 850 }}>{c.title}</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#536471', margin: '0 0 22px' }}>{c.intro}</p>
          <button type="button" onClick={start} data-testid="seller-start" style={{ minHeight: 50, padding: '0 24px', border: 0, borderRadius: 26, background: '#0f1419', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{c.cta}</button>
          <p style={{ fontSize: 13, color: '#536471', margin: '12px 0 0' }}>{c.trust}</p>
        </header>
        <section>
          <h2 style={{ fontSize: 23, margin: '0 0 14px' }}>{c.heading}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
            {c.benefits.map(([title, body]) => <article key={title} style={{ padding: 16, border: '1px solid #e7edf2', borderRadius: 15 }}>
              <h3 style={{ fontSize: 17, margin: '0 0 7px' }}>{title}</h3><p style={{ fontSize: 15, lineHeight: 1.5, color: '#536471', margin: 0 }}>{body}</p>
            </article>)}
          </div>
        </section>
        <section>
          <h2 style={{ fontSize: 23, margin: '0 0 12px' }}>{c.steps}</h2>
          <ol style={{ paddingLeft: 23, margin: 0, display: 'grid', gap: 12 }}>
            {c.stepList.map((step) => <li key={step} style={{ fontSize: 16, lineHeight: 1.5, paddingLeft: 4 }}>{step}</li>)}
          </ol>
        </section>
        <section style={{ padding: 18, borderRadius: 16, background: '#f8fafc' }}>
          <h2 style={{ fontSize: 21, margin: '0 0 8px' }}>{c.who}</h2><p style={{ fontSize: 16, lineHeight: 1.5, color: '#536471', margin: 0 }}>{c.whoText}</p>
        </section>
        <section style={{ padding: 18, border: '1px solid #dbeafe', borderRadius: 16 }}>
          <h2 style={{ fontSize: 19, margin: '0 0 7px' }}>{c.reseller}</h2><p style={{ fontSize: 15, lineHeight: 1.5, color: '#536471' }}>{c.resellerText}</p>
          <button type="button" onClick={() => onNavigate('UzaTena')} style={{ background: 'transparent', border: '1px solid #1d4ed8', color: '#1d4ed8', borderRadius: 22, padding: '11px 17px', fontSize: 15, fontWeight: 750, cursor: 'pointer' }}>{c.resellerCta}</button>
        </section>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>{c.note}</p>
        <button type="button" onClick={start} style={{ minHeight: 50, border: 0, borderRadius: 25, background: '#0f1419', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{c.cta}</button>
      </div>
    </main>
  );
}
