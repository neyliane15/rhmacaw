import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contextos/AuthContext.js';
import { useCompetencia } from '../contextos/CompetenciaContext.js';
import { useTema } from '../contextos/TemaContext.js';
import { ROTULO_PAPEL } from '../util/rotulos.js';
import { iniciais } from '../util/formato.js';
import { SeletorCompetencia } from './SeletorCompetencia.js';
import {
  IconeBanco,
  IconeCalendario,
  IconeFechar,
  IconeFolha,
  IconeLua,
  IconeMenu,
  IconeMoedas,
  IconePainel,
  IconePalmeira,
  IconePessoas,
  IconePresente,
  IconeRelatorio,
  IconeSaida,
  IconeSol,
} from './Icones.js';

interface ItemNav {
  para: string;
  rotulo: string;
  icone: JSX.Element;
  permissao: string;
  fim?: boolean;
}

interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

const NAVEGACAO: GrupoNav[] = [
  {
    titulo: 'Visao geral',
    itens: [{ para: '/', rotulo: 'Painel', icone: <IconePainel />, permissao: 'relatorios:ler', fim: true }],
  },
  {
    titulo: 'Pessoas',
    itens: [
      { para: '/colaboradores', rotulo: 'Colaboradores', icone: <IconePessoas />, permissao: 'colaboradores:ler' },
      { para: '/faltas', rotulo: 'Faltas e ponto', icone: <IconeCalendario />, permissao: 'faltas:ler' },
      { para: '/ferias', rotulo: 'Ferias', icone: <IconePalmeira />, permissao: 'ferias:ler' },
    ],
  },
  {
    titulo: 'Pagamento',
    itens: [
      { para: '/comissoes', rotulo: 'Comissoes da semana', icone: <IconeMoedas />, permissao: 'comissoes:ler' },
      { para: '/folha', rotulo: 'Folha', icone: <IconeFolha />, permissao: 'folha:ler' },
      { para: '/decimo-terceiro', rotulo: 'Decimo terceiro', icone: <IconePresente />, permissao: 'folha:ler' },
      { para: '/rescisoes', rotulo: 'Rescisoes', icone: <IconeSaida />, permissao: 'rescisoes:ler' },
    ],
  },
  {
    titulo: 'Tesouraria',
    itens: [{ para: '/banco', rotulo: 'Banco e remessas', icone: <IconeBanco />, permissao: 'banco:ler' }],
  },
  {
    titulo: 'Analise',
    itens: [{ para: '/relatorios', rotulo: 'Relatorios', icone: <IconeRelatorio />, permissao: 'relatorios:ler' }],
  },
];

function Marca(): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-arara-700 font-display text-base font-bold text-ouro-300">
        R
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-base font-semibold tracking-tight">RH Macaw</span>
        <span className="sobrancelha block leading-none">Folha e pagamento</span>
      </span>
    </div>
  );
}

export function Layout(): JSX.Element {
  const { sessao, sair, pode } = useAuth();
  const { tema, alternar } = useTema();
  const { competencia, definir } = useCompetencia();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();

  useEffect(() => {
    setMenuAberto(false);
  }, [local.pathname]);

  const barra = (
    <nav aria-label="Navegacao principal" className="flex h-full flex-col gap-1 overflow-y-auto rolagem-fina px-3 py-4">
      <div className="px-1 pb-4">
        <Marca />
      </div>
      {NAVEGACAO.map((grupo) => {
        const visiveis = grupo.itens.filter((item) => pode(item.permissao));
        if (visiveis.length === 0) return null;
        return (
          <div key={grupo.titulo} className="mb-2">
            <p className="sobrancelha px-2 pb-1">{grupo.titulo}</p>
            <ul className="space-y-0.5">
              {visiveis.map((item) => (
                <li key={item.para}>
                  <NavLink
                    to={item.para}
                    end={item.fim}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-arara-700 font-semibold text-white shadow-sm dark:bg-arara-600'
                          : 'text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)] hover:text-[var(--texto)]'
                      }`
                    }
                  >
                    <span className="text-base">{item.icone}</span>
                    <span className="truncate">{item.rotulo}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="mt-auto rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] p-2.5">
        <p className="sobrancelha">Empresa</p>
        <p className="truncate text-sm font-medium">{sessao?.tenant.nome ?? '—'}</p>
        <p className="truncate font-mono text-2xs text-[var(--texto-3)]">{sessao?.tenant.cnpj ?? ''}</p>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-arara-700 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Pular para o conteudo
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-barra border-r border-[var(--borda)] bg-[var(--superficie)] lg:block">
        {barra}
      </aside>

      {menuAberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-tinta-950/50" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-[17rem] animate-entrada border-r border-[var(--borda)] bg-[var(--superficie)]">
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="botao-fantasma absolute right-2 top-3 px-2 py-1"
            >
              <IconeFechar />
            </button>
            {barra}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-barra">
        <header className="sticky top-0 z-20 flex h-topo items-center gap-2 border-b border-[var(--borda)] bg-[var(--superficie)]/95 px-3 backdrop-blur sm:px-5">
          <button type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu" className="botao-fantasma px-2 py-1 text-lg lg:hidden">
            <IconeMenu />
          </button>
          <div className="lg:hidden">
            <span className="font-display text-base font-semibold">RH Macaw</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <SeletorCompetencia valor={competencia} aoMudar={definir} compacto />
            </div>
            <button
              type="button"
              onClick={alternar}
              className="botao-secundario px-2 py-1.5 text-base"
              aria-label={tema === 'claro' ? 'Ativar tema escuro' : 'Ativar tema claro'}
              title={tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
            >
              {tema === 'claro' ? <IconeLua /> : <IconeSol />}
            </button>
            <div className="flex items-center gap-2 rounded-md border border-[var(--borda)] py-1 pl-1 pr-1.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded bg-arara-100 font-mono text-2xs font-bold text-arara-800 dark:bg-arara-900 dark:text-arara-100"
                aria-hidden="true"
              >
                {iniciais(sessao?.usuario.nome ?? '?')}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-[10rem] truncate text-xs font-semibold">{sessao?.usuario.nome}</span>
                <span className="sobrancelha block leading-none">{sessao ? ROTULO_PAPEL[sessao.usuario.papel] : ''}</span>
              </span>
              <button type="button" onClick={sair} className="botao-fantasma px-1.5 py-1" title="Sair" aria-label="Sair da conta">
                <IconeSaida />
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-[var(--borda)] bg-[var(--superficie)] px-3 py-2 sm:hidden">
          <SeletorCompetencia valor={competencia} aoMudar={definir} compacto />
        </div>

        <main id="conteudo" className="px-3 py-4 sm:px-5 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
