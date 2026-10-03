import React, { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../../api/api';

const card = { background:'#fff', borderRadius:14, padding:16, boxShadow:'0 2px 10px rgba(15,23,42,.06)' };
const badge = (status) => {
  const map = { scheduled:['#eff6ff','#1d4ed8'], active:['#ecfdf5','#047857'], in_transit:['#ecfdf5','#047857'], completed:['#f1f5f9','#475569'], cancelled:['#fef2f2','#b91c1c'] };
  const [bg,color] = map[String(status || '').toLowerCase()] || ['#f8fafc','#475569'];
  return { background:bg, color, borderRadius:999, padding:'4px 9px', fontSize:11, fontWeight:800 };
};

export default function VanOperations({ onNavigate, activePage }) {
  const [runs,setRuns]=useState([]), [blocked,setBlocked]=useState([]), [awaiting,setAwaiting]=useState([]);
  const [selected,setSelected]=useState(null), [loading,setLoading]=useState(true), [error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try {
      const [r,b,a]=await Promise.all([
        api.get('/van-pilot/admin/runs'),
        api.get('/van-pilot/admin/parcels/blocked'),
        api.get('/van-pilot/admin/parcels/awaiting-completion'),
      ]);
      setRuns(r.data||[]); setBlocked(b.data||[]); setAwaiting(a.data||[]);
    } catch(e){ setError(e.response?.data?.message || 'Imeshindwa kupakia Van Operations.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);

  const openRun=async(id)=>{
    try { const r=await api.get('/van-pilot/admin/runs/'+id); setSelected(r.data); }
    catch(e){ setError(e.response?.data?.message || 'Run haikupatikana.'); }
  };

  return <div style={{display:'flex',minHeight:'100vh',background:'#f8fafc'}}>
    <Sidebar activePage={activePage} onNavigate={onNavigate}/>
    <main className="admin-content" style={{flex:1,marginLeft:250,padding:24,boxSizing:'border-box'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:20,flexWrap:'wrap'}}>
        <div><div style={{fontSize:22,fontWeight:900,color:'#0f172a'}}>🚐 Van Operations</div>
          <div style={{fontSize:13,color:'#64748b',marginTop:3}}>Runs, hub exceptions na parcels zinazongoja completion — production view.</div></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={()=>onNavigate('DispatcherManifest')} style={{border:0,borderRadius:10,padding:'10px 14px',background:'#0f172a',color:'#fff',fontWeight:800,cursor:'pointer'}}>📋 Today's Manifest</button>
          <button onClick={()=>onNavigate('TransportAdmin')} style={{border:'1px solid #cbd5e1',borderRadius:10,padding:'10px 14px',background:'#fff',color:'#0f172a',fontWeight:800,cursor:'pointer'}}>🚌 Transport Providers</button>
          <button onClick={()=>onNavigate('ZoneManagement')} style={{border:'1px solid #cbd5e1',borderRadius:10,padding:'10px 14px',background:'#fff',color:'#0f172a',fontWeight:800,cursor:'pointer'}}>🗺️ Van Route</button>
          <button onClick={load} style={{border:0,borderRadius:10,padding:'10px 14px',background:'#2563eb',color:'#fff',fontWeight:800,cursor:'pointer'}}>Refresh</button>
        </div>
      </div>
      <div style={{...card,marginBottom:14,border:'1px solid #dbeafe',background:'#eff6ff'}}>
        <div style={{fontSize:13,fontWeight:900,color:'#1e3a8a'}}>Operations desk</div>
        <div style={{fontSize:12,color:'#475569',marginTop:4,lineHeight:1.55}}>Today's Manifest opens the existing daily dispatch workflow (receive at hub, depart, zone arrival and delivery). Stage 3S runs below are the new movement/custody model. Load, unload and hub receipt remain actions of the Transport Provider or Super Agent role.</div>
      </div>
      {error && <div style={{background:'#fef2f2',color:'#b91c1c',padding:12,borderRadius:10,marginBottom:14}}>{error}</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:18}}>
        {[['Active / recent Runs',runs.length,'🚐'],['Blocked receipt',blocked.length,'⚠️'],['Awaiting completion',awaiting.length,'📦']].map(([l,v,i])=>
          <div key={l} style={card}><div style={{fontSize:24}}>{i}</div><div style={{fontSize:26,fontWeight:900,color:'#0f172a',marginTop:6}}>{v}</div><div style={{fontSize:12,color:'#64748b'}}>{l}</div></div>)}
      </div>
      {loading ? <div style={card}>Inapakia...</div> : <>
        <section style={{...card,marginBottom:16}}>
          <div style={{fontWeight:900,color:'#0f172a',marginBottom:12}}>Transport Runs</div>
          <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>{['Run','Provider','Route','Departure','Load','Status',''].map(h=><th key={h} style={{textAlign:'left',padding:'9px 8px',color:'#64748b',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}</tr></thead>
            <tbody>{runs.map(r=><tr key={r.id}>
              <td style={{padding:8,fontWeight:800}}>#{r.id}</td><td style={{padding:8}}>#{r.providerId}</td><td style={{padding:8}}>#{r.routeId}</td>
              <td style={{padding:8}}>{r.scheduledDeparture?new Date(r.scheduledDeparture).toLocaleString('sw-TZ'):'—'}</td>
              <td style={{padding:8}}>{r.activeAssignmentCount}{r.parcelCapacity!=null?' / '+r.parcelCapacity:''}</td>
              <td style={{padding:8}}><span style={badge(r.status)}>{r.status}</span></td>
              <td style={{padding:8}}><button onClick={()=>openRun(r.id)} style={{border:0,background:'#eff6ff',color:'#1d4ed8',borderRadius:8,padding:'6px 9px',fontWeight:800,cursor:'pointer'}}>View</button></td>
            </tr>)}</tbody></table></div>
          {runs.length===0&&<div style={{padding:20,textAlign:'center',color:'#94a3b8'}}>Hakuna Run bado.</div>}
        </section>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16}}>
          <section style={card}><div style={{fontWeight:900,marginBottom:10}}>⚠️ Unloaded, waiting hub receipt</div>
            {blocked.length===0?<div style={{color:'#64748b',fontSize:12}}>Hakuna parcel iliyokwama.</div>:blocked.map(x=><div key={x.assignmentId} style={{padding:'10px 0',borderBottom:'1px solid #f1f5f9',fontSize:12}}><b>Parcel #{x.parcelId}</b> · Run #{x.runId}<br/><span style={{color:'#64748b'}}>Hub #{x.superAgentId} · {Math.round(Number(x.waitingMinutes)||0)} min waiting</span></div>)}</section>
          <section style={card}><div style={{fontWeight:900,marginBottom:10}}>📦 Awaiting last mile / pickup</div>
            {awaiting.length===0?<div style={{color:'#64748b',fontSize:12}}>Hakuna parcel inayosubiri completion.</div>:awaiting.map(x=><div key={x.id} style={{padding:'10px 0',borderBottom:'1px solid #f1f5f9',fontSize:12}}><b>{x.trackingNumber||('Parcel #'+x.id)}</b><br/><span style={{color:'#64748b'}}>{x.status} · Hub #{x.destinationSuperAgentId||'—'}</span></div>)}</section>
        </div>
      </>}
      {selected && <div onClick={()=>setSelected(null)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.5)',zIndex:200,display:'flex',justifyContent:'flex-end'}}>
        <div onClick={e=>e.stopPropagation()} style={{width:'min(480px,100%)',height:'100%',background:'#fff',padding:20,overflowY:'auto',boxSizing:'border-box'}}>
          <div style={{display:'flex',justifyContent:'space-between'}}><div style={{fontSize:18,fontWeight:900}}>Run #{selected.run?.id}</div><button onClick={()=>setSelected(null)} style={{border:0,background:'none',fontSize:22}}>×</button></div>
          <div style={{fontSize:12,color:'#64748b',margin:'6px 0 18px'}}>Status: {selected.run?.status} · Provider #{selected.run?.providerId}</div>
          {(selected.stops||[]).map(s=>{const n=selected.assignmentsByStop?.[s.id]||{};return <div key={s.id} style={{...card,boxShadow:'none',border:'1px solid #e2e8f0',marginBottom:10}}>
            <div style={{fontWeight:900}}>Stop {s.sequence}: {s.label||s.city||('Hub #'+(s.superAgentId||'—'))}</div>
            <div style={{fontSize:12,color:'#64748b',marginTop:5}}>Loading: {n.loading||0} · Unloading: {n.unloading||0}{s.superAgentId?' · Super Agent #'+s.superAgentId:''}</div>
          </div>})}
          <div style={{fontSize:12,color:'#64748b',marginTop:14}}>Admin is visibility/control only. Load, unload, receipt and custody writes remain with the authorized Transport Provider or Super Agent role.</div>
        </div>
      </div>}
    </main>
  </div>;
}
