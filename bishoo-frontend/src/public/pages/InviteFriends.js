import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import ContactDiscovery from '../components/ContactDiscovery';

const BLUE = '#2563EB';
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const INVITE_URL = 'https://kentexa.com/';

export default function InviteFriends({ onNavigate }) {
  const { i18n } = useTranslation();
  const sw = (i18n.language || 'en').toLowerCase().startsWith('sw');
  const [message, setMessage] = useState(sw
    ? 'Karibu Kentexa — mtandao wa kijamii na biashara unaowaunganisha watu, biashara na fursa. Jiunge nasi:'
    : 'Join me on Kentexa — a social-commerce network connecting people, businesses and opportunities. Get started here:');
  const [notice, setNotice] = useState('');

  const payload = `${message.trim()} ${INVITE_URL}`;
  const copyText = async (value) => {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(field);
        if (!copied) throw new Error('Copy unavailable');
      }
      setNotice(sw ? 'Ujumbe umenakiliwa.' : 'Invitation copied.');
    } catch {
      setNotice(sw ? 'Imeshindikana kunakili. Jaribu tena.' : 'Could not copy. Please try again.');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kentexa', text: message.trim(), url: INVITE_URL });
        setNotice(sw ? 'Chaguo la kushiriki limefunguliwa.' : 'Share options opened.');
      } catch (error) {
        if (error?.name !== 'AbortError') setNotice(sw ? 'Kushiriki hakukufaulu.' : 'Sharing was not completed.');
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(payload)}`, '_blank', 'noopener,noreferrer');
    setNotice(sw ? 'WhatsApp imefunguliwa.' : 'WhatsApp opened.');
  };

  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(payload)}`, '_blank', 'noopener,noreferrer');
    setNotice(sw ? 'WhatsApp imefunguliwa.' : 'WhatsApp opened.');
  };

  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFC', color: INK, paddingBottom: 100 }}>
      <BackBar title={sw ? 'Alika marafiki' : 'Invite friends'} onBack={() => onNavigate('back')} />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '18px 16px' }}>
        <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#EFF6FF', color: BLUE,
            display: 'grid', placeItems: 'center', fontSize: 23, fontWeight: 800, marginBottom: 14 }}>K</div>
          <h1 style={{ fontSize: 22, lineHeight: 1.25, margin: '0 0 8px', fontWeight: 800 }}>
            {sw ? 'Panua mtandao wako wa Kentexa' : 'Grow your Kentexa network'}
          </h1>
          <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: '0 0 18px' }}>
            {sw
              ? 'Alika marafiki, wafanyabiashara na watu wenye mawazo ya kujenga. Wanaweza kugundua jumuiya, watu, biashara na fursa ndani ya Kentexa.'
              : 'Invite friends, entrepreneurs and people building something. They can discover communities, people, businesses and opportunities on Kentexa.'}
          </p>
          <label htmlFor="kentexa-invite-message" style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {sw ? 'Ujumbe wa mwaliko' : 'Invitation message'}
          </label>
          <textarea id="kentexa-invite-message" value={message} onChange={e => setMessage(e.target.value)}
            rows={4} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`,
              borderRadius: 10, padding: 12, font: 'inherit', fontSize: 15, lineHeight: 1.5, resize: 'vertical' }} />
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#F8FAFC',
            border: `1px solid ${LINE}`, overflowWrap: 'anywhere', fontSize: 14, color: MUTED }}>
            <strong style={{ color: INK }}>{sw ? 'Kiungo cha Kentexa' : 'Kentexa link'}</strong>
            <div style={{ marginTop: 5 }}>kentexa.com</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <button type="button" onClick={whatsapp} style={{ minHeight: 46, border: 0, borderRadius: 10,
              background: '#128C7E', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              WhatsApp
            </button>
            <button type="button" onClick={share} style={{ minHeight: 46, border: 0, borderRadius: 10,
              background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {sw ? 'Shiriki' : 'Share'}
            </button>
          </div>
          <button type="button" onClick={() => copyText(payload)} style={{ width: '100%', minHeight: 44,
            marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff',
            color: INK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {sw ? 'Nakili ujumbe na kiungo' : 'Copy message and link'}
          </button>
          {notice && <p role="status" style={{ margin: '12px 0 0', color: MUTED, fontSize: 13 }}>{notice}</p>}
          <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
            {sw
              ? 'Huu ni kiungo cha jumla cha Kentexa; kwa sasa hakihusishi ufuatiliaji binafsi wa aliyealika.'
              : 'This is a general Kentexa link; personal referral attribution is not enabled by this invite screen yet.'}
          </p>
        </section>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px', fontWeight: 800 }}>
            {sw ? 'Tafuta watu ambao tayari wako Kentexa' : 'Find people already on Kentexa'}
          </h2>
          <ContactDiscovery />
        </section>
      </div>
    </main>
  );
}
