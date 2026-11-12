import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './i18n'; // ← import i18n before App
import { RoleContextProvider } from './context/RoleContext';
import { SocketProvider } from './context/SocketProvider';
import { isAppleMobile } from './public/utils/isAppleMobile';

if (isAppleMobile()) document.documentElement.classList.add('kentexa-apple-mobile');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RoleContextProvider>
      <SocketProvider>
        <App />
      </SocketProvider>
    </RoleContextProvider>
  </React.StrictMode>
);
