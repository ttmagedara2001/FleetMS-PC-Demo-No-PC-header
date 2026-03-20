/**
 * Fabrix Fleet Management System — Application Entry Point
 *
 * Bootstraps the React application with StrictMode for
 * development-time checks and renders the root <App /> component.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
