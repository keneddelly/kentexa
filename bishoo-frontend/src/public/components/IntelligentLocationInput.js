import React, { useEffect, useState } from 'react';
import api from '../../api/api';

/**
 * One human location question backed by Kentexa Location Intelligence.
 * The selected placeRef is the authority; administrative hierarchy is display
 * metadata, not a sequence of questions the user must answer.
 */
const IntelligentLocationInput = ({ label='Location', value='', onTextChange, onResolved, placeholder='Search area, ward or district…', required=false }) => {
  const [items,setItems]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    const q=(value||'').trim();
    if(q.length<2){setItems([]);return;}
    const timer=setTimeout(async()=>{
      setLoading(true);
      try{const r=await api.get('/location-intelligence/places',{params:{q,limit:8}});setItems(r.data?.candidates||[]);}
      catch{setItems([]);}
      finally{setLoading(false);}
    },220);
    return()=>clearTimeout(timer);
  },[value]);

  return <div style={{position:'relative',marginBottom:12}}>
    {label && <label style={{display:'block',fontSize:12,fontWeight:800,color:'#475569',marginBottom:6}}>{label}{required?' *':''}</label>}
    <div style={{position:'relative'}}>
      <input value={value||''} placeholder={placeholder}
        onChange={e=>{onTextChange?.(e.target.value);onResolved?.(null);setOpen(true);}}
        onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)}
        style={{width:'100%',boxSizing:'border-box',padding:'12px 38px 12px 13px',border:'1px solid #cbd5e1',borderRadius:12,fontSize:15,outline:'none',background:'#fff'}} />
      <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:15}}>{loading?'…':'⌖'}</span>
    </div>
    {open && items.length>0 && <div style={{position:'absolute',zIndex:80,left:0,right:0,top:'100%',background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,boxShadow:'0 12px 28px rgba(15,23,42,.14)',overflow:'hidden',maxHeight:260,overflowY:'auto'}}>
      {items.map((s,i)=><button type="button" key={s.placeRef?.providerPlaceId||i}
        onMouseDown={e=>e.preventDefault()}
        onClick={()=>{onTextChange?.(s.displayLabel);onResolved?.(s);setOpen(false);}}
        style={{width:'100%',border:0,borderBottom:'1px solid #f1f5f9',background:'#fff',padding:'12px 13px',textAlign:'left',cursor:'pointer'}}>
        <div style={{fontSize:14,fontWeight:800,color:'#0f172a'}}>{s.displayLabel}</div>
        <div style={{fontSize:11,color:'#64748b',marginTop:2}}>{[s.wardName,s.districtName,s.regionName].filter(Boolean).join(' · ')}</div>
      </button>)}
    </div>}
  </div>;
};
export default IntelligentLocationInput;
