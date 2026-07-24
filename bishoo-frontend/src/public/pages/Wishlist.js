/**
 * Wishlist.js — Buyer's saved items
 * Place at: src/public/pages/Wishlist.js
 */
import React, { useState, useEffect } from 'react';
import Navbar   from '../components/Navbar';
import BackBar  from '../components/BackBar';
import Footer   from '../components/Footer';
import api      from '../../api/api';

const fmt = n => Number(n||0).toLocaleString();

const Wishlist = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchWishlist = async () => {
    try {
      setLoading(true);
      const res = await api.get('/wishlist');
      setItems(res.data || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchWishlist(); }, []);

  const handleRemove = async (id) => {
    try {
      await api.delete(`/wishlist/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch { alert('Imeshindwa kuondoa'); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', backgroundColor:'#f1f5f9' }}>
      <Navbar currentPage="Wishlist" onNavigate={onNavigate}
        isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />
      <BackBar onBack={() => onNavigate('back')} title="❤️ Bidhaa Zilizohifadhiwa" />

      <div style={{ flex:1, padding:'16px 16px 40px', maxWidth:900,
        margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>❤️</div>
            <div>Inapakia...</div>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:'center', padding:80, backgroundColor:'#fff',
            borderRadius:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🤍</div>
            <div style={{ fontSize:20, fontWeight:900, color:'#1e293b', marginBottom:8 }}>
              Hujahifadhi bidhaa yoyote
            </div>
            <div style={{ fontSize:14, color:'#64748b', marginBottom:24 }}>
              Bonyeza ❤️ kwenye bidhaa yoyote ili kuihifadhi hapa
            </div>
            <button onClick={() => onNavigate('Classifieds')}
              style={{ backgroundColor:'#1d4ed8', color:'#fff', border:'none',
                borderRadius:12, padding:'12px 28px', cursor:'pointer',
                fontSize:14, fontWeight:700 }}>
              🛍️ Tembea Sokoni
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
              Bidhaa {items.length} zilizohifadhiwa
            </div>
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16 }}>
              {items.map(item => {
                const c = item.classified;
                if (!c) return null;
                return (
                  <div key={item.id} style={{ backgroundColor:'#fff', borderRadius:16,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden',
                    position:'relative' }}>

                    {/* Remove button */}
                    <button onClick={() => handleRemove(item.id)}
                      style={{ position:'absolute', top:8, right:8, zIndex:10,
                        backgroundColor:'rgba(0,0,0,0.5)', color:'#fff', border:'none',
                        borderRadius:'50%', width:28, height:28, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:14 }}>
                      ✕
                    </button>

                    {/* Image */}
                    <div onClick={() => onNavigate(`ClassifiedDetail-${c.id}`)}
                      style={{ height:160, backgroundColor:'#f8fafc', cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        overflow:'hidden' }}>
                      {c.images?.[0]
                        ? <img src={c.images[0]} alt={c.title}
                            style={{ width:'100%', height:'100%', objectFit:'cover' }}
                            onError={e => e.target.style.display='none'} />
                        : <span style={{ fontSize:48 }}>🏷️</span>}
                    </div>

                    <div style={{ padding:14 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1e293b',
                        marginBottom:6, overflow:'hidden',
                        textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize:18, fontWeight:900, color:'#1d4ed8', marginBottom:4 }}>
                        TZS {fmt(c.price)}
                      </div>
                      <div style={{ fontSize:11, color:'#64748b', marginBottom:10 }}>
                        📍 {c.location || 'Tanzania'}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => onNavigate(`ClassifiedDetail-${c.id}`)}
                          style={{ flex:1, backgroundColor:'#1d4ed8', color:'#fff',
                            border:'none', borderRadius:8, padding:'8px 0',
                            cursor:'pointer', fontSize:12, fontWeight:700 }}>
                          Angalia →
                        </button>
                        <button onClick={() => {
                          const phone = c.seller?.phone || '';
                          const msg = `Habari! Nimevutiwa na tangazo lako: ${c.title} - TZS ${fmt(c.price)}`;
                          window.open(`https://wa.me/${phone.replace(/^0/, '255')}?text=${encodeURIComponent(msg)}`);
                        }}
                          style={{ backgroundColor:'#dcfce7', color:'#16a34a',
                            border:'none', borderRadius:8, padding:'8px 12px',
                            cursor:'pointer', fontSize:14 }}>
                          📲
                        </button>
                      </div>
                      <div style={{ fontSize:10, color:'#94a3b8', marginTop:6 }}>
                        Ilihifadhiwa: {new Date(item.savedAt).toLocaleDateString('sw-TZ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};

export default Wishlist;