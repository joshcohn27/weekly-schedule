import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Styling is added last and lives in one file. Comment this line out to see the plain, unstyled app.
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
