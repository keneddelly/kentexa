import React,{useEffect,useState} from 'react';
import api from '../../api/api';
import ShipmentPickupPanel from '../components/ShipmentPickupPanel';

const STATUS={
  pending:'Ombi limeundwa',
  confirmed:'Tunajiandaa kuchukua mzigo',
  collected:'Mzigo umechukuliwa',
  received_at_hub:'Mzigo umefika kituoni',
  ready_for_dispatch:'Tayari kusafirishwa',
  dispatched:'Safari imeanza',
  in_transit:'Mzigo uko safarini',
  arrived_at_hub:'Mzigo umefika unakoenda',
  out_for_delivery:'Unaletwa kwa mpokeaji',
  delivered:'Mzigo umefikishwa',
  completed:'Imekamilika',
  cancelled:'Imeghairiwa'
};
const statusLabel=s=>STATUS[String(s||'').toLowerCase()]||'Inaendelea';
export default function MyShipments({onNavigate}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{
    let active=true;
    api.get('/shipments/mine')
      .then(r=>{
        if(!active)return;
        const payload=r.data;
        const items=Array.isArray(payload)?payload:(Array.isArray(payload?.shipments)?payload.shipments:null);
        if(!items)throw new Error('Majibu ya mizigo si sahihi. Tafadhali jaribu tena.');
        setRows(items);
      })
      .catch(e=>{if(active)setError(e.response?.data?.message||e.message||'Imeshindikana kupakia mizigo yako');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[reload]);
  return <div style={{minHeight:'100vh',background:'#f8fafc',paddingBottom:80,fontFamily:'Manrope,Inter,sans-serif'}}>
    <div style={{background:'#fff',padding:'14px 16px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:10}}>
      <button onClick={()=>onNavigate('back')} style={{border:'none',background:'none',fontSize:22}}>‹</button><strong style={{fontSize:18}}>Mizigo Yangu</strong>
      <button onClick={()=>onNavigate('SendShipment')} style={{marginLeft:'auto',border:'none',borderRadius:10,padding:'10px 14px',background:'#2563eb',color:'#fff',fontWeight:800}}>+ Tuma mzigo</button>
    </div>
    <div style={{maxWidth:620,margin:'0 auto',padding:16}}>
      <div style={{fontSize:15,color:'#64748b',lineHeight:1.5,marginBottom:14}}>Hapa utaona mizigo uliyotuma na hatua ilipofikia. Kentexa itakuonyesha hatua muhimu bila kukusumbua na mchakato wa ndani.</div>
      {loading&&<div role="status">Inapakia…</div>}{!loading&&error&&<div role="alert" style={{background:'#fff',borderRadius:12,padding:20,color:'#b91c1c'}}><div>{String(error)}</div><button onClick={()=>{setError('');setLoading(true);setReload(n=>n+1);}} style={{marginTop:12,padding:'10px 16px',borderRadius:10,border:'1px solid #2563eb',color:'#2563eb',background:'#fff',fontWeight:700}}>Jaribu tena</button></div>}
      {!loading&&!error&&!rows.length&&<div style={{background:'#fff',padding:28,borderRadius:14,textAlign:'center',color:'#64748b'}}>Bado hujatuma mzigo kupitia Kentexa.</div>}
      {!loading&&!error&&rows.map(s=><div key={s.id} role="button" tabIndex={0} onClick={()=>s.trackingNumber&&onNavigate(`TrackParcel-${s.trackingNumber}`)} onKeyDown={e=>{if(e.key==='Enter'&&s.trackingNumber)onNavigate(`TrackParcel-${s.trackingNumber}`);}} style={{display:'block',width:'100%',boxSizing:'border-box',textAlign:'left',cursor:'pointer',background:'#fff',borderRadius:14,padding:16,marginBottom:10,boxShadow:'0 2px 8px rgba(0,0,0,.05)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}><strong style={{fontSize:16,color:'#0f172a'}}>{s.itemDescription||'Mzigo'}</strong><span style={{fontSize:12,fontWeight:900,color:'#2563eb',textAlign:'right'}}>{statusLabel(s.status)}</span></div>
        <div style={{fontSize:14,color:'#475569',marginTop:8,fontWeight:700}}>{s.originCity} → {s.destinationCity}</div>
        <div style={{fontSize:13,color:'#64748b',marginTop:6}}>Namba ya ufuatiliaji: <strong style={{color:'#0f172a'}}>{s.trackingNumber}</strong>{Number(s.weightKg)>0?` · ${s.weightKg} kg`:''}</div>
        {['confirmed','collected'].includes(s.status) && <ShipmentPickupPanel shipment={s} />}
      </div>)}
    </div>
  </div>;
}
