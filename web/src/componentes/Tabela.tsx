import { useMemo, useState, type ReactNode } from 'react';
import { Alerta } from './Alerta.js';
import { Carregando } from './Carregando.js';
import { EstadoVazio } from './EstadoVazio.js';
import { IconeBusca, IconeChevron } from './Icones.js';

export type Alinhamento = 'esquerda' | 'direita' | 'centro';

export interface Coluna<T> {
  chave: string;
  titulo: ReactNode;
  /** Valor usado para ordenar e para a busca livre. */
  valor?: (linha: T) => string | number | null | undefined;
  render?: (linha: T) => ReactNode;
  alinhar?: Alinhamento;
  largura?: string;
  ordenavel?: boolean;
  /** Classe extra nas celulas — usada para marcar a coluna do trilho de pagamento. */
  classe?: string;
  classeCabecalho?: string;
  /** Celula de totais no rodape da tabela. */
  rodape?: ReactNode;
  titulo2?: string;
}

export interface PropsTabela<T> {
  colunas: Coluna<T>[];
  dados: T[];
  chaveLinha: (linha: T) => string;
  carregando?: boolean;
  erro?: string | null;
  vazio?: ReactNode;
  busca?: boolean;
  placeholderBusca?: string;
  aoClicarLinha?: (linha: T) => void;
  classeLinha?: (linha: T) => string;
  ordemInicial?: { chave: string; direcao: 'asc' | 'desc' };
  /** Agrupa as linhas e emite um rodape por grupo (subtotais por centro de custo). */
  agruparPor?: (linha: T) => string;
  rodapeGrupo?: (grupo: string, linhas: T[]) => ReactNode;
  comRodape?: boolean;
  filtros?: ReactNode;
  acoes?: ReactNode;
  legenda?: string;
  denso?: boolean;
  alturaMaxima?: string;
}

const ALINHAR: Record<Alinhamento, string> = {
  esquerda: 'text-left',
  direita: 'text-right num tabular-nums',
  centro: 'text-center',
};

function textoDe(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

export function Tabela<T>({
  colunas,
  dados,
  chaveLinha,
  carregando = false,
  erro = null,
  vazio,
  busca = false,
  placeholderBusca = 'Buscar…',
  aoClicarLinha,
  classeLinha,
  ordemInicial,
  agruparPor,
  rodapeGrupo,
  comRodape = false,
  filtros,
  acoes,
  legenda,
  denso = false,
  alturaMaxima,
}: PropsTabela<T>): JSX.Element {
  const [termo, setTermo] = useState('');
  const [ordem, setOrdem] = useState<{ chave: string; direcao: 'asc' | 'desc' } | null>(ordemInicial ?? null);

  const filtrados = useMemo(() => {
    const alvo = termo.trim().toLowerCase();
    if (!alvo) return dados;
    return dados.filter((linha) =>
      colunas.some((coluna) => {
        if (!coluna.valor) return false;
        return textoDe(coluna.valor(linha)).toLowerCase().includes(alvo);
      }),
    );
  }, [dados, colunas, termo]);

  const ordenados = useMemo(() => {
    if (!ordem) return filtrados;
    const coluna = colunas.find((c) => c.chave === ordem.chave);
    if (!coluna?.valor) return filtrados;
    const extrair = coluna.valor;
    const sentido = ordem.direcao === 'asc' ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = extrair(a);
      const vb = extrair(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sentido;
      return textoDe(va).localeCompare(textoDe(vb), 'pt-BR', { numeric: true }) * sentido;
    });
  }, [filtrados, ordem, colunas]);

  const grupos = useMemo(() => {
    if (!agruparPor) return null;
    const mapa = new Map<string, T[]>();
    for (const linha of ordenados) {
      const chave = agruparPor(linha);
      const atual = mapa.get(chave);
      if (atual) atual.push(linha);
      else mapa.set(chave, [linha]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [ordenados, agruparPor]);

  function alternarOrdem(chave: string): void {
    setOrdem((atual) => {
      if (!atual || atual.chave !== chave) return { chave, direcao: 'asc' };
      if (atual.direcao === 'asc') return { chave, direcao: 'desc' };
      return null;
    });
  }

  const paddingCelula = denso ? 'px-2.5 py-1.5' : 'px-3 py-2';

  const cabecalho = (
    <thead className="sticky top-0 z-10 bg-[var(--superficie-sutil)]">
      <tr className="border-b border-[var(--borda-forte)]">
        {colunas.map((coluna) => {
          const alinhar = ALINHAR[coluna.alinhar ?? 'esquerda'];
          const ordenavel = coluna.ordenavel !== false && Boolean(coluna.valor);
          const ativa = ordem?.chave === coluna.chave;
          return (
            <th
              key={coluna.chave}
              scope="col"
              style={coluna.largura ? { width: coluna.largura } : undefined}
              className={`${paddingCelula} ${alinhar} font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--texto-3)] ${coluna.classeCabecalho ?? ''} ${coluna.classe ?? ''}`}
              aria-sort={ativa ? (ordem?.direcao === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              {ordenavel ? (
                <button
                  type="button"
                  onClick={() => alternarOrdem(coluna.chave)}
                  title={coluna.titulo2}
                  className={`inline-flex items-center gap-1 hover:text-[var(--texto)] ${coluna.alinhar === 'direita' ? 'flex-row-reverse' : ''} ${ativa ? 'text-[var(--texto)]' : ''}`}
                >
                  {coluna.titulo}
                  <IconeChevron
                    className={`transition-transform ${ativa ? 'opacity-100' : 'opacity-25'} ${ativa && ordem?.direcao === 'asc' ? 'rotate-180' : ''}`}
                    width="0.85em"
                    height="0.85em"
                  />
                </button>
              ) : (
                <span title={coluna.titulo2}>{coluna.titulo}</span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );

  function renderLinha(linha: T): JSX.Element {
    const clicavel = Boolean(aoClicarLinha);
    return (
      <tr
        key={chaveLinha(linha)}
        onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
        onKeyDown={
          aoClicarLinha
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  aoClicarLinha(linha);
                }
              }
            : undefined
        }
        tabIndex={clicavel ? 0 : undefined}
        className={`border-b border-[var(--borda)] last:border-0 transition-colors hover:bg-[var(--superficie-sutil)] ${
          clicavel ? 'cursor-pointer' : ''
        } ${classeLinha?.(linha) ?? ''}`}
      >
        {colunas.map((coluna) => (
          <td
            key={coluna.chave}
            className={`${paddingCelula} ${ALINHAR[coluna.alinhar ?? 'esquerda']} align-middle ${coluna.classe ?? ''}`}
          >
            {coluna.render ? coluna.render(linha) : textoDe(coluna.valor?.(linha))}
          </td>
        ))}
      </tr>
    );
  }

  const temControles = busca || filtros || acoes;

  return (
    <div className="cartao overflow-hidden">
      {temControles ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
          {busca ? (
            <label className="relative flex-1 min-w-[12rem] max-w-xs">
              <span className="sr-only">{placeholderBusca}</span>
              <IconeBusca className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--texto-3)]" />
              <input
                type="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={placeholderBusca}
                className="campo pl-8"
              />
            </label>
          ) : null}
          {filtros}
          {acoes ? <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </div>
      ) : null}

      {erro ? (
        <div className="p-3">
          <Alerta nivel="critico" titulo="Nao foi possivel carregar os dados">
            {erro}
          </Alerta>
        </div>
      ) : carregando ? (
        <div className="p-3">
          <Carregando linhas={6} />
        </div>
      ) : ordenados.length === 0 ? (
        vazio ?? (
          <EstadoVazio
            titulo={termo ? 'Nenhum resultado para esta busca' : 'Nada por aqui ainda'}
            descricao={termo ? 'Ajuste o termo buscado ou limpe o filtro.' : undefined}
          />
        )
      ) : (
        <div className={`tabela-rolagem rolagem-fina ${alturaMaxima ? 'overflow-y-auto' : ''}`} style={alturaMaxima ? { maxHeight: alturaMaxima } : undefined}>
          <table className="w-full min-w-full border-collapse text-sm">
            {legenda ? <caption className="sr-only">{legenda}</caption> : null}
            {cabecalho}
            {grupos ? (
              grupos.map(([nomeGrupo, linhas]) => (
                <tbody key={nomeGrupo}>
                  <tr className="bg-[var(--superficie-sutil)]">
                    <td colSpan={colunas.length} className="px-3 py-1.5">
                      <span className="sobrancelha text-[var(--texto-2)]">{nomeGrupo}</span>
                      <span className="ml-2 text-2xs text-[var(--texto-3)]">
                        {linhas.length} {linhas.length === 1 ? 'colaborador' : 'colaboradores'}
                      </span>
                    </td>
                  </tr>
                  {linhas.map(renderLinha)}
                  {rodapeGrupo ? rodapeGrupo(nomeGrupo, linhas) : null}
                </tbody>
              ))
            ) : (
              <tbody>{ordenados.map(renderLinha)}</tbody>
            )}
            {comRodape ? (
              <tfoot className="sticky bottom-0 bg-[var(--superficie-alta)]">
                <tr className="border-t-2 border-[var(--borda-forte)] font-semibold">
                  {colunas.map((coluna) => (
                    <td
                      key={coluna.chave}
                      className={`${paddingCelula} ${ALINHAR[coluna.alinhar ?? 'esquerda']} ${coluna.classe ?? ''}`}
                    >
                      {coluna.rodape}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  );
}
