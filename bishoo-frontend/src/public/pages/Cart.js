import React from 'react';
import { useCart } from '../../context/CartContext';

const Cart = ({ onNavigate, isLoggedIn, onLogout, userRole }) => {
  const { cart, removeFromCart, updateQuantity, clearCart } = useCart();

  const getItemPrice = (item) => Number(item.displayPrice || item.basePrice || item.price || 0);
  const getItemTotal = (item) => getItemPrice(item) * item.quantity;
  const total = cart.reduce((sum, item) => sum + getItemTotal(item), 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>

      <style>{`
        .cart-root { padding: 12px 12px 100px; max-width: 1000px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .cart-layout { display: flex; flex-direction: column; gap: 12px; }

        /* Cart item card */
        .cart-item { background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; display: flex; gap: 10px; align-items: flex-start; }
        .cart-item-img { width: 64px; height: 64px; border-radius: 10px; background: #f1f5f9; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .cart-item-info { flex: 1; min-width: 0; }
        .cart-item-name { font-size: 13px; font-weight: 700; color: #1e293b; margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cart-item-price { font-size: 14px; font-weight: 900; color: #1d4ed8; margin: 4px 0; }
        .cart-item-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
        .cart-qty { display: flex; align-items: center; border: 1.5px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .cart-qty-btn { width: 30px; height: 30px; background: #f8fafc; border: none; cursor: pointer; font-size: 16px; font-weight: 700; color: #1d4ed8; display: flex; align-items: center; justify-content: center; }
        .cart-qty-num { width: 28px; text-align: center; font-size: 13px; font-weight: 800; color: #0f172a; }
        .cart-remove { background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 700; color: #ef4444; padding: 4px 8px; border-radius: 6px; background: #fee2e2; }

        /* Summary card */
        .cart-summary { background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
        .cart-summary-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 8px; }
        .cart-checkout-btn { width: 100%; background: linear-gradient(135deg,#1d4ed8,#2563eb); color: #fff; border: none; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 800; box-shadow: 0 4px 16px rgba(29,78,216,0.3); font-family: 'Manrope',sans-serif; }

        /* Desktop: side by side */
        @media (min-width: 768px) {
          .cart-layout { flex-direction: row; align-items: flex-start; }
          .cart-items-col { flex: 1; }
          .cart-summary-col { width: 300px; flex-shrink: 0; position: sticky; top: 80px; }
          .cart-item-img { width: 80px; height: 80px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#1d4ed8)', padding: '16px 16px 20px' }}>
        <button onClick={() => onNavigate('Home')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Home
        </button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px', fontFamily: 'Manrope,sans-serif' }}>🛒 Shopping Cart</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
            {cart.length} item{cart.length !== 1 ? 's' : ''} in your cart
          </p>
        </div>
      </div>

      <div className="cart-root">
        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginTop: 8 }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🛒</div>
            <h2 style={{ color: '#1e293b', marginBottom: 8, fontSize: 18 }}>Your cart is empty</h2>
            <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>Add products from our store to get started</p>
            <button onClick={() => onNavigate('Stores')}
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', border: 'none', padding: '13px 28px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              🏪 Browse Store
            </button>
          </div>
        ) : (
          <div className="cart-layout">

            {/* ── ITEMS COLUMN ── */}
            <div className="cart-items-col">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', margin: 0 }}>Cart Items ({cart.length})</h2>
                <button onClick={clearCart}
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                  🗑 Clear All
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cart.map(item => {
                  const itemPrice = getItemPrice(item);
                  const itemTotal = getItemTotal(item);
                  return (
                    <div key={item.id} className="cart-item">
                      {/* Image */}
                      <div className="cart-item-img">
                        {item.images?.[0]
                          ? <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 24 }}>📦</span>
                        }
                      </div>

                      {/* Info */}
                      <div className="cart-item-info">
                        <div className="cart-item-name">{item.name}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, backgroundColor: '#ede9fe', color: '#7c3aed' }}>
                          {item.category?.replace(/_/g, ' ')}
                        </span>
                        <div className="cart-item-price">TZS {itemPrice.toLocaleString()}</div>

                        <div className="cart-item-actions">
                          {/* Qty */}
                          <div className="cart-qty">
                            <button className="cart-qty-btn" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                            <span className="cart-qty-num">{item.quantity}</span>
                            <button className="cart-qty-btn" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                          </div>

                          {/* Item total + remove */}
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>
                              TZS {itemTotal.toLocaleString()}
                            </div>
                            <button className="cart-remove" onClick={() => removeFromCart(item.id)}>Remove</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={() => onNavigate('Stores')}
                style={{ backgroundColor: 'transparent', color: '#1d4ed8', border: '2px solid #1d4ed8', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginTop: 12 }}>
                ← Continue Shopping
              </button>
            </div>

            {/* ── SUMMARY COLUMN ── */}
            <div className="cart-summary-col">
              <div className="cart-summary">
                <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>📋 Order Summary</h2>

                {/* Item list */}
                <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
                  {cart.map(item => (
                    <div key={item.id} className="cart-summary-row">
                      <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                        {item.name} ×{item.quantity}
                      </span>
                      <span style={{ color: '#1e293b', fontWeight: 700, flexShrink: 0 }}>
                        TZS {getItemTotal(item).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: 12, marginBottom: 4 }}>
                  <div className="cart-summary-row">
                    <span style={{ color: '#64748b' }}>Subtotal</span>
                    <span style={{ color: '#1e293b', fontWeight: 700 }}>TZS {total.toLocaleString()}</span>
                  </div>
                  <div className="cart-summary-row">
                    <span style={{ color: '#64748b' }}>Delivery</span>
                    <span style={{ color: '#16a34a', fontWeight: 800 }}>🚚 FREE</span>
                  </div>
                </div>

                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8' }}>TZS {total.toLocaleString()}</span>
                </div>

                <button className="cart-checkout-btn"
                  onClick={() => isLoggedIn ? onNavigate('Checkout') : onNavigate('PublicLogin')}>
                  {isLoggedIn ? '🛒 Proceed to Checkout' : '🔐 Login to Checkout'}
                </button>

                <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
                  🔒 Secure checkout · KenteXa Protected
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;