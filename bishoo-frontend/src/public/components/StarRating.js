import React, { useState } from 'react';

// Shared 1-5 star picker — extracted from ConfirmDelivery.js's original
// inline Star component so seller/super-agent/transport rating sections
// (and any future one) all use the same widget instead of hand-rolled copies.
const StarRating = ({ value, onChange, size = 44 }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n === value ? 0 : n)}
          style={{
            fontSize: size, cursor: 'pointer',
            color: n <= (hover || value) ? '#f59e0b' : '#e2e8f0',
            transition: 'color 0.15s', userSelect: 'none',
          }}>★</span>
      ))}
    </div>
  );
};

export default StarRating;
