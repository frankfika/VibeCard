import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import './index.css';
import { ToastProvider } from './components/ui/ToastProvider.tsx';
import { ThemeProvider } from './components/ThemeProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        {/* Respect the OS reduced-motion setting for every recognition moment (task 3.3) */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
