import React, { useEffect, useState } from 'react';

/**
 * Micro-celebration animation — confetti burst + message.
 * Psychology: small dopamine hits on milestone moments make users
 * associate the app with positive feeling, increasing return visits.
 *
 * Usage — trigger on: first order placed, first sale as seller,
 * order delivered, milestone reached (10th order etc).
 *
 *   const [celebrate, setCelebrate] = useState(false);
 *   ...
 *   {celebrate && <Celebration message="Agizo lako la kwanza! 🎉" onDone={() => setCelebrate(false)} />}
 */
const COLORS = ['#1d4ed8', '#f59e0b', '#16a34a', '#ec4899', '#7c3aed'];

const Celebration = ({ message, onDone, duration = 2500 }) => {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.5 + Math.random() * 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360,
    }))
  );

  useEffect(() => {
    const timer = setTimeout(() => onDone && onDone(), duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes celebration-pop {
          0% { transform: scale(0.5) translateY(20px); opacity: 0; }
          50% { transform: scale(1.05) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes celebration-fade-out {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: 0, left: `${p.left}%`,
          width: p.size, height: p.size * 0.4,
          backgroundColor: p.color, borderRadius: 2,
          animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
        }} />
      ))}

      {message && (
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
          backgroundColor: '#fff', borderRadius: 20, padding: '20px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center',
          animation: `celebration-pop 0.4s ease-out, celebration-fade-out 0.4s ease-in ${(duration - 400) / 1000}s forwards`,
          maxWidth: 280,
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1e293b' }}>{message}</div>
        </div>
      )}
    </div>
  );
};

export default Celebration;