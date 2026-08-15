import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './i18n'; // ← import i18n before App

// Temporary on-page error overlay — lets a real crash be read directly off
// the phone screen (photographed/typed back) without needing Safari's
// remote Web Inspector or a Mac. Remove once the "no data on iPhone
// Safari" investigation is closed out.
function showCrashOverlay(message) {
  let el = document.getElementById('__crash_overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = '__crash_overlay';
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:999999;background:#7f1d1d;' +
      'color:#fff;font:12px/1.5 monospace;padding:10px 12px;max-height:50vh;' +
      'overflow:auto;white-space:pre-wrap;word-break:break-word;';
    document.body.appendChild(el);
  }
  const line = document.createElement('div');
  line.style.cssText = 'border-top:1px solid rgba(255,255,255,0.25);padding-top:6px;margin-top:6px;';
  line.textContent = message;
  el.appendChild(line);
}

window.addEventListener('error', (e) => {
  showCrashOverlay(
    `[error] ${e.message}\n${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack || ''}`,
  );
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  showCrashOverlay(
    `[unhandledrejection] ${reason?.message || reason}\n${reason?.stack || ''}`,
  );
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);