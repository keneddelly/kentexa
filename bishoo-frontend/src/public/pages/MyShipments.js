import React,{useEffect,useState} from 'react';
import api from '../../api/api';
import ShipmentPickupPanel from '../components/ShipmentPickupPanel';

const STATUS={pending:'Request created',confirmed:'Confirmed',collected:'Collected',in_transit:'In transit',delivered:'Delivered',completed:'Completed',cancelled:'Cancelled'};

export default function MyShipments({onNavigate}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{api.get('/shipments/mine').then(r=>setRows(r.data||[])).catch(e=>setError(e.response?.data?.message||'Could not load shipments')).finally(()=>setLoading(false));},[]);
  return <div style={{minHeight:'100vh',background:'#f8fafc',paddingBottom:80,fontFamily:'Manrope,Inter,sans-serif'}}>
    <div style={{background:'#fff',padding:'14px 16px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:10}}>
      <button onClick={()=>onNavigate('back')} style={{border:'none',background:'none',fontSize:22}}>‹</button><strong style={{fontSize:18}}>My Shipments</strong>
      <button onClick={()=>onNavigate('SendShipment')} style={{marginLeft:'auto',border:'none',borderRadius:10,padding:'9px 12px',background:'#2563eb',color:'#fff',fontWeight:800}}>+ Send</button>
    </div>
    <div style={{maxWidth:620,margin:'0 auto',padding:16}}>
      <div style={{fontSize:13,color:'#64748b',marginBottom:14}}>Shipments you created directly in Kentexa. Marketplace purchases remain under My Orders.</div>
      {loading&&<div>Loading…</div>}{error&&<div style={{color:'#dc2626'}}>{error}</div>}
      {!loading&&!error&&!rows.length&&<div style={{background:'#fff',padding:28,borderRadius:14,textAlign:'center',color:'#64748b'}}>You have not sent a shipment yet.</div>}
      {rows.map(s=><div key={s.id} role="button" tabIndex={0} onClick={()=>onNavigate(`TrackParcel-${s.trackingNumber}`)} onKeyDown={e=>{if(e.key==='Enter')onNavigate(`TrackParcel-${s.trackingNumber}`);}} style={{display:'block',width:'100%',boxSizing:'border-box',textAlign:'left',cursor:'pointer',background:'#fff',borderRadius:14,padding:15,marginBottom:10,boxShadow:'0 2px 8px rgba(0,0,0,.05)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{fontSize:14}}>{s.itemDescription||'Shipment'}</strong><span style={{fontSize:11,fontWeight:800,color:'#2563eb'}}>{STATUS[s.status]||s.status}</span></div>
        <div style={{fontSize:12,color:'#475569',marginTop:7}}>{s.originCity} → {s.destinationCity}</div>
        <div style={{fontSize:12,color:'#64748b',marginTop:5}}>Tracking: <strong style={{color:'#0f172a'}}>{s.trackingNumber}</strong>{Number(s.weightKg)>0?` · ${s.weightKg} kg`:''}</div>
        {/* Agent pickup: request it, see who is coming, get the handover code. */}
        {['confirmed','collected'].includes(s.status) && <ShipmentPickupPanel shipment={s} />}
      </div>)}
    </div>
  </div>;
}
