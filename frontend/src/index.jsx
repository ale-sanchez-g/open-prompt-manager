import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initTelemetry } from './telemetry';

// Browser RUM is a strict no-op unless VITE_OTEL_ENABLED + VITE_OTEL_EXPORTER_URL
// are configured (see src/telemetry/config.js). Fire-and-forget: telemetry
// must never delay or break app boot.
initTelemetry();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
