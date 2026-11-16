// Older phones (owner approved 2026-11-15): fill in the newer browser functions the site uses,
// for phones whose Chrome has not been updated for a long time. Must stay the first imports.
import './polyfills';
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './i18n'; // ← import i18n before App
import { RoleContextProvider } from './context/RoleContext';
import { SocketProvider } from './context/SocketProvider';
import { isAppleMobile } from './public/utils/isAppleMobile';
import PageErrorBoundary from './public/components/PageErrorBoundary';
import { PageLoading } from './utils/lazyPage';
import { reportClientError } from './utils/clientErrors';

if (isAppleMobile()) document.documentElement.classList.add('kentexa-apple-mobile');

// Errors outside React (a broken script, an old browser missing a function) are reported too.
window.addEventListener('error', (event) => {
  if (!event || !event.message) return;
  reportClientError({ kind: 'script', message: event.message, error: event.error });
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PageErrorBoundary scope="app" page="app">
      <Suspense fallback={<PageLoading />}>
        <RoleContextProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </RoleContextProvider>
      </Suspense>
    </PageErrorBoundary>
  </React.StrictMode>
);
// The site's code ran: index.html stops waiting to show its "slow / old browser" message.
window.__kxMounted = true;
if (window.__kxBootDone) window.__kxBootDone();
