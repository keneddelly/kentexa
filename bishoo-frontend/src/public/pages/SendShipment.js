import React, { useEffect, useState } from 'react';
import api from '../../api/api';

const B='#2563EB', DK='#0F172A', GR='#64748B', WH='#fff';
const field={width:'100%',boxSizing:'border-box',padding:'13px 14px',border:'1px solid #CBD5E1',borderRadius:12,fontSize:16,marginBottom:12,background:WH};
const button={width:'100%',padding:'14px',border:0,borderRadius:12,fontSize:16,fontWeight:800,cursor:'pointer'};
const money=n=>Number(n||0).toLocaleString();

function PlaceInput({label,value,setValue,resolved,setResolved}) {
  const [items,setItems]=useState([]);
  useEffect(()=>{
    if(value.trim().length<2){setItems([]);return;}
    const t=setTimeout(()=>api.get('/location-intelligence/places',{params:{q:value.trim(),limit:6}})
      .then(r=>setItems(r.data?.candidates||[])).catch(()=>setItems([])),250);
    return()=>clearTimeout(t);
  },[value]);
  return <div style={{position:'relative'}}>
    <label style={{display:'block',fontWeight:800,fontSize:14,marginBottom:6}}>{label}</label>
    <input style={field} value={value} onChange={e=>{setValue(e.target.value);setResolved(null)}} />
    {resolved && <div style={{fontSize:12,color:'#15803D',marginTop:-8,marginBottom:10}}>Location confirmed</div>}
    {!resolved && items.length>0 && <div style={{position:'absolute',zIndex:20,left:0,right:0,top:72,background:WH,border:'1px solid #E2E8F0',borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,.12)'}}>
      {items.map((x,i)=><button key={i} type="button" onClick={()=>{setValue(x.displayLabel);setResolved(x);setItems([])}} style={{display:'block',width:'100%',padding:12,textAlign:'left',border:0,borderBottom:'1px solid #F1F5F9',background:WH,fontSize:14}}>{x.displayLabel}</button>)}
    </div>}
  </div>;
}

export default function SendShipment({onNavigate,isLoggedIn,currentUser}) {
  const [step,setStep]=useState(1);
  const [origin,setOrigin]=useState(''),[destination,setDestination]=useState('');
  const [o,setO]=useState(null),[d,setD]=useState(null);
  const [description,setDescription]=useState(''),[weight,setWeight]=useState('');
  const [cargoClass,setCargoClass]=useState('normal');
  const [dims,setDims]=useState({lengthCm:'',widthCm:'',heightCm:''});
  const [pickup,setPickup]=useState(true),[delivery,setDelivery]=useState(false);
  const [plans,setPlans]=useState([]),[selectedPlan,setSelectedPlan]=useState(null);
  const [selection,setSelection]=useState(null),[quote,setQuote]=useState(null);
  const [receiverName,setReceiverName]=useState(''),[receiverPhone,setReceiverPhone]=useState('');
  const [paymentMethod,setPaymentMethod]=useState('cash');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(null);

  if(!isLoggedIn) return <div style={{padding:24,maxWidth:520,margin:'60px auto',textAlign:'center'}}>
    <h2>Send with Kentexa</h2><p style={{color:GR}}>Sign in to create and track a shipment.</p>
    <button style={{...button,background:B,color:WH}} onClick={()=>onNavigate('PublicLogin')}>Sign in</button>
  </div>;

  const city=(r,text)=>r?.region || r?.regionName || r?.district || text;
  const cargo=()=>({
    description:description.trim(),cargoClass,evidenceLevel:'declared',weightKg:Number(weight)||undefined,
    lengthCm:Number(dims.lengthCm)||undefined,widthCm:Number(dims.widthCm)||undefined,heightCm:Number(dims.heightCm)||undefined,
  });
  const request=()=>({
    originLabel:origin.trim(),destinationLabel:destination.trim(),
    originCity:city(o,origin),destinationCity:city(d,destination),
    originWardId:o?.wardId||undefined,originRegionId:o?.regionId||undefined,
    originLatitude:o?.latitude||undefined,originLongitude:o?.longitude||undefined,
    destinationWardId:d?.wardId||undefined,destinationRegionId:d?.regionId||undefined,
    destinationLatitude:d?.latitude||undefined,destinationLongitude:d?.longitude||undefined,
    cargo:cargo(),requestAgentPickup:pickup,requestAgentDelivery:delivery,
  });

  const discover=async()=>{
    setBusy(true);setError('');
    try{
      const r=await api.post('/transport/journeys/discover',request());
      setPlans(r.data||[]);setStep(3);
    }catch(e){setError(e?.response?.data?.message||'Could not find delivery options.');}
    finally{setBusy(false);}
  };

  const choose=async plan=>{
    setBusy(true);setError('');
    try{
      const s=await api.post('/transport/journeys/select',{request:request(),planId:plan.planId,paymentMethod});
      const transport=s.data.legs.find(x=>x.legType==='transport');
      if(!transport) throw new Error('No transport leg');
      const q=await api.post('/transport/quotes',{
        journeySelectionId:s.data.id,providerId:transport.providerId,routeId:transport.routeId,
        availabilityId:transport.availabilityId||undefined,originCity:city(o,origin),destinationCity:city(d,destination),
        weightKg:Number(weight)||0,
      });
      const accepted=await api.post(`/transport/quotes/${q.data.id}/accept`);
      setSelectedPlan(plan);setSelection(s.data);setQuote(accepted.data);setStep(4);
    }catch(e){setError(e?.response?.data?.message||'This option cannot be confirmed now.');}
    finally{setBusy(false);}
  };

  const confirm=async()=>{
    setBusy(true);setError('');
    try{
      const created=await api.post('/shipments',{
        senderName:currentUser?.name||undefined,senderPhone:currentUser?.phone||undefined,
        receiverName:receiverName.trim(),receiverPhone:receiverPhone.trim(),
        originCity:city(o,origin),destinationCity:city(d,destination),
        originPlace:o?.placeRef||undefined,destinationPlace:d?.placeRef||undefined,
        itemDescription:description.trim(),weightKg:Number(weight)||0,quoteId:quote.id,
        pickupOption:pickup?'agent':'station',deliveryOption:delivery?'agent':'station',
      });
      const final=await api.patch(`/shipments/${created.data.id}/confirm`,{});
      setDone({shipment:final.data.shipment,parcel:final.data.parcel});setStep(5);
    }catch(e){setError(e?.response?.data?.message||'Shipment could not be confirmed.');}
    finally{setBusy(false);}
  };

  return <div style={{minHeight:'100vh',background:'#F8FAFC',paddingBottom:80,color:DK}}>
    <div style={{position:'sticky',top:0,zIndex:10,background:WH,borderBottom:'1px solid #E2E8F0',padding:'14px 16px',fontWeight:900,fontSize:18}}>
      <button onClick={()=>step>1&&step<5?setStep(step-1):onNavigate('back')} style={{border:0,background:'transparent',fontSize:22,marginRight:10}}>‹</button>
      Tuma Mzigo
    </div>
    <main style={{maxWidth:540,margin:'0 auto',padding:16}}>
      <div style={{fontSize:13,color:GR,marginBottom:16}}>Step {Math.min(step,4)} of 4 · Kentexa chooses only compatible logistics paths.</div>
      {error&&<div style={{padding:12,borderRadius:10,background:'#FEF2F2',color:'#B91C1C',marginBottom:14}}>{String(error)}</div>}

      {step===1&&<section>
        <h2 style={{fontSize:24}}>Unatuma kutoka wapi kwenda wapi?</h2>
        <PlaceInput label="From" value={origin} setValue={setOrigin} resolved={o} setResolved={setO}/>
        <PlaceInput label="To" value={destination} setValue={setDestination} resolved={d} setResolved={setD}/>
        <button disabled={!origin.trim()||!destination.trim()} onClick={()=>setStep(2)} style={{...button,background:B,color:WH,opacity:origin.trim()&&destination.trim()?1:.5}}>Continue</button>
      </section>}

      {step===2&&<section>
        <h2 style={{fontSize:24}}>Unatuma nini?</h2>
        <textarea style={{...field,minHeight:84}} placeholder="Mfano: box ya nguo, TV, tank la maji 5,000L..." value={description} onChange={e=>setDescription(e.target.value)}/>
        <input style={field} type="number" min="0" step=".1" placeholder="Approx. weight (kg)" value={weight} onChange={e=>setWeight(e.target.value)}/>
        <select style={field} value={cargoClass} onChange={e=>setCargoClass(e.target.value)}>
          <option value="normal">Normal parcel</option><option value="fragile">Fragile</option><option value="bulky">Bulky</option><option value="oversized">Oversized</option><option value="temperature_sensitive">Temperature sensitive</option><option value="other">Other</option>
        </select>
        {(cargoClass==='bulky'||cargoClass==='oversized')&&<div>
          <div style={{fontWeight:800,marginBottom:8}}>Approximate dimensions (cm)</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {['lengthCm','widthCm','heightCm'].map(k=><input key={k} style={field} type="number" placeholder={k.replace('Cm','')} value={dims[k]} onChange={e=>setDims({...dims,[k]:e.target.value})}/>)}
          </div>
        </div>}
        <label style={{display:'flex',gap:10,alignItems:'center',padding:'10px 0',fontSize:16}}><input type="checkbox" checked={pickup} onChange={e=>setPickup(e.target.checked)}/> Agent pickup from sender</label>
        <label style={{display:'flex',gap:10,alignItems:'center',padding:'10px 0 18px',fontSize:16}}><input type="checkbox" checked={delivery} onChange={e=>setDelivery(e.target.checked)}/> Deliver to recipient</label>
        <button disabled={!description.trim()||busy} onClick={discover} style={{...button,background:B,color:WH,opacity:description.trim()?1:.5}}>{busy?'Searching...':'Show delivery options'}</button>
      </section>}

      {step===3&&<section>
        <h2 style={{fontSize:24}}>Choose how to send</h2>
        {plans.length===0?<div style={{padding:20,background:WH,borderRadius:14}}>No compatible journey is available yet. Try changing pickup/delivery or cargo details.</div>:plans.map(p=><button key={p.planId} disabled={busy} onClick={()=>choose(p)} style={{display:'block',width:'100%',textAlign:'left',padding:16,marginBottom:10,border:'1px solid #DBEAFE',borderRadius:14,background:WH}}>
          <div style={{fontWeight:900,fontSize:17}}>{p.summary}</div>
          <div style={{fontSize:14,color:GR,marginTop:6}}>{p.legs.map(l=>l.fromLabel+' → '+l.toLabel).join(' · ')}</div>
          <div style={{fontSize:13,marginTop:8,color:p.requiresConfirmation?'#B45309':'#15803D'}}>{p.requiresConfirmation?'Needs transport confirmation':'Compatible now'}</div>
        </button>)}
      </section>}

      {step===4&&<section>
        <h2 style={{fontSize:24}}>Confirm shipment</h2>
        <div style={{background:WH,borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{fontWeight:900}}>{selectedPlan?.summary}</div>
          <div style={{marginTop:10,fontSize:22,fontWeight:900}}>TZS {money(quote?.totalAmount)}</div>
          <div style={{fontSize:13,color:GR}}>Frozen Kentexa transport quote</div>
          {paymentMethod==='cash'&&<div style={{marginTop:12,fontSize:14}}>Cash collector: <b>{selection?.expectedCashCollectorType?.replaceAll('_',' ')||'first custodian'}</b></div>}
        </div>
        <input style={field} placeholder="Recipient name" value={receiverName} onChange={e=>setReceiverName(e.target.value)}/>
        <input style={field} placeholder="Recipient phone" value={receiverPhone} onChange={e=>setReceiverPhone(e.target.value)}/>
        <select style={field} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} disabled>
          <option value="cash">Cash — pay first physical custodian</option>
        </select>
        <button disabled={!receiverName.trim()||!receiverPhone.trim()||busy} onClick={confirm} style={{...button,background:B,color:WH,opacity:receiverName.trim()&&receiverPhone.trim()?1:.5}}>{busy?'Confirming...':'Confirm & create shipment'}</button>
      </section>}

      {step===5&&<section style={{textAlign:'center',paddingTop:30}}>
        <div style={{fontSize:48}}>✓</div><h2>Shipment confirmed</h2>
        <p style={{fontSize:17}}>Tracking: <b>{done?.parcel?.trackingNumber||done?.shipment?.trackingNumber}</b></p>
        <button style={{...button,background:B,color:WH}} onClick={()=>onNavigate('TrackParcel',{trackingNumber:done?.parcel?.trackingNumber})}>Track parcel</button>
      </section>}
    </main>
  </div>;
}
