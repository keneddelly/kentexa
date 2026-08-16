/**
 * ServiceDetail.js — View a service ad + request the service
 * Place at: src/public/pages/ServiceDetail.js
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import api             from '../../api/api';
import ReputationBadge from '../components/ReputationBadge';
import WishlistHeart   from '../components/WishlistHeart';
import CommerceCommentSection from '../components/CommerceCommentSection';

const getPriceLabels = (t) => ({
  per_hour: t('service_detail.price_per_hour'), per_job: t('service_detail.price_per_job'), per_day: t('service_detail.price_per_day'),
  negotiate: t('service_detail.price_negotiate'), free_quote: t('service_detail.price_free_quote'),
});

const getDays = (t) => ({ Mon:t('service_detail.day_mon'), Tue:t('service_detail.day_tue'), Wed:t('service_detail.day_wed'),
  Thu:t('service_detail.day_thu'), Fri:t('service_detail.day_fri'), Sat:t('service_detail.day_sat'), Sun:t('service_detail.day_sun') });

const fmt = n => Number(n||0).toLocaleString();

const ServiceDetail = ({ onNavigate, isLoggedIn, onLogout, userRole, serviceId, currentUser, onOpenMoment, openComments }) => {
  const { t } = useTranslation();
  const PRICE_LABELS = getPriceLabels(t);
  const DAYS_SW = getDays(t);
  const [ad,       setAd]       = useState(null);
  const [loading,  setLoading]  = useState(true);
  const commentsRef = React.useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [form,     setForm]     = useState({
    description: '', jobLocation: '', preferredDate: '', preferredTime: '', buyerPhone: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!serviceId) return;
    api.get(`/services/${serviceId}`)
      .then(r => setAd(r.data))
      .catch(() => setAd(null))
      .finally(() => setLoading(false));
  }, [serviceId]);

  // Deep-linked from a "New comment"/"New save" notification — scroll to
  // the comments section instead of leaving it wherever it falls on the page.
  useEffect(() => {
    if (!openComments || !ad || !commentsRef.current) return;
    commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openComments, ad]);

  const handleRequest = async () => {
    if (!form.description.trim()) return setError(t('service_detail.description_required'));
    if (!form.jobLocation.trim()) return setError(t('service_detail.location_required'));
    try {
      setSending(true); setError('');
      await api.post('/services/jobs/request', {
        serviceAdId:   Number(serviceId),
        description:   form.description,
        jobLocation:   form.jobLocation,
        preferredDate: form.preferredDate || undefined,
        preferredTime: form.preferredTime || undefined,
        buyerPhone:    form.buyerPhone    || undefined,
      });
      setSent(true);
      setShowForm(false);
    } catch (e) {
      setError(e.response?.data?.message || t('service_detail.request_failed'));
    } finally { setSending(false); }
  };

  const inp = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('Services')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
          <div>{t('service_detail.loading')}</div>
        </div>
      </div>
    </div>
  );

  if (!ad) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
        <button onClick={() => onNavigate('Services')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:8, padding:0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{t('service_detail.not_found_title')}</div>
          <button onClick={() => onNavigate('Services')}
            style={{ marginTop: 16, backgroundColor: '#1d4ed8', color: '#fff',
              border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>
            {t('service_detail.back_to_services')}
          </button>
        </div>
      </div>
    </div>
  );

  const whatsapp = ad.whatsappPhone || ad.provider?.phone || '';
  const waPhone  = whatsapp.replace(/^0/, '255').replace(/[^0-9]/g, '');
  const waMsg    = `Hi! I found your service "${ad.title}" on KenteXa. I need some help.`;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f8fafc', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('Services')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>{t('service_detail.page_title')}</span>
        </button>
      </div>

      <div style={{ flex: 1, maxWidth: 900, margin: '0 auto',
        padding: '16px 16px 90px', width: '100%', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Main content */}
          <div style={{ flex: '1 1 500px', minWidth: 0 }}>

            {/* Image gallery */}
            {ad.images?.length > 0 && (
              <div style={{ marginBottom: 20, borderRadius: 16, overflow: 'hidden',
                height: 260, backgroundColor: '#f1f5f9', position: 'relative' }}>
                <img src={ad.images[0]} alt={ad.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => e.target.style.display = 'none'} />
                <div style={{ position: 'absolute', top: 10, right: 12, width: 36, height: 36,
                  borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <WishlistHeart entityType="service" entityId={ad.id} isLoggedIn={isLoggedIn} onNavigate={onNavigate} size={20} />
                </div>
              </div>
            )}

            {/* Title + badges */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16,
              padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {ad.isVerified && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8',
                    backgroundColor: '#eff6ff', padding: '3px 10px', borderRadius: 100 }}>
                    {t('service_detail.verified_by_kentexa')}
                  </span>
                )}
                {ad.isAvailableNow && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a',
                    backgroundColor: '#dcfce7', padding: '3px 10px', borderRadius: 100 }}>
                    {t('service_detail.available_now')}
                  </span>
                )}
              </div>

              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a',
                margin: '0 0 12px', lineHeight: 1.2 }}>
                {ad.title}
              </h1>

              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, margin: '0 0 16px' }}>
                {ad.description}
              </p>

              {/* Rating */}
              {ad.totalJobs > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ color: '#f59e0b', fontSize: 16 }}>
                    {'★'.repeat(Math.round(ad.rating))}{'☆'.repeat(5 - Math.round(ad.rating))}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    {Number(ad.rating).toFixed(1)}
                  </span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    {t('service_detail.ratings_jobs', { ratings: ad.totalRatings, jobs: ad.totalJobs })}
                  </span>
                </div>
              )}

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                {[
                  { icon: '💰', label: t('service_detail.detail_price_label'),
                    value: ad.priceType === 'negotiate' || ad.priceType === 'free_quote'
                      ? PRICE_LABELS[ad.priceType]
                      : `TZS ${fmt(ad.price)}${PRICE_LABELS[ad.priceType] || ''}` },
                  { icon: '📍', label: t('service_detail.detail_city_label'), value: ad.coverageCity },
                  { icon: '📅', label: t('service_detail.detail_days_label'),
                    value: ad.workingDays?.map(d => DAYS_SW[d] || d).join(', ') || t('service_detail.detail_days_all') },
                  { icon: '🕐', label: t('service_detail.detail_hours_label'), value: ad.workingHours || t('service_detail.detail_hours_default') },
                ].map(d => (
                  <div key={d.label} style={{ backgroundColor: '#f8fafc',
                    borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{d.icon} {d.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{d.value}</div>
                  </div>
                ))}
              </div>

              {/* Coverage wards */}
              {ad.coverageWards?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>
                    {t('service_detail.coverage_areas_label')}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ad.coverageWards.map(w => (
                      <span key={w} style={{ fontSize: 12, backgroundColor: '#eff6ff',
                        color: '#1d4ed8', padding: '3px 10px', borderRadius: 100, fontWeight: 600 }}>
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Provider card */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16,
              padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
                {t('service_detail.provider_title')}
              </div>
              {(() => {
                // Prefers the provider's BUSINESS CommerceProfile when they
                // have one (e.g. a seller also offering repairs) — same
                // fix as ProductDetail.js/ClassifiedDetail.js. Falls back
                // to the personal name/initials, same as before, since
                // most service listings won't have one.
                const providerName = ad.commerceProfile?.displayName || ad.provider?.name || t('service_detail.default_provider_name');
                const providerPhoto = ad.commerceProfile?.photoUrl;
                const navParams = ad.commerceProfile?.id ? { commerceProfileId: ad.commerceProfile.id } : undefined;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div onClick={() => ad.provider?.id && onNavigate('CommerceProfile-' + ad.provider.id, navParams)}
                      style={{ width: 52, height: 52, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, color: '#fff', fontWeight: 900, flexShrink: 0,
                        cursor: ad.provider?.id ? 'pointer' : 'default', overflow: 'hidden' }}>
                      {providerPhoto
                        ? <img src={providerPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (providerName?.charAt(0)?.toUpperCase() || 'P')}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                        <span
                          onClick={() => ad.provider?.id && onNavigate('CommerceProfile-' + ad.provider.id, navParams)}
                          style={{ cursor: ad.provider?.id ? 'pointer' : 'default', color: '#1d4ed8' }}>
                          {providerName}
                        </span>
                        {ad.provider?.reputationScore > 0 && (
                          <ReputationBadge score={ad.provider.reputationScore} size="xs"
                            style={{ marginLeft: 8 }} />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {t('service_detail.jobs_completed', { count: ad.totalJobs })}
                        {ad.isVerified && t('service_detail.verified_suffix')}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {isLoggedIn && currentUser?.id === ad.provider?.id && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => onOpenMoment?.('selling', {
                      type: 'service', id: ad.id, title: ad.title,
                      image: ad.images?.[0] || null,
                    })}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:0,
                      color:'#2563EB', fontSize:12, fontWeight:700 }}>
                    {t('service_detail.share_as_moment')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar — action panel */}
          <div style={{ flex: '0 0 280px', minWidth: 260 }}>

            {/* Success message */}
            {sent && (
              <div style={{ backgroundColor: '#dcfce7', borderRadius: 14,
                padding: 20, marginBottom: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>
                  {t('service_detail.request_sent_title')}
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                  {t('service_detail.request_sent_desc')}
                </div>
              </div>
            )}

            {/* Price box */}
            <div style={{ backgroundColor: '#fff', borderRadius: 16,
              padding: 20, marginBottom: 14,
              boxShadow: '0 4px 20px rgba(37,99,235,0.1)',
              border: '1.5px solid #e2e8f0' }}>

              <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8', marginBottom: 4 }}>
                {ad.priceType === 'negotiate' || ad.priceType === 'free_quote'
                  ? PRICE_LABELS[ad.priceType]
                  : `TZS ${fmt(ad.price)}`}
              </div>
              {ad.priceType !== 'negotiate' && ad.priceType !== 'free_quote' && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                  {PRICE_LABELS[ad.priceType]}
                  {ad.priceMax > 0 && ` – TZS ${fmt(ad.priceMax)}`}
                </div>
              )}

              {!sent && (
                <>
                  {/* Request form */}
                  {showForm ? (
                    <div>
                      {error && (
                        <div style={{ backgroundColor: '#fee2e2', color: '#dc2626',
                          borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                          {error}
                        </div>
                      )}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
                          display: 'block', marginBottom: 4 }}>
                          {t('service_detail.field_need_label')}
                        </label>
                        <textarea rows={3} style={{ ...inp, resize: 'none' }}
                          placeholder={t('service_detail.field_need_placeholder')}
                          value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
                          display: 'block', marginBottom: 4 }}>
                          {t('service_detail.field_job_location_label')}
                        </label>
                        <input style={inp} placeholder={t('service_detail.field_job_location_placeholder')}
                          value={form.jobLocation}
                          onChange={e => setForm(f => ({ ...f, jobLocation: e.target.value }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                            display: 'block', marginBottom: 4 }}>{t('service_detail.field_date_label')}</label>
                          <input type="date" style={inp}
                            value={form.preferredDate}
                            onChange={e => setForm(f => ({ ...f, preferredDate: e.target.value }))} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                            display: 'block', marginBottom: 4 }}>{t('service_detail.field_time_label')}</label>
                          <input type="time" style={inp}
                            value={form.preferredTime}
                            onChange={e => setForm(f => ({ ...f, preferredTime: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b',
                          display: 'block', marginBottom: 4 }}>{t('service_detail.field_phone_label')}</label>
                        <input type="tel" style={inp} placeholder="0788 000 000"
                          value={form.buyerPhone}
                          onChange={e => setForm(f => ({ ...f, buyerPhone: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowForm(false)}
                          style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b',
                            border: 'none', borderRadius: 10, padding: '11px 0',
                            cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                          {t('service_detail.back_button')}
                        </button>
                        <button onClick={handleRequest} disabled={sending}
                          style={{ flex: 2, background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                            color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0',
                            cursor: sending ? 'not-allowed' : 'pointer',
                            fontWeight: 800, fontSize: 13 }}>
                          {sending ? t('service_detail.sending_button') : t('service_detail.send_request_button')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => isLoggedIn ? setShowForm(true) : onNavigate('PublicLogin')}
                        style={{ width: '100%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
                          color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0',
                          cursor: 'pointer', fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
                        {t('service_detail.request_service_button')}
                      </button>
                      {waPhone && (
                        <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`}
                          target="_blank" rel="noreferrer"
                          style={{ display: 'block', textAlign: 'center', width: '100%',
                            backgroundColor: '#dcfce7', color: '#16a34a', textDecoration: 'none',
                            borderRadius: 12, padding: '12px 0', fontSize: 14,
                            fontWeight: 700, boxSizing: 'border-box' }}>
                          {t('service_detail.whatsapp_contact_button')}
                        </a>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Views */}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              {t('service_detail.views_count', { count: ad.views + 1 })}

                {/* Transport availability link */}
                {ad.category === 'usafirishaji' && (
                  <div style={{ backgroundColor: '#eff6ff', borderRadius: 14,
                    padding: 18, marginTop: 16, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>
                      {t('service_detail.transport_verified_title')}
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
                      {t('service_detail.transport_verified_desc')}
                    </div>
                    <button onClick={() => onNavigate('TransportProviderDashboard')}
                      style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                        border: 'none', borderRadius: 8, padding: '10px 0',
                        cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {t('service_detail.view_todays_trips')}
                    </button>
                  </div>
                )}

            </div>

            {/* Comments/questions from the wider engagement system — this
                service had nowhere at all to show them before, so a "New
                comment" notification about it landed here with no way to
                actually see or reply to it. */}
            <div ref={commentsRef} style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
                {t('service_detail.comments_title')}
              </div>
              <CommerceCommentSection
                entityType="service" entityId={ad.id}
                entityTitle={ad.title} sellerId={ad.provider?.id}
                isLoggedIn={isLoggedIn} currentUser={currentUser} onNavigate={onNavigate} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceDetail;