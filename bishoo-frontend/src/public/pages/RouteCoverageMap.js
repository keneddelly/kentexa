/**
 * RouteCoverageMap.js — Tanzania transport coverage visualization
 * Place at: src/public/pages/RouteCoverageMap.js
 *
 * Shows which cities have verified transport providers
 * and active routes between them.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BackBar from '../components/BackBar';
import api     from '../../api/api';

const B = '#2563EB';

// Tanzania major cities with approximate SVG positions
// Viewbox 0 0 400 500 — northwest Tanzania is top-left
const CITIES = [
  { name:'Dar es Salaam', x:310, y:320, major:true  },
  { name:'Dodoma',        x:250, y:240, major:true  },
  { name:'Arusha',        x:280, y:130, major:true  },
  { name:'Mwanza',        x:190, y:140, major:true  },
  { name:'Mbeya',         x:180, y:360, major:true  },
  { name:'Tanga',         x:330, y:170, major:false },
  { name:'Morogoro',      x:280, y:280, major:false },
  { name:'Iringa',        x:240, y:320, major:false },
  { name:'Moshi',         x:300, y:140, major:false },
  { name:'Tabora',        x:170, y:220, major:false },
  { name:'Kigoma',        x: 90, y:210, major:false },
  { name:'Shinyanga',     x:180, y:175, major:false },
  { name:'Bukoba',        x:140, y:100, major:false },
  { name:'Musoma',        x:200, y:105, major:false },
  { name:'Mtwara',        x:320, y:410, major:false },
  { name:'Lindi',         x:300, y:390, major:false },
  { name:'Songea',        x:230, y:400, major:false },
  { name:'Singida',       x:215, y:215, major:false },
  { name:'Zanzibar',      x:350, y:290, major:false },
];

// Major routes connecting cities
const ROUTES = [
  ['Dar es Salaam','Morogoro'],['Morogoro','Dodoma'],['Dodoma','Arusha'],
  ['Arusha','Moshi'],['Arusha','Mwanza'],['Dar es Salaam','Tanga'],
  ['Tanga','Moshi'],['Dar es Salaam','Mwanza'],['Mwanza','Shinyanga'],
  ['Shinyanga','Tabora'],['Tabora','Kigoma'],['Tabora','Mwanza'],
  ['Mwanza','Musoma'],['Mwanza','Bukoba'],['Dodoma','Iringa'],
  ['Iringa','Mbeya'],['Mbeya','Songea'],['Dar es Salaam','Lindi'],
  ['Lindi','Mtwara'],['Dar es Salaam','Zanzibar'],['Morogoro','Iringa'],
  ['Dodoma','Singida'],['Singida','Mwanza'],['Bukoba','Musoma'],
];

const RouteCoverageMap = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [providers,  setProviders]  = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [cityStatus, setCityStatus] = useState({});

  useEffect(() => {
    // /transport/available now returns a safe { trips, providers } shape
    // (it used to embed the full raw TransportProvider entity — apiKey
    // included — in every result; { published, providers } was that old
    // internal shape). Same trip data, different envelope.
    api.get('/transport/available?from=Dar%20es%20Salaam&to=')
      .then(r => {
        const data = r.data?.trips || [];
        setProviders(data);
        // Build city coverage map
        const status = {};
        data.forEach(p => {
          const city = p.fromCity;
          if (city) status[city] = (status[city] || 0) + 1;
        });
        setCityStatus(status);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getCityColor = (name) => {
    const count = cityStatus[name] || 0;
    if (count >= 5) return '#16a34a';
    if (count >= 2) return '#1d4ed8';
    if (count >= 1) return '#d97706';
    return '#cbd5e1';
  };

  const selectedCity = selected ? CITIES.find(c => c.name === selected) : null;
  const cityProviders = selectedCity
    ? providers.filter(p =>
        (p.fromCity || '').toLowerCase() === selectedCity.name.toLowerCase()
      )
    : [];

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f8fafc',
      fontFamily:'Manrope,Inter,-apple-system,sans-serif', display:'flex', flexDirection:'column' }}>
      <BackBar onBack={() => onNavigate('back')} title={t('route_coverage_map.page_title')} top={0} />

      <div style={{ flex:1, maxWidth:900, margin:'0 auto', width:'100%',
        padding:'16px 16px 80px', boxSizing:'border-box' }}>

        {loading && (
          <div style={{ textAlign:'center', padding:20, color:'#94a3b8' }}>{t('route_coverage_map.loading')}</div>
        )}

        {/* Legend */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap',
          backgroundColor:'#fff', borderRadius:14, padding:'12px 16px',
          marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          {[
            { color:'#16a34a', label:t('route_coverage_map.legend_5plus') },
            { color:'#1d4ed8', label:t('route_coverage_map.legend_2to4') },
            { color:'#d97706', label:t('route_coverage_map.legend_1')   },
            { color:'#cbd5e1', label:t('route_coverage_map.legend_none')       },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:12, height:12, borderRadius:'50%',
                backgroundColor:l.color }} />
              <span style={{ fontSize:11, color:'#64748b' }}>{l.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:16, alignItems:'flex-start',
          flexWrap:'wrap' }}>

          {/* SVG Map */}
          <div style={{ flex:1, minWidth:280, backgroundColor:'#fff',
            borderRadius:16, padding:16,
            boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <svg viewBox="0 0 400 500" style={{ width:'100%', height:'auto' }}>
              {/* Tanzania rough outline */}
              <path d="M80,80 L160,60 L240,50 L320,80 L370,140 L380,220 
                       L370,320 L340,420 L280,460 L200,470 L140,440 
                       L90,380 L60,300 L50,220 L60,150 Z"
                fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="2" />

              {/* Lake Victoria */}
              <ellipse cx="170" cy="135" rx="40" ry="30"
                fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1" opacity="0.7"/>
              <text x="150" y="135" fontSize="8" fill="#1d4ed8" fontWeight="600">
                {t('route_coverage_map.lake_victoria')}
              </text>

              {/* Lake Tanganyika */}
              <ellipse cx="75" cy="240" rx="12" ry="50"
                fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1" opacity="0.7"/>

              {/* Routes */}
              {ROUTES.map(([a, b_city]) => {
                const ca = CITIES.find(c => c.name === a);
                const cb = CITIES.find(c => c.name === b_city);
                if (!ca || !cb) return null;
                const hasCoverage = cityStatus[a] || cityStatus[b_city];
                return (
                  <line key={`${a}-${b_city}`}
                    x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
                    stroke={hasCoverage ? '#93c5fd' : '#e2e8f0'}
                    strokeWidth={hasCoverage ? 1.5 : 1}
                    strokeDasharray={hasCoverage ? 'none' : '4,4'}
                    opacity={hasCoverage ? 0.8 : 0.4}
                  />
                );
              })}

              {/* City dots */}
              {CITIES.map(city => {
                const color  = getCityColor(city.name);
                const isSelected = selected === city.name;
                const r = city.major ? 8 : 6;
                return (
                  <g key={city.name} onClick={() => setSelected(
                    selected === city.name ? null : city.name
                  )} style={{ cursor:'pointer' }}>
                    {isSelected && (
                      <circle cx={city.x} cy={city.y} r={r+5}
                        fill={color} opacity="0.3" />
                    )}
                    <circle cx={city.x} cy={city.y} r={r}
                      fill={color} stroke="#fff" strokeWidth="2" />
                    <text x={city.x + r + 3} y={city.y + 4}
                      fontSize={city.major ? 9 : 7}
                      fontWeight={city.major ? '800' : '600'}
                      fill="#1e293b">
                      {city.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}

              {/* Zanzibar connection */}
              <line x1="330" y1="285" x2="350" y2="290"
                stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="3,3"/>
            </svg>
          </div>

          {/* City detail panel */}
          <div style={{ width:240, flexShrink:0 }}>
            {selected ? (
              <div style={{ backgroundColor:'#fff', borderRadius:16,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ padding:'16px 16px 12px',
                  borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:'#1e293b' }}>
                    📍 {selected}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                    {t('route_coverage_map.providers_available', { count: cityStatus[selected] || 0 })}
                  </div>
                </div>
                {cityProviders.length > 0 ? (
                  <div style={{ padding:12 }}>
                    {cityProviders.slice(0,5).map((p, i) => (
                      <div key={i} style={{ padding:'8px 0',
                        borderBottom:'1px solid #f8fafc',
                        display:'flex', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>
                            {p.provider?.name || t('route_coverage_map.default_provider_name')}
                          </div>
                          <div style={{ fontSize:10, color:'#64748b' }}>
                            {p.fromCity} → {p.toCity}
                          </div>
                        </div>
                        <span style={{ fontSize:10, color:'#16a34a', fontWeight:700 }}>
                          {t('route_coverage_map.slots_available', { count: p.slotsAvailable||0 })}
                        </span>
                      </div>
                    ))}
                    <button onClick={() => onNavigate('SellerShipment')}
                      style={{ width:'100%', marginTop:12, backgroundColor:B,
                        color:'#fff', border:'none', borderRadius:10,
                        padding:'10px 0', cursor:'pointer',
                        fontSize:13, fontWeight:700 }}>
                      {t('route_coverage_map.send_shipment_button')}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding:20, textAlign:'center', color:'#94a3b8' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>🚌</div>
                    <div style={{ fontSize:12 }}>
                      {t('route_coverage_map.no_providers')}
                    </div>
                    <button onClick={() => onNavigate('BecomeTransportProvider')}
                      style={{ marginTop:10, backgroundColor:'#f1f5f9',
                        color:'#64748b', border:'none', borderRadius:8,
                        padding:'8px 14px', cursor:'pointer',
                        fontSize:12, fontWeight:700 }}>
                      {t('route_coverage_map.become_provider_button')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor:'#fff', borderRadius:16, padding:20,
                boxShadow:'0 2px 8px rgba(0,0,0,0.06)', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>👆</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginBottom:4 }}>
                  {t('route_coverage_map.tap_city_title')}
                </div>
                <div style={{ fontSize:12, color:'#64748b' }}>
                  {t('route_coverage_map.tap_city_desc')}
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{ backgroundColor:'#fff', borderRadius:16, padding:16,
              marginTop:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:12, fontWeight:800, color:'#1e293b', marginBottom:10 }}>
                {t('route_coverage_map.stats_title')}
              </div>
              {[
                { label:t('route_coverage_map.stat_cities_covered'), value: Object.keys(cityStatus).length },
                { label:t('route_coverage_map.stat_total_providers'), value: providers.length },
                { label:t('route_coverage_map.stat_cities_on_map'), value: CITIES.length },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', justifyContent:'space-between',
                  padding:'6px 0', borderBottom:'1px solid #f8fafc' }}>
                  <span style={{ fontSize:11, color:'#64748b' }}>{s.label}</span>
                  <span style={{ fontSize:13, fontWeight:900, color:B }}>{s.value}</span>
                </div>
              ))}
              {/* Was pointed at BecomeTransportProvider (registration)
                  regardless of whether the visitor already had a provider
                  account — an already-registered provider tapping "Add
                  Route" just got sent back through sign-up again, with no
                  way to actually add one. TransportProviderDashboard now
                  handles both cases itself: shows the join flow if there's
                  no account yet, otherwise its Routes tab (which now has a
                  real add-route form). */}
              <button onClick={() => onNavigate('TransportProviderDashboard')}
                style={{ width:'100%', marginTop:12,
                  backgroundColor:'#f0fdf4', color:'#16a34a',
                  border:'1px solid #bbf7d0', borderRadius:10,
                  padding:'10px 0', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                {t('route_coverage_map.add_route_button')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteCoverageMap;