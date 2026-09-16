/**
 * Ponto de entrada da demonstracao publicada.
 *
 * Difere do `main.tsx` normal em uma unica coisa: antes do React montar, sobe o
 * servidor dentro do navegador e redireciona `/api/...` para ele. A aplicacao
 * em si e exatamente a mesma — `HashRouter` no lugar de `BrowserRouter` porque
 * a pagina publicada nao tem um servidor para reescrever as rotas.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from '../App.js';
import { ProvedorAuth } from '../contextos/AuthContext.js';
import { ProvedorCompetencia } from '../contextos/CompetenciaContext.js';
import { ProvedorTema } from '../contextos/TemaContext.js';
import { instalarInterceptor } from './interceptor.js';
import { iniciarDemo } from './servidor.js';
import '../estilos.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

function Carregando({ mensagem }: { mensagem: string }): JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--plano)] px-6 text-center">
      <div>
        <p className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--texto-3)]">RH Macaw</p>
        <p className="mt-2 font-display text-lg font-semibold text-[var(--texto)]">{mensagem}</p>
        <p className="mt-1 text-sm text-[var(--texto-2)]">
          O banco de dados e a folha rodam dentro do seu navegador. Nada é enviado para fora.
        </p>
      </div>
    </div>
  );
}

const root = createRoot(raiz);
root.render(<Carregando mensagem="Preparando a folha de agosto…" />);

// Na primeira visita, abre na competencia que tem os dados da planilha. Sem
// isso a demonstracao cairia no mes corrente, que esta vazio, e pareceria
// quebrada. Quem ja navegou mantem a competencia que escolheu.
try {
  if (!localStorage.getItem('rhmacaw.competencia')) localStorage.setItem('rhmacaw.competencia', '2025-08');
} catch {
  /* navegador sem localStorage: a competencia volta ao padrao do app */
}

instalarInterceptor();

iniciarDemo()
  .then(() => {
    root.render(
      <StrictMode>
        <HashRouter>
          <ProvedorTema>
            <ProvedorAuth>
              <ProvedorCompetencia>
                <App />
              </ProvedorCompetencia>
            </ProvedorAuth>
          </ProvedorTema>
        </HashRouter>
      </StrictMode>,
    );
  })
  .catch((erro: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar a demonstração:', erro);
    root.render(<Carregando mensagem={`Não foi possível iniciar: ${erro instanceof Error ? erro.message : String(erro)}`} />);
  });
