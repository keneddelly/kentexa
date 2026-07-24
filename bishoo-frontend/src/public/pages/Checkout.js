import React, { useState } from 'react';

import Celebration from '../components/Celebration';
import { useCart } from '../../context/CartContext';
import api from '../../api/api';
import LocationPicker from '../components/LocationPicker';

const Checkout = ({ onNavigate, isLoggedIn, onLogout, userRole, currentUser }) => {
  const { cart, clearCart } = useCart();

  const getItemPrice = (item) => Number(item.displayPrice || item.basePrice || item.price || 0);
  const cartTotal    = cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);

  const [form, setForm]                     = useState({ deliveryAddress: '', phone: '', recipientName: '' });
  const [deliveryLocation, setDeliveryLocation] = useState({ regionId: null, regionName: '', districtId: null, districtName: '', wardId: null, wardName: '' });
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [needsCollection, setNeedsCollection] = useState(false);
  const [isRuralCollection, setIsRuralCollection] = useState(false);
  const [collectionFee] = useState(1500); // default urban, product/seller sets this
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [paymentStep, setPaymentStep]       = useState(false);
  const [placedOrders, setPlacedOrders]     = useState([]);
  const [orderTotal, setOrderTotal]         = useState(0);

  const [showOnlinePayment, setShowOnlinePayment] = useState(false);
  const [payerPhone, setPayerPhone]               = useState('');
  const [paying, setPaying]                       = useState(false);
  const [paymentPending, setPaymentPending]       = useState(false);
  const [paymentSuccess, setPaymentSuccess]       = useState(false);

  const [showAgentStep, setShowAgentStep] = useState(false);
  const [nearbyAgents, setNearbyAgents]   = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [copied, setCopied]               = useState(false);
  const [celebrate, setCelebrate]         = useState(false);


  // Pre-fill buyer info from logged-in profile — enter once, get everywhere
  React.useEffect(() => {
    if (!currentUser) return;
    setForm(prev => ({
      ...prev,
      recipientName: prev.recipientName || currentUser.name  || '',
      phone:         prev.phone         || currentUser.phone || '',
    }));
    if (currentUser.phone) setPayerPhone(p => p || currentUser.phone);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Delivery method detection ─────────────────────────────────
  const [deliveryMethods, setDeliveryMethods]     = useState([]);
  const [selectedMethod, setSelectedMethod]       = useState(null); // 'boda'|'kentexa_delivery'|'agent'
  const [detectingMethods, setDetectingMethods]   = useState(false);
  const [isSameCity, setIsSameCity]               = useState(false);
  const DETECT_DELAY = 500; // ms after user stops typing

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '2px solid #e2e8f0', fontSize: 14,
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  // ── Detect delivery methods when address changes ─────────────
  const detectDeliveryRef = React.useRef(null);
  const handleAddressChange = (address) => {
    setForm(f => ({ ...f, deliveryAddress: address }));
    setSelectedMethod(null);
    setDeliveryMethods([]);
    if (detectDeliveryRef.current) clearTimeout(detectDeliveryRef.current);
    if (!address.trim() || address.trim().length < 3 || cart.length === 0) return;
    detectDeliveryRef.current = setTimeout(async () => {
      try {
        setDetectingMethods(true);
        const productId = cart[0]?.id;
        if (!productId) return;
        const res = await api.get(`/daily-batches/delivery-methods?address=${encodeURIComponent(address)}&productId=${productId}`);
        setDeliveryMethods(res.data.methods || []);
        setIsSameCity(res.data.isSameCity || false);
        // Auto-select first method
        if (res.data.methods?.length > 0) {
          setSelectedMethod(res.data.methods[0].key);
        }
      } catch { setDeliveryMethods([]); }
      finally { setDetectingMethods(false); }
    }, DETECT_DELAY);
  };

  const getSelectedMethodData = () => deliveryMethods.find(m => m.key === selectedMethod) || null;

  const getCartTotal = () => {
    const method = getSelectedMethodData();
    if (!method || deliveryMethods.length === 0) return cartTotal;
    // Price changes based on delivery method:
    // - Dar buyer with boda: basePrice + bodaFee
    // - Dar buyer with van: basePrice + 3000 (flat van fee)
    // - Intercity: basePrice + deliveryFee (product default — unchanged)
    if (method.key === 'agent') return cartTotal; // intercity — use product price as-is
    const baseOnly = cart.reduce((sum, item) => sum + Number(item.basePrice || item.price || 0) * item.quantity, 0);
    return baseOnly + (method.fee || 0);
  };

  const handleCheckout = async () => {
    if (!form.deliveryAddress.trim() || !form.phone.trim()) {
      setError('Please fill delivery address and phone number');
      return;
    }
    if (forSomeoneElse && !form.recipientName.trim()) {
      setError("Please enter the recipient's name");
      return;
    }
    if (cart.length === 0) { setError('Your cart is empty'); return; }
    try {
      setLoading(true);
      setError('');
      const orders = [];
      for (const item of cart) {
        const methodData = getSelectedMethodData();
        const res = await api.post('/orders', {
          productId:        item.id,
          quantity:         item.quantity,
          deliveryAddress:  form.deliveryAddress.trim(),
          regionId:         deliveryLocation.regionId || null,
          districtId:       deliveryLocation.districtId || null,
          wardId:           deliveryLocation.wardId || null,
          destinationCity:  deliveryLocation.districtName || deliveryLocation.regionName || null,
          phone:            form.phone.trim(),
          recipientName:    forSomeoneElse ? form.recipientName.trim() : null,
          shippingMethod:   selectedMethod || (isSameCity ? 'boda' : 'agent'),
          needsCollection:  needsCollection && !isSameCity, // only for intercity agent orders
          isRuralCollection: isRuralCollection,
          collectionFee:    needsCollection && !isSameCity ? collectionFee : 0,
          // Send the actual delivery fee for this method
          // agent = use product default, others = method fee
          ...(methodData && methodData.key !== 'agent' ? { deliveryFee: methodData.fee } : {}),
        });
        orders.push(res.data);
      }
      setOrderTotal(getCartTotal());
      setPlacedOrders(orders);
      clearCart();
      setPaymentStep(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to place orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayOnline = async () => {
    if (!payerPhone.trim()) { setError('Enter your phone number'); return; }
    try {
      setPaying(true); setError('');
      const firstOrder = placedOrders[0];
      const res = await api.post('/payments/invoice/pay', {
        invoiceNumber: firstOrder?.invoiceNumber || undefined,
        orderId:       firstOrder?.id, // fallback — backend creates/finds the invoice if missing
        phone:         payerPhone.trim(),
        provider:      'selcom',
      });
      setPaymentPending(true);
      setTimeout(async () => {
        try {
          await api.post(`/payments/agent/mock-confirm/${res.data.providerRequestId}`);
          setPaymentSuccess(true);
          setPaymentPending(false);
          // 🎉 Check if this is the user's first order — only celebrate first time
          const isFirstOrder = !localStorage.getItem('kentexa_has_ordered');
          if (isFirstOrder) {
            localStorage.setItem('kentexa_has_ordered', 'true');
            setCelebrate(true);
          }
        } catch {
          setError('Payment confirmation failed. Try again.');
          setPaymentPending(false);
        }
      }, 4000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Payment failed. Try again.');
    } finally {
      setPaying(false);
    }
  };

  const handlePayViaAgent = async () => {
    setShowAgentStep(true);
    try {
      setAgentsLoading(true);
      const parts = form.deliveryAddress.split(',').map(s => s.trim());
      const res = await api.get(`/agents/nearby?region=${encodeURIComponent(parts[0] || '')}`);
      setNearbyAgents(res.data);
    } catch { setNearbyAgents([]); }
    finally { setAgentsLoading(false); }
  };

  const handleCopyInvoice = (inv) => {
    navigator.clipboard.writeText(inv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Payment success ───────────────────────────────────────────────────────
  if (paymentSuccess) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
        {celebrate && <Celebration message="Agizo lako la kwanza! 🎉" onDone={() => setCelebrate(false)} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: '36px 24px', textAlign: 'center', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1e293b', marginBottom: 8, fontFamily: 'Manrope,sans-serif' }}>Payment Confirmed!</h2>
            <p style={{ color: '#64748b', marginBottom: 20, fontSize: 14 }}>Your order is being prepared. Seller will ship soon.</p>
            <div style={{ background: 'linear-gradient(135deg,#43e97b,#38f9d7)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>Amount Paid</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#fff' }}>TZS {Number(orderTotal).toLocaleString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onNavigate('MyOrders')} style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>📋 My Orders</button>
              <button onClick={() => onNavigate('Home')} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>🏠 Home</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Agent payment step ────────────────────────────────────────────────────
  if (paymentStep && showAgentStep) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => setShowAgentStep(false)} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>Pay via Agent</span>
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#2563eb)', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🤝</div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Visit a nearby agent with cash and your invoice number</p>
        </div>
        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 12px' }}>1️⃣ Your Invoice Number</h3>
            {placedOrders.map((order, i) => (
              <div key={i} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 8, border: '2px dashed #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>INVOICE NUMBER</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2563eb', fontFamily: 'monospace', wordBreak: 'break-all' }}>{order.invoiceNumber || order.id}</div>
                  {order.totalAmount && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>TZS {Number(order.totalAmount).toLocaleString()}</div>}
                </div>
                <button onClick={() => handleCopyInvoice(order.invoiceNumber || String(order.id))}
                  style={{ backgroundColor: copied ? '#dcfce7' : '#2563eb', color: copied ? '#16a34a' : '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {copied ? '✅' : '📋 Copy'}
                </button>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 10px' }}>2️⃣ Nearby Agents</h3>
            {agentsLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>⏳ Finding agents near you...</div>
            ) : nearbyAgents.length === 0 ? (
              <div style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 14, fontSize: 12, color: '#92400e', textAlign: 'center' }}>
                ⚠️ No agents found near your area. Contact KenteXa support.
              </div>
            ) : nearbyAgents.map(agent => (
              <div key={agent.id} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>{agent.fullName}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>📍 {[agent.district, agent.region].filter(Boolean).join(', ') || '—'}</div>
                <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>📞 {agent.phone}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onNavigate('MyOrders')} style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>🛒 My Orders</button>
            <button onClick={() => onNavigate('Home')} style={{ flex: 1, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 13, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>🏠 Home</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment method selection ───────────────────────────────────────────────
  if (paymentStep) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px' }}>
          <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', gap:10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
            <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>Choose Payment Method</span>
          </button>
        </div>
        <div style={{ flex: 1, padding: '16px', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

          {/* Success banner */}
          <div style={{ backgroundColor: '#dcfce7', borderRadius: 16, padding: '18px 16px', textAlign: 'center', marginBottom: 16, border: '2px solid #86efac' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🎉</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#15803d', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>Order Placed!</h2>
            <p style={{ color: '#166534', fontSize: 13, margin: '0 0 8px' }}>Now choose how to pay</p>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d' }}>TZS {Number(orderTotal).toLocaleString()}</div>
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>❌ {error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
            </div>
          )}

          {/* Online payment */}
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, border: '2px solid #16a34a', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: showOnlinePayment ? 14 : 0 }}>
              <span style={{ fontSize: 28 }}>💳</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46' }}>Pay Online</div>
                <div style={{ fontSize: 12, color: '#047857' }}>M-Pesa · Airtel · Tigo · Selcom</div>
              </div>
              {!showOnlinePayment && (
                <button onClick={() => setShowOnlinePayment(true)}
                  style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                  Select
                </button>
              )}
            </div>
            {showOnlinePayment && !paymentPending && (
              <>
                <input type="tel" placeholder="255712345678" value={payerPhone}
                  onChange={e => setPayerPhone(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowOnlinePayment(false)}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                  <button onClick={handlePayOnline} disabled={paying || !payerPhone.trim()}
                    style={{ flex: 2, background: paying || !payerPhone.trim() ? '#e2e8f0' : 'linear-gradient(135deg,#16a34a,#15803d)', color: paying || !payerPhone.trim() ? '#94a3b8' : '#fff', border: 'none', padding: 11, borderRadius: 8, cursor: paying || !payerPhone.trim() ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13 }}>
                    {paying ? '⏳ Sending...' : `💳 Pay TZS ${Number(orderTotal).toLocaleString()}`}
                  </button>
                </div>
              </>
            )}
            {paymentPending && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Check Your Phone!</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Enter your PIN to confirm payment</div>
              </div>
            )}
          </div>

          {/* Agent payment */}
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, border: '2px solid #2563eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>🤝</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8' }}>Pay via Agent</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Pay cash at a nearby KenteXa agent</div>
              </div>
              <button onClick={handlePayViaAgent}
                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                Select
              </button>
            </div>
          </div>

          <button onClick={() => onNavigate('MyOrders')}
            style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            📋 View My Orders
          </button>
        </div>
      </div>
    );
  }

  // ── Main checkout form ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #F1F5F9', padding:'14px 16px',
        position:'sticky', top:0, zIndex:100 }}>
        <button onClick={() => onNavigate('back')} style={{ background:'none', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', gap:10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="15,18 9,12 15,6"/></svg>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A' }}>Checkout</span>
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: 32 }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
            <span>❌ {error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Cart Items */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>🛒 Items ({cart.length})</h3>
          {cart.map(item => (
            <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.images?.[0] ? <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>📦</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Qty: {item.quantity} · 🚚 FREE</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', flexShrink: 0 }}>
                TZS {(getItemPrice(item) * item.quantity).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Who is this for? */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontSize: 11, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span> Mteja Nani?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { value: false, icon: '👤', label: 'Myself' },
              { value: true,  icon: '🎁', label: 'Someone Else' },
            ].map(opt => (
              <button key={String(opt.value)} onClick={() => setForSomeoneElse(opt.value)}
                style={{ padding: 12, borderRadius: 10, cursor: 'pointer', border: forSomeoneElse === opt.value ? '2px solid #2563eb' : '2px solid #e2e8f0', backgroundColor: forSomeoneElse === opt.value ? '#eff6ff' : '#fff', fontWeight: 700, fontSize: 13, color: forSomeoneElse === opt.value ? '#1d4ed8' : '#64748b' }}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          {forSomeoneElse && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Recipient's Full Name *</label>
              <input placeholder="e.g. Asha Mwakasege" value={form.recipientName}
                onChange={e => setForm({ ...form, recipientName: e.target.value })}
                style={inputStyle} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>💡 This name will be on the parcel</div>
            </div>
          )}
        </div>

        {/* Delivery Details */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontSize: 11, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span> Anwani ya Utoaji</h2>
          <LocationPicker
                label="Mkoa / Wilaya / Kata *"
                value={deliveryLocation}
                onChange={loc => {
                  setDeliveryLocation(loc);
                  // Pre-fill address with structured location
                  const locationStr = [loc.wardName, loc.districtName, loc.regionName].filter(Boolean).join(', ');
                  if (locationStr && !form.deliveryAddress) {
                    setForm(f => ({ ...f, deliveryAddress: locationStr }));
                  }
                }}
                required
                style={{ marginBottom: 10 }}
              />
              <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Delivery Address *</label>
            <input placeholder="e.g. Dar es Salaam, Kinondoni, Street 5"
              value={form.deliveryAddress} onChange={e => setForm(f => ({ ...f, deliveryAddress: e.target.value }))}
              style={inputStyle} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>City, District, Street</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
              {forSomeoneElse ? "Recipient's Phone *" : 'Your Phone Number *'}
            </label>
            <input type="tel" placeholder="255712345678" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              style={inputStyle} />
          </div>
        </div>

        {/* Delivery Method Selector — shown when address is filled */}
        {(detectingMethods || deliveryMethods.length > 0) && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontSize: 11, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span> Njia ya Utoaji</h2>

            {detectingMethods ? (
              <div style={{ textAlign: 'center', padding: '14px 0', color: '#64748b', fontSize: 13 }}>
                ⏳ Inatafuta njia za utoaji...
              </div>
            ) : (
              <>
                {isSameCity && (
                  <div style={{ backgroundColor: '#dcfce7', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#166534', fontWeight: 600 }}>
                    ✅ Muuzaji yuko karibu nawe — chagua njia ya utoaji inayokufaa
                  </div>
                )}
                {!isSameCity && deliveryMethods.length > 0 && (
                  <div style={{ backgroundColor: '#dbeafe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                    🏢 Bidhaa hii itatumwa kupitia KenteXa Super Agent — ada ya utoaji imejumuishwa katika bei.
                  </div>
                )}

                {deliveryMethods.map(method => (
                  <button key={method.key}
                    onClick={() => setSelectedMethod(method.key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', marginBottom: 10, borderRadius: 12, cursor: 'pointer',
                      border: selectedMethod === method.key ? '2px solid #1d4ed8' : '2px solid #e2e8f0',
                      backgroundColor: selectedMethod === method.key ? '#eff6ff' : '#fff',
                      textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 28, flexShrink: 0 }}>{method.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: selectedMethod === method.key ? '#1d4ed8' : '#1e293b' }}>
                        {method.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{method.desc}</div>
                      {method.key === 'kentexa_delivery' && (
                        <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, marginTop: 3 }}>
                          🕖 Kata: {method.cutoffTime} · Inafika: {method.estimatedArrival}
                        </div>
                      )}
                      {method.key === 'agent' && method.estimatedDays && (
                        <div style={{ marginTop: 6 }}>
                          {method.transitCity ? (
                            <div style={{ backgroundColor: '#fef9c3', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#92400e', marginBottom: 4 }}>
                              🔄 Via <strong>{method.transitCity}</strong>
                              {method.leg1Days && method.leg2Days && (
                                <span> — siku {method.leg1Days} + siku {method.leg2Days}</span>
                              )}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                            📅 Inatarajiwa kufika siku {method.estimatedDays}
                            {method.expectedArrival && (
                              <span style={{ fontWeight: 500, color: '#64748b' }}>
                                {' '}· {new Date(method.expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: method.fee === 0 && method.key !== 'boda' ? '#16a34a' : '#1d4ed8' }}>
                        {method.key === 'boda' && method.fee === 0
                          ? <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>Bei itatolewa na muuzaji</span>
                          : method.fee === 0
                            ? '🚚 FREE'
                            : `TZS ${Number(method.fee).toLocaleString()}`
                        }
                      </div>
                      {selectedMethod === method.key && (
                        <span style={{ fontSize: 18, color: '#1d4ed8' }}>✅</span>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Collection Request — only shown for intercity agent orders */}
        {selectedMethod === 'agent' && !isSameCity && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: '0 0 10px' }}>
              🚴 Je, Muuzaji Anahitaji Msaada wa Kukusanya?
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
              Kama muuzaji yuko mbali na kituo cha Super Agent, wakala anaweza kwenda kumchukua. 
              Ada ndogo itaongezwa kwenye jumla yako.
            </p>

            {/* Toggle */}
            <div
              onClick={() => setNeedsCollection(!needsCollection)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                backgroundColor: needsCollection ? '#eff6ff' : '#f8fafc',
                border: `2px solid ${needsCollection ? '#1d4ed8' : '#e2e8f0'}` }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${needsCollection ? '#1d4ed8' : '#94a3b8'}`,
                backgroundColor: needsCollection ? '#1d4ed8' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {needsCollection && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: needsCollection ? '#1d4ed8' : '#1e293b' }}>
                  Ndiyo, Ninahitaji Wakala Aje Kwa Muuzaji
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Ada: TZS {isRuralCollection ? '3,000' : '1,500'} itaongezwa kwenye jumla
                </div>
              </div>
            </div>

            {needsCollection && (
              <div style={{ marginTop: 10 }}>
                <div
                  onClick={() => setIsRuralCollection(!isRuralCollection)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    backgroundColor: isRuralCollection ? '#fef9c3' : '#f8fafc',
                    border: `1px solid ${isRuralCollection ? '#fde68a' : '#e2e8f0'}`, marginTop: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isRuralCollection ? '#ca8a04' : '#94a3b8'}`,
                    backgroundColor: isRuralCollection ? '#ca8a04' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isRuralCollection && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: isRuralCollection ? '#92400e' : '#64748b' }}>
                    🌾 Muuzaji yuko eneo la vijijini (ada ya TZS 3,000)
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary + Place Order */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: '#64748b' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>TZS {deliveryMethods.length > 0 ? cart.reduce((s,i)=>s+Number(i.basePrice||i.price||0)*i.quantity,0).toLocaleString() : cartTotal.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
            <span style={{ color: '#64748b' }}>Delivery</span>
            {getSelectedMethodData() && getSelectedMethodData().key !== 'agent' ? (
              <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                {getSelectedMethodData().icon} TZS {Number(getSelectedMethodData().fee || 0).toLocaleString()}
                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>({getSelectedMethodData().label})</span>
              </span>
            ) : (
              <span style={{ fontWeight: 700, color: '#16a34a' }}>🚚 Imejumuishwa</span>
            )}
          </div>

          {/* ETA confirmation for intercity agent orders */}
          {getSelectedMethodData()?.key === 'agent' && getSelectedMethodData()?.estimatedDays && (
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>📦 Maelezo ya Utoaji</div>
              {getSelectedMethodData().transitCity && (
                <div style={{ fontSize: 11, color: '#92400e', backgroundColor: '#fef9c3', borderRadius: 6, padding: '4px 8px', marginBottom: 6 }}>
                  🔄 Kifurushi chako kitapita <strong>{getSelectedMethodData().transitCity}</strong> kabla ya kufika kwako
                  {getSelectedMethodData().leg1Days && getSelectedMethodData().leg2Days && (
                    <span> (siku {getSelectedMethodData().leg1Days} + siku {getSelectedMethodData().leg2Days})</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Muda wa uwasilishaji</span>
                <span style={{ fontWeight: 700, color: '#15803d' }}>Siku {getSelectedMethodData().estimatedDays}</span>
              </div>
              {getSelectedMethodData().expectedArrival && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 3 }}>
                  <span style={{ color: '#64748b' }}>Inatarajiwa kufika</span>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                    📅 {new Date(getSelectedMethodData().expectedArrival).toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Collection fee line */}
          {needsCollection && !isSameCity && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>🚴 Ada ya Kukusanya {isRuralCollection ? '(Vijijini)' : '(Mjini)'}</span>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>TZS {(isRuralCollection ? 3000 : 1500).toLocaleString()}</span>
            </div>
          )}
          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#2563eb' }}>TZS {getCartTotal().toLocaleString()}</span>
          </div>
          <button onClick={handleCheckout} disabled={loading || cart.length === 0}
            style={{ width: '100%', background: loading ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: 14, borderRadius: 12, cursor: loading || cart.length === 0 ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 800, marginBottom: 10, fontFamily: 'Manrope,sans-serif', boxShadow: '0 4px 14px rgba(29,78,216,0.3)' }}>
            {loading ? '⏳ Placing Order...' : '✅ Place Order'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>🔒 Secure checkout · KenteXa Protected</div>
        </div>
        <div style={{ height: 90 }} />
      </div>
    </div>
  );
};

export default Checkout;