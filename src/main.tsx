import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { App } from './App';
import { engine } from '@/audio/engine/AudioEngine';
import { useProject } from '@/state/projectStore';
import { useUi } from '@/state/uiStore';
import { useTransport } from '@/state/transportStore';
import * as fx from '@/features/fx/fxActions';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Puerta de depuración para pruebas E2E (sólo lectura del estado; sin efectos en producción).
if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
  (window as unknown as { __sonora: unknown }).__sonora = { engine, project: useProject, ui: useUi, transport: useTransport, fx };
}
