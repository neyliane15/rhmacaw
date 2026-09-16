import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { ProvedorAuth } from './contextos/AuthContext.js';
import { ProvedorCompetencia } from './contextos/CompetenciaContext.js';
import { ProvedorTema } from './contextos/TemaContext.js';
import './estilos.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorTema>
        <ProvedorAuth>
          <ProvedorCompetencia>
            <App />
          </ProvedorCompetencia>
        </ProvedorAuth>
      </ProvedorTema>
    </BrowserRouter>
  </StrictMode>,
);
