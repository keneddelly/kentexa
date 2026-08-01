/**
 * MyServices.js — Provider manages ads + responds to job requests
 * Place at: src/public/pages/MyServices.js
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const getJobStatus = (t) => ({
  pending:     { bg: '#fef3c7', text: '#d97706', label: t('my_services.status_pending')    },
  accepted:    { bg: '#dcfce7', text: '#16a34a', label: t('my_services.status_accepted')  },
  declined:    { bg: '#fee2e2', text: '#dc2626', label: t('my_services.status_declined')  },
  in_progress: { bg: '#dbeafe', text: '#1d4ed8', label: t('my_services.status_in_progress')  },
  completed:   { bg: '#f0fdf4', text: '#15803d', label: t('my_services.status_completed')  },
  cancelled:   { bg: '#f1f5f9', text: '#64748b', label: t('my_services.status_cancelled')    },
});

const fmt = n => Number(n||0).toLocaleString();

const MyServices = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = { en: 'en-US', sw: 'sw-TZ', fr: 'fr-FR' }[i18n.language] || 'en-US';
  const JOB_STATUS = getJobStatus(t);
  const [ads,     setAds]     = useState([]);
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('jobs');
  const [acting,  setActing]  = useState(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [adsRes, jobsRes] = await Promise.all([
        api.get('/services/my/ads'),
        api.get('/services/my/jobs'),
      ]);
      setAds(adsRes.data  || []);
      setJobs(jobsRes.data || []);
    } catch { setAds([]); setJobs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleRespond = async (jobId, accept) => {
    const agreedPrice = accept ? prompt(t('my_services.prompt_agreed_price')) : null;
    const note        = !accept ? prompt(t('my_services.prompt_decline_reason')) : null;
    try {
      setActing(jobId);
      await api.patch(`/services/jobs/${jobId}/respond`, {
        accept, agreedPrice: agreedPrice ? Number(agreedPrice) : undefined,
        providerNote: note || undefined,
      });
      fetchAll();
    } catch { alert(t('my_services.action_failed')); }
    finally { setActing(null); }
  };

  const handleStatus = async (jobId, status) => {
    try {
      setActing(jobId);
      await api.patch(`/services/jobs/${jobId}/status`, { status });
      fetchAll();
    } catch { alert(t('my_services.action_failed')); }
    finally { setActing(null); }
  };

  const handleToggleAd = async (adId, currentStatus) => {
    try {
      await api.patch(`/services/my/ads/${adId}`, {
        status: currentStatus === 'active' ? 'paused' : 'active',
      });
      fetchAll();
    } catch { alert(t('my_services.action_failed')); }
  };

  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const activeJobs  = jobs.filter(j => ['accepted','in_progress'].includes(j.status));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column',
      backgroundColor: '#f8fafc', fontFamily: 'Manrope,Inter,-apple-system,sans-serif' }}>
      <Navbar currentPage="MyServices" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title={t('my_services.page_title')} />

      <div style={{ flex: 1, maxWidth: 900, margin: '0 auto',
        padding: '16px 16px 48px', width: '100%', boxSizing: 'border-box' }}>

        {/* Stats header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '📋', label: t('my_services.stat_ads'), value: ads.length,          bg: '#eff6ff', color: '#1d4ed8' },
            { icon: '⏳', label: t('my_services.stat_pending'), value: pendingJobs.length,  bg: '#fef3c7', color: '#d97706' },
            { icon: '🔨', label: t('my_services.stat_in_progress'), value: activeJobs.length,  bg: '#dcfce7', color: '#16a34a' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12,
          padding: 4, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[
            { key: 'jobs', label: t('my_services.tab_jobs') + (pendingJobs.length > 0 ? t('my_services.tab_jobs_new', { count: pendingJobs.length }) : '') },
            { key: 'ads',  label: t('my_services.tab_ads') },
            { key: 'done', label: t('my_services.tab_done')   },
          ].map(tabItem => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              style={{ flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer',
                borderRadius: 9, fontSize: 12, fontWeight: 700,
                backgroundColor: tab === tabItem.key ? '#1d4ed8' : 'transparent',
                color: tab === tabItem.key ? '#fff' : '#64748b' }}>
              {tabItem.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{t('my_services.loading')}</div>
        ) : (<>

          {/* Jobs tab */}
          {tab === 'jobs' && (
            <div>
              {jobs.filter(j => !['completed','cancelled','declined'].includes(j.status)).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff',
                  borderRadius: 16, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div>{t('my_services.no_jobs')}</div>
                </div>
              ) : jobs.filter(j => !['completed','cancelled','declined'].includes(j.status)).map(job => {
                const sc = JOB_STATUS[job.status] || JOB_STATUS.pending;
                return (
                  <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14,
                    padding: 18, marginBottom: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    border: job.status === 'pending' ? '2px solid #fbbf24' : '1px solid #f1f5f9' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                          {job.serviceAd?.title || t('my_services.default_service_name')}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                          👤 {job.buyer?.name || t('my_services.default_buyer_name')} · {job.buyer?.phone || ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px',
                        borderRadius: 100, backgroundColor: sc.bg, color: sc.text }}>
                        {sc.label}
                      </span>
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', borderRadius: 10,
                      padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#475569' }}>
                      "{job.description}"
                    </div>

                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#64748b',
                      marginBottom: job.status === 'pending' ? 12 : 0, flexWrap: 'wrap' }}>
                      {job.jobLocation && <span>📍 {job.jobLocation}</span>}
                      {job.preferredDate && <span>📅 {job.preferredDate}</span>}
                      {job.preferredTime && <span>🕐 {job.preferredTime}</span>}
                      {job.agreedPrice   && <span style={{ fontWeight: 700, color: '#16a34a' }}>
                        💰 TZS {fmt(job.agreedPrice)}
                      </span>}
                    </div>

                    {/* Actions */}
                    {job.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleRespond(job.id, true)}
                          disabled={acting === job.id}
                          style={{ flex: 1, backgroundColor: '#dcfce7', color: '#16a34a',
                            border: 'none', borderRadius: 8, padding: '10px 0',
                            cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                          {t('my_services.accept_button')}
                        </button>
                        <button onClick={() => handleRespond(job.id, false)}
                          disabled={acting === job.id}
                          style={{ flex: 1, backgroundColor: '#fee2e2', color: '#dc2626',
                            border: 'none', borderRadius: 8, padding: '10px 0',
                            cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                          {t('my_services.decline_button')}
                        </button>
                        {job.buyer?.phone && (
                          <a href={`https://wa.me/${(job.buyerPhone||job.buyer.phone).replace(/^0/,'255')}?text=${encodeURIComponent('Habari! Nimeona ombi lako la huduma kwenye KenteXa.')}`}
                            target="_blank" rel="noreferrer"
                            style={{ backgroundColor: '#f0fdf4', color: '#16a34a',
                              border: 'none', borderRadius: 8, padding: '10px 14px',
                              textDecoration: 'none', fontSize: 16 }}>
                            📲
                          </a>
                        )}
                      </div>
                    )}

                    {job.status === 'accepted' && (
                      <button onClick={() => handleStatus(job.id, 'in_progress')}
                        disabled={acting === job.id}
                        style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                          border: 'none', borderRadius: 8, padding: '10px 0',
                          cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        {t('my_services.start_job_button')}
                      </button>
                    )}

                    {job.status === 'in_progress' && (
                      <button onClick={() => handleStatus(job.id, 'completed')}
                        disabled={acting === job.id}
                        style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff',
                          border: 'none', borderRadius: 8, padding: '10px 0',
                          cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                        {t('my_services.complete_job_button')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ads tab */}
          {tab === 'ads' && (
            <div>
              <button onClick={() => onNavigate('PostService')}
                style={{ width: '100%', backgroundColor: '#1d4ed8', color: '#fff',
                  border: 'none', borderRadius: 12, padding: '13px 0',
                  cursor: 'pointer', fontSize: 14, fontWeight: 800, marginBottom: 16 }}>
                {t('my_services.add_new_ad_button')}
              </button>

              {ads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff',
                  borderRadius: 16, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
                  <div>{t('my_services.no_ads')}</div>
                </div>
              ) : ads.map(ad => (
                <div key={ad.id} style={{ backgroundColor: '#fff', borderRadius: 14,
                  padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  opacity: ad.status === 'inactive' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                        {ad.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                        👁️ {ad.views} {t('my_services.views_label')} · ⭐ {Number(ad.rating).toFixed(1)} · {ad.totalJobs} {t('my_services.jobs_label')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleToggleAd(ad.id, ad.status)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          backgroundColor: ad.status === 'active' ? '#fef3c7' : '#dcfce7',
                          color: ad.status === 'active' ? '#d97706' : '#16a34a' }}>
                        {ad.status === 'active' ? t('my_services.pause_button') : t('my_services.activate_button')}
                      </button>
                      <button onClick={() => onNavigate(`ServiceDetail-${ad.id}`)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none',
                          cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                        {t('my_services.view_button')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Completed tab */}
          {tab === 'done' && (
            <div>
              {jobs.filter(j => j.status === 'completed').length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, backgroundColor: '#fff',
                  borderRadius: 16, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div>{t('my_services.no_completed')}</div>
                </div>
              ) : jobs.filter(j => j.status === 'completed').map(job => (
                <div key={job.id} style={{ backgroundColor: '#fff', borderRadius: 14,
                  padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
                    {job.serviceAd?.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                    👤 {job.buyer?.name} · {new Date(job.completedAt).toLocaleDateString(dateLocale)}
                  </div>
                  {job.agreedPrice > 0 && (
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#16a34a' }}>
                      TZS {fmt(job.agreedPrice)}
                    </div>
                  )}
                  {job.rating && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ color: '#f59e0b' }}>{'★'.repeat(job.rating)}{'☆'.repeat(5 - job.rating)}</span>
                      {job.review && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>"{job.review}"</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default MyServices;