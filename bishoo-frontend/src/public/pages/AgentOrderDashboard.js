import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import api from '../../api/api';

const AgentOrderDashboard = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const [activeTab, setActiveTab] = useState('incoming');
  const [incoming, setIncoming] = useState([]);
  const [inStorage, setInStorage] = useState([]);
  const [readyForPickup, setReadyForPickup] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Receipt form
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    handoverCode: '',
    condition: 'good',
    notes: '',
  });

  // Pickup form
  const [showPickupForm, setShowPickupForm] = useState(false);
  const [pickupForm, setPickupForm] = useState({ orderId: '', otpCode: '' });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) { onNavigate('PublicLogin'); return; }
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [inc, stor, ready, comp] = await Promise.all([
        api.get('/agent-orders/incoming'),
        api.get('/agent-orders/in-storage'),
        api.get('/agent-orders/ready-for-pickup'),
        api.get('/agent-orders/completed'),
      ]);
      setIncoming(inc.data);
      setInStorage(stor.data);
      setReadyForPickup(ready.data);
      setCompleted(comp.data);
    } catch (err) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!receiptForm.handoverCode) {
      setError('Handover code is required');
      return;
    }
    try {
      setProcessing(true);
      await api.post('/agent-orders/confirm-receipt', receiptForm);
      setMessage('Product receipt confirmed. Customer has been notified!');
      setShowReceiptForm(false);
      setReceiptForm({ handoverCode: '', condition: 'good', notes: '' });
      fetchAllData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to confirm receipt');
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyPickup = async () => {
    if (!pickupForm.orderId || !pickupForm.otpCode) {
      setError('Order ID and OTP are required');
      return;
    }
    try {
      setProcessing(true);
      const res = await api.post('/agent-orders/verify-pickup', {
        orderId: Number(pickupForm.orderId),
        otpCode: pickupForm.otpCode,
      });
      setMessage('Pickup verified! Order completed and commission released.');
      setShowPickupForm(false);
      setPickupForm({ orderId: '', otpCode: '' });
      fetchAllData();
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid OTP');
    } finally {
      setProcessing(false);
    }
  };

  const tabs = [
    { key: 'incoming', label: '📦 Incoming', count: incoming.length, color: '#667eea' },
    { key: 'storage', label: '🏪 In Storage', count: inStorage.length, color: '#f7971e' },
    { key: 'pickup', label: '🔔 Ready', count: readyForPickup.length, color: '#10b981' },
    { key: 'completed', label: '✅ Completed', count: completed.length, color: '#6366f1' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Navbar currentPage="AgentOrderDashboard" onNavigate={onNavigate} isLoggedIn={isLoggedIn} onLogout={onLogout} userRole={userRole} />

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', padding: '32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#1e293b', margin: '0 0 4px' }}>
              📦 Order Management
            </h1>
            <p style={{ fontSize: '14px', color: 'rgba(30,41,59,0.7)', margin: 0 }}>
              Receive, store, and hand over products
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowReceiptForm(true)}
              style={{ background: '#fff', color: '#f59e0b', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}
            >
              📦 Confirm Receipt
            </button>
            <button
              onClick={() => setShowPickupForm(true)}
              style={{ background: 'rgba(255,255,255,0.2)', color: '#1e293b', border: '2px solid rgba(255,255,255,0.5)', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}
            >
              ✅ Verify Pickup
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {message && (
          <div style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#fff', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px', fontWeight: '600' }}>
            ✅ {message}
            <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 'bold' }}>×</button>
          </div>
        )}
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '14px' }}>
            ❌ {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {tabs.map(tab => (
            <div key={tab.key} style={{
              backgroundColor: '#fff', borderRadius: '14px', padding: '20px',
              textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              borderTop: `4px solid ${tab.color}`, cursor: 'pointer',
              border: activeTab === tab.key ? `2px solid ${tab.color}` : `1px solid #f1f5f9`,
            }} onClick={() => setActiveTab(tab.key)}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{tab.label.split(' ')[0]}</div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: tab.color }}>{tab.count}</div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{tab.label.split(' ').slice(1).join(' ')}</div>
            </div>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading orders...</div>
        ) : (
          <>
            {/* Incoming Products */}
            {activeTab === 'incoming' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>📦 Incoming Products</h2>
                {incoming.length === 0 ? (
                  <EmptyState icon="📦" text="No incoming products" />
                ) : (
                  incoming.map(item => (
                    <OrderCard key={item.id} item={item} type="handover" onAction={() => { setReceiptForm({ ...receiptForm, handoverCode: item.handoverCode }); setShowReceiptForm(true); }} actionLabel="Confirm Receipt" actionColor="#f7971e" />
                  ))
                )}
              </div>
            )}

            {/* In Storage */}
            {activeTab === 'storage' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>🏪 Products in Storage</h2>
                {inStorage.length === 0 ? (
                  <EmptyState icon="🏪" text="No products in storage" />
                ) : (
                  inStorage.map(item => (
                    <StorageCard key={item.id} item={item} />
                  ))
                )}
              </div>
            )}

            {/* Ready for Pickup */}
            {activeTab === 'pickup' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>🔔 Ready for Customer Pickup</h2>
                {readyForPickup.length === 0 ? (
                  <EmptyState icon="🔔" text="No products waiting for pickup" />
                ) : (
                  readyForPickup.map(item => (
                    <OrderCard key={item.id} item={item} type="pickup" onAction={() => { setPickupForm({ ...pickupForm, orderId: item.order?.id }); setShowPickupForm(true); }} actionLabel="Verify Pickup" actionColor="#10b981" />
                  ))
                )}
              </div>
            )}

            {/* Completed */}
            {activeTab === 'completed' && (
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>✅ Completed Pickups</h2>
                {completed.length === 0 ? (
                  <EmptyState icon="✅" text="No completed pickups yet" />
                ) : (
                  completed.map(item => (
                    <StorageCard key={item.id} item={item} completed />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm Receipt Modal */}
      {showReceiptForm && (
        <Modal title="📦 Confirm Product Receipt" onClose={() => setShowReceiptForm(false)}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Handover Code *</label>
            <input
              placeholder="KNT-HND-00001"
              value={receiptForm.handoverCode}
              onChange={e => setReceiptForm({ ...receiptForm, handoverCode: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Product Condition *</label>
            <select
              value={receiptForm.condition}
              onChange={e => setReceiptForm({ ...receiptForm, condition: e.target.value })}
              style={inputStyle}
            >
              <option value="good">✅ Good Condition</option>
              <option value="damaged">❌ Damaged</option>
              <option value="incomplete">⚠️ Incomplete</option>
            </select>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              placeholder="Any notes about the product..."
              value={receiptForm.notes}
              onChange={e => setReceiptForm({ ...receiptForm, notes: e.target.value })}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowReceiptForm(false)} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={handleConfirmReceipt}
              disabled={processing}
              style={{ ...actionBtnStyle, background: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', color: '#1e293b' }}
            >
              {processing ? 'Processing...' : '✅ Confirm Receipt'}
            </button>
          </div>
        </Modal>
      )}

      {/* Verify Pickup Modal */}
      {showPickupForm && (
        <Modal title="✅ Verify Customer Pickup" onClose={() => setShowPickupForm(false)}>
          <div style={{ backgroundColor: '#fef9c3', borderRadius: '10px', padding: '14px', marginBottom: '20px', fontSize: '13px', color: '#92400e' }}>
            ⚠️ Ask the customer for their OTP. Verify their identity before releasing the product.
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Order ID *</label>
            <input
              placeholder="e.g. 42"
              value={pickupForm.orderId}
              onChange={e => setPickupForm({ ...pickupForm, orderId: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Customer OTP *</label>
            <input
              placeholder="6-digit OTP from customer"
              value={pickupForm.otpCode}
              onChange={e => setPickupForm({ ...pickupForm, otpCode: e.target.value })}
              maxLength={6}
              style={{ ...inputStyle, fontSize: '20px', fontWeight: '800', letterSpacing: '8px', textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowPickupForm(false)} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={handleVerifyPickup}
              disabled={processing}
              style={{ ...actionBtnStyle, background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: '#1e293b' }}
            >
              {processing ? 'Verifying...' : '✅ Verify & Complete'}
            </button>
          </div>
        </Modal>
      )}

      <Footer onNavigate={onNavigate} />
    </div>
  );
};

// Sub-components
const EmptyState = ({ icon, text }) => (
  <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '14px', color: '#94a3b8' }}>
    <div style={{ fontSize: '48px', marginBottom: '12px' }}>{icon}</div>
    <p>{text}</p>
  </div>
);

const OrderCard = ({ item, type, onAction, actionLabel, actionColor }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div>
      <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
        {type === 'handover' ? `Handover: ${item.handoverCode}` : `Order #${item.order?.id}`}
      </div>
      <div style={{ fontSize: '13px', color: '#64748b' }}>
        {type === 'handover'
          ? `From: ${item.seller?.email} • ${new Date(item.createdAt).toLocaleDateString()}`
          : `Expires: ${new Date(item.expiresAt).toLocaleDateString()} • Received: ${new Date(item.receivedAt).toLocaleDateString()}`
        }
      </div>
      {item.order?.product?.name && (
        <div style={{ fontSize: '13px', color: '#7c3aed', fontWeight: '600', marginTop: '4px' }}>
          📦 {item.order.product.name}
        </div>
      )}
    </div>
    <button
      onClick={onAction}
      style={{ backgroundColor: actionColor + '20', color: actionColor, border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '800' }}
    >
      {actionLabel}
    </button>
  </div>
);

const StorageCard = ({ item, completed }) => (
  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
          Order #{item.order?.id}
        </div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
          {item.order?.product?.name}
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Received: {item.receivedAt ? new Date(item.receivedAt).toLocaleDateString() : '—'}
          {!completed && ` • Expires: ${item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—'}`}
          {completed && ` • Completed`}
        </div>
      </div>
      <span style={{
        fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px',
        backgroundColor: completed ? '#dcfce7' : '#fef9c3',
        color: completed ? '#16a34a' : '#ca8a04',
      }}>
        {completed ? '✅ Completed' : '⏳ Waiting'}
      </span>
    </div>
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', width: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', margin: 0 }}>{title}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const labelStyle = { display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: '600' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box', outline: 'none' };
const cancelBtnStyle = { flex: 1, backgroundColor: '#f1f5f9', color: '#64748b', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' };
const actionBtnStyle = { flex: 1, border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '14px' };

export default AgentOrderDashboard;