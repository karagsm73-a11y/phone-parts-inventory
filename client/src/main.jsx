import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import App from './App';
// Scrolling over a focused number field must never change its value: drop focus so the wheel just scrolls the page.
document.addEventListener('wheel', (e) => {
  const el = document.activeElement;
  if (el && el.tagName === 'INPUT' && el.type === 'number' && el.contains(e.target)) el.blur();
}, { capture: true, passive: true });
createRoot(document.getElementById('root')).render(<App />);