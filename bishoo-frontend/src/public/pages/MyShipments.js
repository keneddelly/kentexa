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
  const [claimOpen,setClaimOpen]=useState(false);
  const [claimId,setClaimId]=useState('');
  const [receiptSecret,setReceiptSecret]=useState('');
  const [otp,setOtp]=useState('');
  const [claimStep,setClaimStep]=useState('receipt');
  const [claimBusy,setClaimBusy]=useState(false);
  const [claimError,setClaimError]=useState('');
  const submitClaim=async e=>{
    e.preventDefault();
    if(claimBusy)return;
    const id=Number(claimId);
    if(!Number.isSafeInteger(id)||id<=0){setClaimError('Weka namba sahihi ya Shipment kwenye risiti.');return;}
    setClaimBusy(true);setClaimError('');
    try{
      if(claimStep==='receipt'){
        await api.post(`/shipments/${id}/claim/start`,{receiptSecret:receiptSecret.trim()});
        setClaimStep('otp');
      }else{
        await api.post(`/shipments/${id}/claim`,{receiptSecret:receiptSecret.trim(),otp:otp.trim()});
        setClaimOpen(false);setClaimId('');setReceiptSecret('');setOtp('');setClaimStep('receipt');
        setLoading(true);setReload(n=>n+1);
      }
    }catch(err){
      const message=err.response?.data?.message;
      setClaimError(Array.isArray(message)?message.join(', '):message||'Imeshindikana kuthibitisha. Jaribu tena.');
    }finally{setClaimBusy(false);}
  };
  useEffect(()=>{
    let active=true;
    api.get('/shipments/mine')
      .then(r=>{
        if(!active)return;
        const payload=r.data;
        const items=Array.isArray(payload)?payload:(Array.isArray(payload?.shipments)?payload.shipments:null);
        if(!items)throw new Error('Majibu ya mizigo si sahihi. Tafadhali jaribu tena.');
        setError('');
        setRows(items);
      })
      .catch(e=>{if(active){setRows([]);setError(e.response?.data?.message||e.message||'Imeshindikana kupakia mizigo yako');}})
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
      <div style={{background:'#fff',borderRadius:14,padding:16,marginBottom:14,border:'1px solid #dbeafe'}}>
        <strong style={{fontSize:16,color:'#0f172a'}}>Ulituma mzigo kwenye dawati la Super Agent?</strong>
        <p style={{fontSize:15,lineHeight:1.5,color:'#475569',margin:'8px 0'}}>Tumia namba ya Shipment na msimbo wa siri uliopewa kwenye risiti ili kuuongeza kwenye Mizigo Yangu.</p>
        <button type="button" onClick={()=>{setClaimOpen(v=>!v);setClaimError('');}} style={{border:0,borderRadius:10,padding:'12px 16px',background:'#2563eb',color:'#fff',fontSize:15,fontWeight:800}}>{claimOpen?'Funga':'Ongeza mzigo wa dawati'}</button>
        {claimOpen&&<form onSubmit={submitClaim} style={{display:'grid',gap:12,marginTop:14}}>
          <label style={{fontWeight:700,fontSize:15}}>Namba ya Shipment
            <input inputMode="numeric" required value={claimId} onChange={e=>{setClaimId(e.target.value);setClaimStep('receipt');setOtp('');}} placeholder="Mfano: 123" style={{display:'block',width:'100%',boxSizing:'border-box',fontSize:16,padding:12,border:'1px solid #cbd5e1',borderRadius:10,marginTop:5}}/>
          </label>
          <label style={{fontWeight:700,fontSize:15}}>Msimbo wa siri wa risiti
            <input required value={receiptSecret} onChange={e=>{setReceiptSecret(e.target.value);setClaimStep('receipt');setOtp('');}} autoComplete="off" placeholder="Msimbo uliochapishwa kwenye risiti" style={{display:'block',width:'100%',boxSizing:'border-box',fontSize:16,padding:12,border:'1px solid #cbd5e1',borderRadius:10,marginTop:5}}/>
          </label>
          {claimStep==='otp'&&<label style={{fontWeight:700,fontSize:15}}>Namba ya uthibitisho (SMS)
            <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Namba 6 za SMS" style={{display:'block',width:'100%',boxSizing:'border-box',fontSize:16,padding:12,border:'1px solid #cbd5e1',borderRadius:10,marginTop:5}}/>
          </label>}
          {claimStep==='otp'&&<div style={{fontSize:14,color:'#475569'}}>Tumetuma SMS kwenye namba ya mtumaji iliyosajiliwa dawati.</div>}
          {claimError&&<div role="alert" style={{color:'#b91c1c',fontSize:14}}>{String(claimError)}</div>}
          <button disabled={claimBusy} type="submit" style={{padding:13,border:0,borderRadius:10,background:'#0f172a',color:'#fff',fontSize:16,fontWeight:800,opacity:claimBusy?.6:1}}>{claimBusy?'Subiri…':claimStep==='receipt'?'Tuma SMS ya uthibitisho':'Thibitisha na ongeza mzigo'}</button>
        </form>}
      </div>
      {loading&&<div role="status">Inapakia…</div>}{!loading&&error&&<div role="alert" style={{background:'#fff',borderRadius:12,padding:20,color:'#b91c1c'}}><div>{String(error)}</div><button onClick={()=>{setError('');setLoading(true);setReload(n=>n+1);}} style={{marginTop:12,padding:'10px 16px',borderRadius:10,border:'1px solid #2563eb',color:'#2563eb',background:'#fff',fontWeight:700}}>Jaribu tena</button></div>}
      {!loading&&!error&&!rows.length&&<div style={{background:'#fff',padding:28,borderRadius:14,textAlign:'center',color:'#64748b'}}>Bado hujatuma mzigo kupitia Kentexa.</div>}
      {!loading&&!error&&rows.map(s=><div key={s.id} role={s.trackingNumber?'button':undefined} tabIndex={s.trackingNumber?0:undefined} onClick={()=>s.trackingNumber&&onNavigate(`TrackParcel-${s.trackingNumber}`)} onKeyDown={e=>{if(e.target!==e.currentTarget||!s.trackingNumber)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate(`TrackParcel-${s.trackingNumber}`);}}} style={{display:'block',width:'100%',boxSizing:'border-box',textAlign:'left',cursor:s.trackingNumber?'pointer':'default',background:'#fff',borderRadius:14,padding:16,marginBottom:10,boxShadow:'0 2px 8px rgba(0,0,0,.05)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}><strong style={{fontSize:16,color:'#0f172a'}}>{s.itemDescription||'Mzigo'}</strong><span style={{fontSize:12,fontWeight:900,color:'#2563eb',textAlign:'right'}}>{statusLabel(s.status)}</span></div>
        <div style={{fontSize:14,color:'#475569',marginTop:8,fontWeight:700}}>{s.originCity} → {s.destinationCity}</div>
        <div style={{fontSize:13,color:'#64748b',marginTop:6}}>Namba ya ufuatiliaji: <strong style={{color:'#0f172a'}}>{s.trackingNumber||'Inasubiri namba ya ufuatiliaji'}</strong>{Number(s.weightKg)>0?` · ${s.weightKg} kg`:''}</div>
        {['confirmed','collected'].includes(s.status) && <ShipmentPickupPanel shipment={s} />}
      </div>)}
    </div>
  </div>;
}
