import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/api';
import { useTranslation } from 'react-i18next';
import { SkeletonGrid } from '../components/Loading';
import { DK, GR, WH, LINE, Icon, I, ClassifiedCard } from '../components/ListingCard';

/** All listings, filterable by category and words (owner 2026-10-26 redesign: same look as Soko, no emoji). */

const ClassifiedsPublic = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [classifieds, setClassifieds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { t } = useTranslation();

  // Fetched from GET /categories — this list used to be hardcoded here with
  // its own key set, including an 'other' filter chip that never matched
  // anything (the real backend category was 'general'), silently filtering
  // to zero results whenever clicked.
  const [categories, setCategories] = useState([{ key: 'all', label: 'Zote' }]);
  useEffect(() => {
    api.get('/categories').then(res => {
      setCategories([
        { key: 'all', label: 'Zote' },
        ...(res.data || []).map(c => ({ key: c.key, label: c.label })),
      ]);
    }).catch(() => {});
  }, []);

  const fetchClassifieds = useCallback(async () => {
    try {
      setLoading(true);
      // Always fetch all, filter client-side for instant search
      const res = await api.get('/classifieds');
      setClassifieds(res.data || []);
    } catch (err) {
      console.error(err);
      setClassifieds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClassifieds(); }, [fetchClassifieds]);

  const handleSearch = () => setSearch(searchInput.trim().toLowerCase());
  const handleCategoryClick = (key) => { setFilter(key); setSearch(''); setSearchInput(''); };

  // Filter: category + search across title, description, location
  const filtered = classifieds.filter(c => {
    const matchCat    = filter === 'all' || c.category === filter;
    const matchSearch = !search || (
      c.title?.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search) ||
      c.location?.toLowerCase().includes(search) ||
      c.category?.toLowerCase().includes(search)
    );
    return matchCat && matchSearch && c.status === 'active';
  });

  const clearAll = () => { setSearch(''); setSearchInput(''); setFilter('all'); };
  const chip = (on) => ({ flexShrink:0, height:36, padding:'0 14px', borderRadius:18, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
    fontSize:14, fontWeight: on ? 700 : 600, border: on ? 'none' : '1px solid #cfd9de', backgroundColor: on ? DK : WH, color: on ? WH : DK });

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:WH, color:DK, paddingBottom:90, fontFamily:'inherit' }}>
      <header style={{ position:'sticky', top:0, zIndex:100, backgroundColor:'rgba(255,255,255,0.96)', backdropFilter:'blur(8px)',
        borderBottom:`1px solid ${LINE}`, padding:'6px 16px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, height:44 }}>
          <button type="button" aria-label={t('common.back')} onClick={() => onNavigate('back')}
            style={{ width:40, height:40, marginLeft:-8, borderRadius:20, border:'none', background:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon d="M15 6l-6 6 6 6" size={22} color={DK} />
          </button>
          <h1 style={{ margin:0, fontSize:20, fontWeight:800, flex:1 }}>{t('classifieds.title')}</h1>
          {isLoggedIn && (
            <button type="button" onClick={() => onNavigate('CreateClassified')}
              style={{ height:36, padding:'0 14px', borderRadius:18, border:'none', backgroundColor:DK, color:WH, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              Weka tangazo
            </button>
          )}
        </div>
        <form role="search" onSubmit={e => { e.preventDefault(); handleSearch(); }}
          style={{ display:'flex', alignItems:'center', gap:10, height:44, borderRadius:22, backgroundColor:LINE, padding:'0 6px 0 16px', marginTop:6 }}>
          <Icon d={I.search} size={18} />
          <input type="search" aria-label="Tafuta matangazo" placeholder="Tafuta matangazo" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{ flex:1, minWidth:0, border:'none', background:'none', outline:'none', fontSize:15, color:DK, fontFamily:'inherit' }} />
          {searchInput.trim() && (
            <button type="submit" style={{ height:34, padding:'0 14px', borderRadius:17, border:'none', backgroundColor:'#1d4ed8', color:WH, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Tafuta</button>
          )}
        </form>
        <nav aria-label="Aina" style={{ display:'flex', gap:8, overflowX:'auto', scrollbarWidth:'none', marginTop:10 }}>
          {categories.map(cat => (
            <button type="button" key={cat.key} onClick={() => handleCategoryClick(cat.key)} style={chip(filter === cat.key)}>{cat.label}</button>
          ))}
        </nav>
      </header>

      <div style={{ padding:'12px 16px 4px', fontSize:14, color:GR, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span>{filtered.length} {t('classifieds.found')}</span>
        {search && <span>· "{search}"</span>}
        {(search || filter !== 'all') && (
          <button type="button" onClick={clearAll} style={{ padding:0, border:'none', background:'none', color:'#1d4ed8', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Ondoa vichujio</button>
        )}
      </div>

      <div style={{ padding:'8px 16px 20px', flex:1 }}>
        {loading ? (
          <SkeletonGrid count={6} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <span style={{ width:56, height:56, borderRadius:28, backgroundColor:'#f7f9f9', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon d={I.search} size={26} /></span>
            <p style={{ fontWeight:800, fontSize:17, margin:0 }}>Hakuna matangazo</p>
            <p style={{ fontSize:14, color:GR, margin:0 }}>{search ? `Hakuna matokeo ya "${search}"` : 'Bado hakuna matangazo kwenye aina hii'}</p>
            {(search || filter !== 'all') && (
              <button type="button" onClick={clearAll}
                style={{ marginTop:8, height:44, padding:'0 22px', borderRadius:22, border:'none', backgroundColor:DK, color:WH, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                Ona matangazo yote
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:'16px 12px' }}>
            {filtered.map(item => <ClassifiedCard key={item.id} item={item} onNavigate={onNavigate} isLoggedIn={isLoggedIn} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassifiedsPublic;
