import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatarBRL, rotuloCompetencia, type Alerta as AlertaDominio } from '@rhmacaw/shared';
import * as apiRelatorios from '../api/relatorios.js';
import { Alerta } from '../componentes/Alerta.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { Carregando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { Figura, GraficoBarras, GraficoLinhas } from '../componentes/Graficos.js';
import { Badge } from '../componentes/Badge.js';
import { IconeAtencao, IconeBanco, IconeCritico, IconeInfo, IconePessoas, IconeSeta } from '../componentes/Icones.js';
import { useCompetencia } from '../contextos/CompetenciaContext.js';
import { useRequisicao } from '../ganchos/useRequisicao.js';
import { deslocarCompetencia, formatarNumero } from '../util/formato.js';
import { ROTULO_STATUS_FOLHA, TOM_STATUS_FOLHA , ROTULO_NIVEL_ALERTA} from '../util/rotulos.js';

const MESES_HISTORICO = 6;

function nivelParaAlerta(nivel: AlertaDominio['nivel']): 'info' | 'atencao' | 'critico' {
  if (nivel === 'CRITICO') return 'critico';
  if (nivel === 'ATENCAO') return 'atencao';
  return 'info';
}

function iconeNivel(nivel: AlertaDominio['nivel']): JSX.Element {
  if (nivel === 'CRITICO') return <IconeCritico className="text-critico" />;
  if (nivel === 'ATENCAO') return <IconeAtencao className="text-[#b98505] dark:text-aviso" />;
  return <IconeInfo className="text-arara-600 dark:text-arara-300" />;
}

export function Dashboard(): JSX.Element {
  const { competencia, definir } = useCompetencia();
  const navegar = useNavigate();

  const resumo = useRequisicao(() => apiRelatorios.dashboard(competencia), [competencia]);

  // Evolução mensal: uma unica chamada a `/relatórios/evolucao-folha`, que ja
  // devolve a serie de 12 meses com zero nos meses sem folha. Antes o painel
  // disparava uma requisicao por mês e engolia os 404 num try/catch.
  const historico = useRequisicao(
    async () => {
      const serie = await apiRelatorios.evolucaoFolha(competencia);
      return serie.slice(-MESES_HISTORICO);
    },
    [competencia],
  );

  const dados = resumo.dados;

  const dadosGraficoCentro = useMemo(
    () => (dados?.porCentroCusto ?? []).map((c) => ({ rotulo: c.centroCusto, valor: c.custo, detalhe: `${c.colaboradores} colab.` })),
    [dados],
  );

  const dadosGraficoEvolucao = useMemo(
    () => (historico.dados ?? []).map((p) => ({ rotulo: rotuloCompetencia(p.competencia).slice(0, 3), custo: p.custo })),
    [historico.dados],
  );

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        sobrancelha={rotuloCompetencia(competencia)}
        titulo="Painel do mês"
        descricao="Como está a folha, o que já foi pago e o que ainda precisa sair da conta."
        acoes={
          dados ? (
            <Badge tom={dados.folhaStatus === 'NAO_INICIADA' ? 'neutro' : TOM_STATUS_FOLHA[dados.folhaStatus]}>
              Folha {dados.folhaStatus === 'NAO_INICIADA' ? 'não iniciada' : ROTULO_STATUS_FOLHA[dados.folhaStatus]}
            </Badge>
          ) : null
        }
      />

      {resumo.erro ? (
        <Alerta
          nivel="critico"
          titulo="Não foi possível carregar o painel"
          acao={
            <button type="button" onClick={resumo.recarregar} className="botao-secundario">
              Tentar de novo
            </button>
          }
        >
          {resumo.erro}
        </Alerta>
      ) : null}

      {resumo.carregando && !dados ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cartão p-3.5">
              <Carregando linhas={2} />
            </div>
          ))}
        </div>
      ) : null}

      {dados ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Indicador
              rotulo="Colaboradores ativos"
              valor={formatarNumero(dados.colaboradoresAtivos, 0)}
              apoio={`${dados.admissoesNoMes} admissões e ${dados.demissoesNoMes} demissões no mês`}
              para="/colaboradores"
              icone={<IconePessoas />}
            />
            <Indicador
              rotulo="Em férias"
              valor={formatarNumero(dados.emFerias, 0)}
              apoio={`${dados.feriasVencendo} períodos vencendo nos próximos 90 dias`}
              para="/ferias"
            />
            <Indicador
              rotulo="Faltas no mês"
              valor={formatarNumero(dados.faltasNoMes, 0)}
              apoio="Dias descontáveis lançados na competência"
              para="/faltas"
            />
            <Indicador
              rotulo="Custo da folha"
              valor={formatarBRL(dados.custoFolha)}
              apoio={`Proventos do mês em ${dados.porCentroCusto.length} centros de custo`}
              para="/folha"
            />
            <Indicador
              rotulo="Comissões da semana"
              valor={formatarBRL(dados.totalComissoesSemana)}
              apoio="Já adiantado aos colaboradores"
              para="/comissoes"
            />
            <Indicador
              rotulo="Total a transferir"
              valor={formatarBRL(dados.totalTransferir)}
              apoio={
                dados.remessasPendentes > 0
                  ? `${dados.remessasPendentes} remessa(s) aguardando envio ao banco`
                  : 'Líquido menos o que já foi adiantado'
              }
              trilho
              para="/banco"
              icone={<IconeBanco />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Figura
              titulo="Custo por centro de custo"
              descricao={`Proventos de ${rotuloCompetencia(competencia)} rateados entre as unidades.`}
              tabela={
                <table className="w-full text-sm">
                  <caption className="sr-only">Custo por centro de custo</caption>
                  <thead>
                    <tr className="border-b border-[var(--borda)] text-left">
                      <th className="py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Centro de custo</th>
                      <th className="py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Colab.</th>
                      <th className="py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.porCentroCusto.map((c) => (
                      <tr key={c.centroCusto} className="border-b border-[var(--borda)] last:border-0">
                        <td className="py-1.5">{c.centroCusto}</td>
                        <td className="num py-1.5 text-right tabular-nums">{c.colaboradores}</td>
                        <td className="num py-1.5 text-right font-semibold tabular-nums">{formatarBRL(c.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              {dadosGraficoCentro.length === 0 ? (
                <EstadoVazio titulo="Sem custo apurado" descricao="Processe a folha desta competência para ver o rateio." />
              ) : (
                <GraficoBarras dados={dadosGraficoCentro} altura={Math.max(160, dadosGraficoCentro.length * 54)} />
              )}
            </Figura>

            <Figura
              titulo="Evolução do custo mensal"
              descricao={`Últimos ${MESES_HISTORICO} meses de custo total de folha.`}
              tabela={
                <table className="w-full text-sm">
                  <caption className="sr-only">Custo de folha por mês</caption>
                  <tbody>
                    {(historico.dados ?? []).map((p) => (
                      <tr key={p.competencia} className="border-b border-[var(--borda)] last:border-0">
                        <td className="py-1.5">{rotuloCompetencia(p.competencia)}</td>
                        <td className="num py-1.5 text-right font-semibold tabular-nums">{formatarBRL(p.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              {historico.carregando ? (
                <Carregando linhas={4} />
              ) : dadosGraficoEvolucao.length === 0 ? (
                <EstadoVazio titulo="Sem histórico" descricao="Ainda não ha folhas processadas nos meses anteriores." />
              ) : (
                <GraficoLinhas dados={dadosGraficoEvolucao} series={[{ chave: 'custo', nome: 'Custo da folha' }]} />
              )}
            </Figura>
          </div>

          <section className="cartão overflow-hidden">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
              <h2 className="sobrancelha">Alertas a resolver</h2>
              <span className="text-2xs text-[var(--texto-3)]">{dados.alertas.length} item(ns)</span>
            </header>
            {dados.alertas.length === 0 ? (
              <EstadoVazio titulo="Nada pendente" descricao="Nenhum alerta aberto para esta competencia." />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {dados.alertas.map((alerta, i) => {
                  const clicavel = Boolean(alerta.acao);
                  return (
                    <li key={`${alerta.titulo}-${i}`}>
                      <button
                        type="button"
                        disabled={!clicavel}
                        onClick={() => {
                          if (alerta.acao) navegar(alerta.acao);
                        }}
                        className={`flex w-full items-start gap-3 px-3 py-2.5 text-left ${
                          clicavel ? 'hover:bg-[var(--superficie-sutil)]' : 'cursor-default'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-base">{iconeNivel(alerta.nivel)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{alerta.titulo}</span>
                            <Badge tom={nivelParaAlerta(alerta.nivel) === 'critico' ? 'critico' : nivelParaAlerta(alerta.nivel) === 'atencao' ? 'atencao' : 'info'}>
                              {ROTULO_NIVEL_ALERTA[alerta.nivel]}
                            </Badge>
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--texto-3)]">{alerta.detalhe}</span>
                        </span>
                        {clicavel ? <IconeSeta className="mt-1 shrink-0 text-[var(--texto-3)]" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--texto-3)]">Atalhos:</span>
            <Link to="/comissoes" className="botao-secundario">
              Fechar semana de comissão
            </Link>
            <Link to="/folha" className="botao-secundario">
              Processar folha de {rotuloCompetencia(competencia)}
            </Link>
            <Link to="/banco" className="botao-trilho">
              <IconeBanco /> Gerar pagamento no banco
            </Link>
            <button type="button" className="botao-fantasma" onClick={() => definir(deslocarCompetencia(competencia, -1))}>
              Ver mês anterior
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
