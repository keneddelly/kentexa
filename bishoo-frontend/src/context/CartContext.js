import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAccessToken } from '../api/tokenStore';

const CartContext = createContext(null);

// ── Resolve a per-user storage key so each account has its own cart ─────────
// Falls back to a shared "guest" cart when no one is logged in.
const getUserKey = () => {
  try {
    const token = getAccessToken();
    if (!token) return 'guest';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.sub ? `user_${payload.sub}` : 'guest';
  } catch {
    return 'guest';
  }
};

const cartStorageKey = (userKey) => `kentexa_cart_${userKey}`;

const loadCart = (userKey) => {
  try {
    const saved = localStorage.getItem(cartStorageKey(userKey));
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const CartProvider = ({ children }) => {
  const [userKey, setUserKey] = useState(getUserKey);
  const [cart, setCart] = useState(() => loadCart(getUserKey()));

  // Persist cart under the current user's key whenever it changes
  useEffect(() => {
    localStorage.setItem(cartStorageKey(userKey), JSON.stringify(cart));
  }, [cart, userKey]);

  // ── Detect login/logout (token change) and switch to that user's cart ──────
  // Covers: cross-tab login via the native 'storage' event, and same-tab
  // login/logout via a custom 'kentexa-auth-changed' event (dispatch this
  // from handleLoginSuccess / handleLogout in App.js).
  const refreshUserKey = useCallback(() => {
    const newKey = getUserKey();
    setUserKey(prevKey => {
      if (newKey !== prevKey) {
        setCart(loadCart(newKey));
      }
      return newKey;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('storage', refreshUserKey);
    window.addEventListener('kentexa-auth-changed', refreshUserKey);
    return () => {
      window.removeEventListener('storage', refreshUserKey);
      window.removeEventListener('kentexa-auth-changed', refreshUserKey);
    };
  }, [refreshUserKey]);

  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + quantity, item.stock) }
            : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.id === productId
          ? { ...item, quantity: Math.min(quantity, item.stock) }
          : item
      )
    );
  };

  const clearCart = () => setCart([]);
  const isInCart = (productId) => cart.some(item => item.id === productId);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.displayPrice || item.basePrice || item.price || 0) * item.quantity, 0
  );

  return (
    <CartContext.Provider value={{
      cart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      isInCart,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
