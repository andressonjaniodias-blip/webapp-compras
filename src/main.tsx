import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { aplicarTema } from './lib/tema';
import './estilos.css';

// O atributo ja foi posto pelo script do `index.html`; aqui acertam-se as
// `theme-color`, que so este lado sabe igualar.
aplicarTema();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
