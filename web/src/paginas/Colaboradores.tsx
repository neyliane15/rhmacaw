import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SITUACOES, TIPOS_CONTRATO, formatarBRL, formatarCPF, formatarDataBR, type Colaborador, type Situacao, type TipoContrato } from '@rhmacaw/shared';
import * as apiColaboradores from '../api/colaboradores.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina } from '../componentes/Cartoes.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeMais, IconePessoas } from '../componentes/Icones.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAtraso, useRequisicao } from '../ganchos/useRequisicao.js';
import { ROTULO_CONTRATO, ROTULO_SITUACAO, TOM_SITUACAO } from '../util/rotulos.js';

const POR_PAGINA = 25;

export function Colaboradores(): JSX.Element {
  const navegar = useNavigate();
  const { pode } = useAuth();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao | ''>('');
  const [centroCusto, setCentroCusto] = useState('');
  const [tipoContrato, setTipoContrato] = useState<TipoContrato | ''>('');
  const [pagina, setPagina] = useState(1);
  const buscaAtrasada = useAtraso(busca, 320);

  const lista = useRequisicao(
    () =>
      apiColaboradores.listar({
        busca: buscaAtrasada || undefined,
        situacao: situacao || undefined,
        centroCusto: centroCusto || undefined,
        tipoContrato: tipoContrato || undefined,
        pagina,
        porPagina: POR_PAGINA,
      }),
    [buscaAtrasada, situacao, centroCusto, tipoContrato, pagina],
  );

  // Lista de centros de custo para o filtro — uma leitura ampla, sem filtro.
  const universo = useRequisicao(() => apiColaboradores.listar({ porPagina: 500 }), []);
  const centros = useMemo(() => {
    const conjunto = new Set<string>();
    for (const c of universo.dados?.itens ?? []) conjunto.add(c.centroCusto);
    return [...conjunto].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [universo.dados]);

  const itens = lista.dados?.itens ?? [];
  const total = lista.dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const colunas: Coluna<Colaborador>[] = [
    {
      chave: 'matricula',
      titulo: 'Matricula',
      largura: '6.5rem',
      valor: (c) => c.matricula,
      render: (c) => <span className="font-mono text-xs text-[var(--texto-3)]">{c.matricula}</span>,
    },
    {
      chave: 'nome',
      titulo: 'Colaborador',
      valor: (c) => c.nome,
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.nome}</p>
          <p className="truncate font-mono text-2xs text-[var(--texto-3)]">{formatarCPF(c.cpf)}</p>
        </div>
      ),
    },
    { chave: 'funcao', titulo: 'Função', valor: (c) => c.funcao, render: (c) => <span className="text-[var(--texto-2)]">{c.funcao}</span> },
    {
      chave: 'centroCusto',
      titulo: 'Centro de custo',
      valor: (c) => c.centroCusto,
      render: (c) => <span className="text-xs text-[var(--texto-2)]">{c.centroCusto}</span>,
    },
    {
      chave: 'tipoContrato',
      titulo: 'Contrato',
      largura: '7rem',
      valor: (c) => c.tipoContrato,
      render: (c) => <span className="font-mono text-2xs uppercase tracking-wide text-[var(--texto-2)]">{ROTULO_CONTRATO[c.tipoContrato]}</span>,
    },
    {
      chave: 'salarioBase',
      titulo: 'Salário',
      alinhar: 'direita',
      valor: (c) => (c.tipoContrato === 'INTERMITENTE' ? (c.salarioHora ?? 0) : c.salarioBase),
      render: (c) =>
        c.tipoContrato === 'INTERMITENTE' ? (
          <span title="Valor por hora">
            {formatarBRL(c.salarioHora ?? 0)}
            <span className="ml-0.5 text-2xs text-[var(--texto-3)]">/h</span>
          </span>
        ) : (
          formatarBRL(c.salarioBase)
        ),
    },
    {
      chave: 'admissao',
      titulo: 'Admissão',
      largura: '7rem',
      alinhar: 'direita',
      valor: (c) => c.admissao,
      render: (c) => <span className="font-mono text-xs">{formatarDataBR(c.admissao)}</span>,
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '8rem',
      valor: (c) => c.situacao,
      render: (c) => <Badge tom={TOM_SITUACAO[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Badge>,
    },
  ];

  function aoFiltrar<T>(definir: (v: T) => void) {
    return (valor: T): void => {
      definir(valor);
      setPagina(1);
    };
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha="Cadastro"
        titulo="Colaboradores"
        descricao={total > 0 ? `${total} registro(s) no filtro atual.` : 'Quadro de pessoal do restaurante.'}
        acoes={
          pode('colaboradores:criar') ? (
            <Link to="/colaboradores/novo" className="botao-primario">
              <IconeMais /> Novo colaborador
            </Link>
          ) : null
        }
      />

      <Tabela
        colunas={colunas}
        dados={itens}
        chaveLinha={(c) => c.id}
        carregando={lista.carregando}
        erro={lista.erro}
        legenda="Lista de colaboradores"
        aoClicarLinha={(c) => navegar(`/colaboradores/${c.id}`)}
        classeLinha={(c) => (c.situacao === 'DEMITIDO' ? 'opacity-60' : '')}
        vazio={
          <EstadoVazio
            icone={<IconePessoas />}
            titulo={busca || situacao || centroCusto || tipoContrato ? 'Nenhum colaborador neste filtro' : 'Nenhum colaborador cadastrado'}
            descricao={
              busca || situacao || centroCusto || tipoContrato
                ? 'Limpe os filtros para ver o quadro completo.'
                : 'Cadastre o primeiro colaborador para comecar a rodar a folha.'
            }
            acao={
              pode('colaboradores:criar') ? (
                <Link to="/colaboradores/novo" className="botao-primario">
                  <IconeMais /> Novo colaborador
                </Link>
              ) : null
            }
          />
        }
        filtros={
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <label className="min-w-[11rem] flex-1 sm:max-w-[16rem]">
              <span className="sr-only">Buscar por nome, matricula ou CPF</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => aoFiltrar(setBusca)(e.target.value)}
                placeholder="Nome, matricula ou CPF"
                className="campo"
              />
            </label>
            <label>
              <span className="sr-only">Situação</span>
              <select value={situacao} onChange={(e) => aoFiltrar(setSituacao)(e.target.value as Situacao | '')} className="campo w-auto">
                <option value="">Todas as situações</option>
                {SITUACOES.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Centro de custo</span>
              <select value={centroCusto} onChange={(e) => aoFiltrar(setCentroCusto)(e.target.value)} className="campo w-auto">
                <option value="">Todos os centros de custo</option>
                {centros.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Tipo de contrato</span>
              <select
                value={tipoContrato}
                onChange={(e) => aoFiltrar(setTipoContrato)(e.target.value as TipoContrato | '')}
                className="campo w-auto"
              >
                <option value="">Todos os contratos</option>
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_CONTRATO[t]}
                  </option>
                ))}
              </select>
            </label>
            {busca || situacao || centroCusto || tipoContrato ? (
              <button
                type="button"
                className="botao-fantasma"
                onClick={() => {
                  setBusca('');
                  setSituacao('');
                  setCentroCusto('');
                  setTipoContrato('');
                  setPagina(1);
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        }
      />

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginacao">
          <button type="button" className="botao-secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span className="num text-[var(--texto-3)]">
            Pagina {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            className="botao-secundario"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Proxima
          </button>
        </nav>
      ) : null}
    </div>
  );
}
