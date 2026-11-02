/**
 * ServiceDetail.js — one service, rebuilt in the new look (owner 2026-11-02: "rebuild the
 * other pages left in the new way"), the same design as the approved ProductDetail:
 * header with back and share; photo; title, chips and price; facts as rows; the provider
 * (identity first, opens their profile); description; comments; and a bottom bar with
 * "Omba huduma", message and WhatsApp. The request form opens as a sheet. No emoji; only
 * real numbers (rating and jobs only when there are some). Same server calls as before.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/api';
import ReputationBadge from '../components/ReputationBadge';
import WishlistHeart from '../components/WishlistHeart';
import CommerceCommentSection from '../components/CommerceCommentSection';
import { listingUrl, listingWhatsAppHref } from '../utils/listingWhatsApp';

const B = '#1d4ed8';
const DK = '#0f1419';
const GR = '#536471';
const WH = '#ffffff';
const LINE = '#eff3f4';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const getPriceLabels = (t) => ({
  per_hour: t('service_detail.price_per_hour'), per_job: t('service_detail.price_per_job'), per_day: t('service_detail.price_per_day'),
  negotiate: t('service_detail.price_negotiate'), free_quote: t('service_detail.price_free_quote'),
});
const getDays = (t) => ({ Mon: t('service_detail.day_mon'), Tue: t('service_detail.day_tue'), Wed: t('service_detail.day_wed'),
  Thu: t('service_detail.day_thu'), Fri: t('service_detail.day_fri'), Sat: t('service_detail.day_sat'), Sun: t('service_detail.day_sun') });

const Icon = ({ d, size = 20, color = DK }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const IC = { back: 'M15 6l-6 6 6 6', share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6', chat: 'M4 5h16v11H8l-4 4z' };
const IconBtn = ({ label, onClick, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick}
    style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</button>
);
const Chip = ({ tone = 'grey', children }) => {
  const c = { green: ['#ecfdf3', '#166534'], blue: ['#eff6ff', '#1e40af'], grey: ['#f7f9f9', GR] }[tone];
  return <span style={{ height: 28, padding: '0 10px', borderRadius: 14, background: c[0], color: c[1], fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>{children}</span>;
};
const pill = (bg, color = WH, border = 'none') => ({ height: 46, padding: '0 18px', borderRadius: 23, border, background: bg, color, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', boxSizing: 'border-box' });
const field = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 8, border: '1px solid #cfd9de', fontSize: 16, fontFamily: 'inherit', color: DK, outline: 'none' };
const label = { fontSize: 13, color: GR, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 };

const Shell = ({ children, onBack, title, right }) => (
  <div style={{ minHeight: '100vh', background: WH, color: DK }}>
    <div style={{ maxWidth: 600, margin: '0 auto', minHeight: '100vh', borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, paddingBottom: 96 }}>
      <header style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 20, height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px',
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${LINE}` }}>
        <IconBtn label="Rudi" onClick={onBack}><Icon d={IC.back} size={22} /></IconBtn>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>{title}</span>
        {right}
      </header>
      {children}
    </div>
  </div>
);

const ServiceDetail = ({ onNavigate, isLoggedIn, serviceId, currentUser, onOpenMoment, openComments, activeProfileId }) => {
  const { t } = useTranslation();
  const PRICE_LABELS = getPriceLabels(t);
  const DAYS = getDays(t);
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ description: '', jobLocation: '', preferredDate: '', preferredTime: '', buyerPhone: '' });
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const commentsRef = useRef(null);

  useEffect(() => {
    if (!serviceId) return;
    setLoading(true);
    api.get(`/services/${serviceId}`).then((r) => setAd(r.data)).catch(() => setAd(null)).finally(() => setLoading(false));
  }, [serviceId]);

  useEffect(() => {
    if (!openComments || !ad || !commentsRef.current) return;
    commentsRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [openComments, ad]);

  const back = () => onNavigate('back');
  const title = t('service_detail.page_title');

  if (loading) {
    return (
      <Shell onBack={back} title={title}>
        <div aria-label={t('service_detail.loading')} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 220, borderRadius: 16, background: LINE }} />
          <div style={{ width: '70%', height: 18, borderRadius: 9, background: LINE }} />
          <div style={{ width: '40%', height: 14, borderRadius: 7, background: LINE }} />
        </div>
      </Shell>
    );
  }
  if (!ad) {
    return (
      <Shell onBack={back} title={title}>
        <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{t('service_detail.not_found_title')}</div>
          <button type="button" onClick={() => onNavigate('Services')} style={pill(DK)}>{t('service_detail.back_to_services')}</button>
        </div>
      </Shell>
    );
  }

  const quote = ad.priceType === 'negotiate' || ad.priceType === 'free_quote';
  const priceText = quote ? PRICE_LABELS[ad.priceType] : `TZS ${fmt(ad.price)}${ad.priceMax > 0 ? ` – ${fmt(ad.priceMax)}` : ''}`;
  const whatsapp = ad.whatsappPhone || ad.provider?.phone || '';
  const waHref = listingWhatsAppHref({
    phone: whatsapp, kind: 'service', title: ad.title, price: ad.price,
    url: listingUrl('service', ad.id), shopName: ad.commerceProfile?.displayName || ad.provider?.name,
  });
  const providerName = ad.commerceProfile?.displayName || ad.provider?.name || t('service_detail.default_provider_name');
  const providerPhoto = ad.commerceProfile?.photoUrl;
  const profileParams = ad.commerceProfile?.id ? { commerceProfileId: ad.commerceProfile.id } : undefined;
  const openProvider = () => ad.provider?.id && onNavigate(`CommerceProfile-${ad.provider.id}`, profileParams);
  const isOwner = isLoggedIn && currentUser?.id === ad.provider?.id;

  const share = () => {
    const url = `${api.defaults?.baseURL || ''}/share/service/${ad.id}`;
    if (navigator.share) navigator.share({ title: ad.title, url }).catch(() => {});
    else { navigator.clipboard?.writeText(url).catch(() => {}); setShareMsg(t('share.link_copied')); setTimeout(() => setShareMsg(''), 3000); }
  };

  const request = async () => {
    if (!form.description.trim()) { setError(t('service_detail.description_required')); return; }
    if (!form.jobLocation.trim()) { setError(t('service_detail.location_required')); return; }
    setSending(true); setError('');
    try {
      await api.post('/services/jobs/request', {
        serviceAdId: Number(serviceId), description: form.description, jobLocation: form.jobLocation,
        preferredDate: form.preferredDate || undefined, preferredTime: form.preferredTime || undefined, buyerPhone: form.buyerPhone || undefined,
      });
      setSent(true); setShowForm(false);
    } catch (e) {
      setError(e.response?.data?.message || t('service_detail.request_failed'));
    } finally { setSending(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const facts = [
    [t('service_detail.detail_city_label'), ad.coverageCity],
    [t('service_detail.detail_days_label'), ad.workingDays?.length ? ad.workingDays.map((d) => DAYS[d] || d).join(', ') : t('service_detail.detail_days_all')],
    [t('service_detail.detail_hours_label'), ad.workingHours || t('service_detail.detail_hours_default')],
  ].filter(([, v]) => v);

  return (
    <Shell onBack={back} title={title} right={<IconBtn label={t('share.button')} onClick={share}><Icon d={IC.share} /></IconBtn>}>
      {shareMsg && <div role="status" style={{ padding: '10px 16px', fontSize: 14, color: '#166534', background: '#ecfdf3' }}>{shareMsg}</div>}

      {ad.images?.length > 0 && (
        <div style={{ position: 'relative', aspectRatio: '4 / 3', maxWidth: '100%', background: '#f7f9f9' }}>
          <img src={ad.images[0]} alt={ad.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
          <span style={{ position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WishlistHeart entityType="service" entityId={ad.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
          </span>
        </div>
      )}

      <section style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${LINE}` }}>
        {(ad.isVerified || ad.isAvailableNow) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ad.isVerified && <Chip tone="blue">{t('service_detail.verified_by_kentexa')}</Chip>}
            {ad.isAvailableNow && <Chip tone="green">{t('service_detail.available_now')}</Chip>}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>{ad.title}</h1>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span data-testid="service-price" style={{ fontSize: 24, fontWeight: 800 }}>{priceText}</span>
          {!quote && PRICE_LABELS[ad.priceType] && <span style={{ fontSize: 15, color: GR }}>{PRICE_LABELS[ad.priceType]}</span>}
        </div>
        {ad.totalJobs > 0 && (
          <span style={{ fontSize: 14, color: GR }}>
            <b style={{ color: DK }}>{Number(ad.rating || 0).toFixed(1)}</b> {t('service_detail.ratings_jobs', { ratings: ad.totalRatings || 0, jobs: ad.totalJobs })}
          </span>
        )}
      </section>

      <section style={{ padding: '4px 16px', borderBottom: `1px solid ${LINE}` }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: `1px solid ${LINE}`, fontSize: 15 }}>
            <span style={{ color: GR }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
        {ad.coverageWards?.length > 0 && (
          <div style={{ padding: '11px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ color: GR, fontSize: 15 }}>{t('service_detail.coverage_areas_label')}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ad.coverageWards.map((w) => <Chip key={w}>{w}</Chip>)}</div>
          </div>
        )}
      </section>

      <section style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${LINE}` }}>
        <button type="button" onClick={openProvider} aria-label={providerName}
          style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', border: 'none', padding: 0, background: '#cfd9de', color: WH, fontWeight: 800, fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>
          {providerPhoto ? <img src={providerPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : providerName.charAt(0).toUpperCase()}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 800 }}>
            <span onClick={openProvider} role="link" tabIndex={0} style={{ cursor: ad.provider?.id ? 'pointer' : 'default' }}>{providerName}</span>
            {ad.provider?.reputationScore > 0 && <ReputationBadge score={ad.provider.reputationScore} size="xs" />}
          </div>
          <div style={{ fontSize: 14, color: GR }}>
            {t('service_detail.jobs_completed', { count: ad.totalJobs || 0 })}{ad.isVerified ? ` ${t('service_detail.verified_suffix')}` : ''}
          </div>
        </div>
        {isOwner && (
          <button type="button" onClick={() => onOpenMoment?.('selling', { type: 'service', id: ad.id, title: ad.title, image: ad.images?.[0] || null })}
            style={{ border: 'none', background: 'none', color: B, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{t('service_detail.share_as_moment')}</button>
        )}
      </section>

      {ad.description && (
        <section style={{ padding: 16, borderBottom: `1px solid ${LINE}`, fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{ad.description}</section>
      )}

      {ad.category === 'usafirishaji' && (
        <section style={{ padding: 16, borderBottom: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>{t('service_detail.transport_verified_title')}</b>
          <span style={{ fontSize: 14, color: GR }}>{t('service_detail.transport_verified_desc')}</span>
          <button type="button" onClick={() => onNavigate('TransportProviderDashboard')} style={{ ...pill(WH, DK, '1px solid #cfd9de'), alignSelf: 'flex-start' }}>{t('service_detail.view_todays_trips')}</button>
        </section>
      )}

      {sent && (
        <section role="status" style={{ margin: 16, padding: 14, borderRadius: 14, background: '#ecfdf3', color: '#166534' }}>
          <b>{t('service_detail.request_sent_title')}</b>
          <div style={{ fontSize: 14, marginTop: 4 }}>{t('service_detail.request_sent_desc')}</div>
        </section>
      )}

      <section ref={commentsRef} style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800 }}>{t('service_detail.comments_title')}</h2>
        <CommerceCommentSection entityType="service" entityId={ad.id} entityTitle={ad.title} sellerId={ad.provider?.id}
          isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate} activeProfileId={activeProfileId} />
        {Number.isFinite(Number(ad.views)) && <p style={{ margin: '12px 0 0', fontSize: 13, color: GR }}>{t('service_detail.views_count', { count: Number(ad.views) + 1 })}</p>}
      </section>

      {!sent && !isOwner && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: WH, borderTop: `1px solid ${LINE}`,
          padding: '10px max(16px, env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))' }}>
          <div style={{ maxWidth: 568, margin: '0 auto', display: 'flex', gap: 8 }}>
            {ad.provider?.id && (
              <button type="button" aria-label={t('service_detail.message_provider_button')} data-testid="service-message"
                onClick={() => onNavigate(`MessageSeller-${ad.provider.id}`, { ...(profileParams || {}), contextType: 'service', contextId: ad.id })}
                style={{ ...pill(WH, DK, '1px solid #cfd9de'), width: 46, padding: 0 }}><Icon d={IC.chat} /></button>
            )}
            {waHref && <a href={waHref} target="_blank" rel="noreferrer" style={{ ...pill(WH, '#166534', '1px solid #cfd9de'), flex: 1 }}>WhatsApp</a>}
            <button type="button" data-testid="service-request" onClick={() => (isLoggedIn ? setShowForm(true) : onNavigate('PublicLogin'))} style={{ ...pill(DK), flex: 2 }}>
              {t('service_detail.request_service_button')}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div role="dialog" aria-label={t('service_detail.request_service_button')} onClick={() => setShowForm(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,20,25,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 600, background: WH, borderRadius: '18px 18px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
              boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90vh', overflowY: 'auto' }}>
            <b style={{ fontSize: 18 }}>{ad.title}</b>
            <label style={label}>{t('service_detail.field_need_label')}
              <textarea data-testid="service-need" rows={3} value={form.description} onChange={set('description')} placeholder={t('service_detail.field_need_placeholder')} style={{ ...field, resize: 'vertical' }} />
            </label>
            <label style={label}>{t('service_detail.field_job_location_label')}
              <input data-testid="service-where" value={form.jobLocation} onChange={set('jobLocation')} placeholder={t('service_detail.field_job_location_placeholder')} style={field} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={label}>{t('service_detail.field_date_label')}<input type="date" value={form.preferredDate} onChange={set('preferredDate')} style={field} /></label>
              <label style={label}>{t('service_detail.field_time_label')}<input type="time" value={form.preferredTime} onChange={set('preferredTime')} style={field} /></label>
            </div>
            <label style={label}>{t('service_detail.field_phone_label')}
              <input type="tel" value={form.buyerPhone} onChange={set('buyerPhone')} placeholder="0788 000 000" style={field} />
            </label>
            {error && <p role="alert" style={{ margin: 0, color: '#b42318', fontSize: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ ...pill(WH, DK, '1px solid #cfd9de'), flex: 1 }}>{t('service_detail.back_button')}</button>
              <button type="button" data-testid="service-send" onClick={request} disabled={sending} style={{ ...pill(DK), flex: 2, opacity: sending ? 0.6 : 1 }}>
                {sending ? t('service_detail.sending_button') : t('service_detail.send_request_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
};

export default ServiceDetail;
