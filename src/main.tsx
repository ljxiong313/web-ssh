import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '@/ctx';
import { TerminalProvider } from '@/ctx/terminal';
import { ThemeProvider } from '@/contexts/theme-context';
import App from './App';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ThemeProvider>
          <TerminalProvider>
            <App />
          </TerminalProvider>
        </ThemeProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
