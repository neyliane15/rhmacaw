import { useEffect, useMemo, useState } from 'react';
import {
  CRITERIOS_RATEIO,
  formatarBRL,
  formatarDataBR,
  hojeISO,
  intervaloDaSemanaISO,
  ratearComissoes,
  rotuloCompetencia,
  semanaISO,
  type CriterioRateio,
  type PeriodoComissaoDetalhado,
} from '@rhmacaw/shared';
import * as apiComissoes from '../api/comissoes.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoSelect, CampoTexto } from '../componentes/Campo.js';
import { Carregando, Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeBanco, IconeMoedas, IconeRaio } from '../componentes/Icones.js';
import { ModalRemessa } from '../componentes/ModalRemessa.js';
import { MoedaInput } from '../componentes/MoedaInput.js';
import { SeletorSemana } from '../componentes/SeletorSemana.js';
import { TrilhoPagamento } from '../componentes/TrilhoPagamento.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero } from '../util/formato.js';
import { DESCRICAO_CRITERIO, ROTULO_CRITERIO, ROTULO_STATUS_PERIODO, TOM_STATUS_PERIODO } from '../util/rotulos.js';

interface LinhaEditavel {
  colaboradorId: string;
  nome: string;
  funcao: string;
  centroCusto: string;
  pontos: number;
  horas: number;
  ajuste: number;
  valorManual: number;
}

export function Comissoes(): JSX.Element {
  const { pode } = useAuth();
  const podeEditar = pode('comissoes:editar');
  const podeBanco = pode('banco:gerar');
  const inicial = semanaISO(hojeISO());

  const [ano, setAno] = useState(inicial.ano);
  const [semana, setSemana] = useState(inicial.semana);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [valorArrecadado, setValorArrecadado] = useState(0);
  const [percentualRetencao, setPercentualRetencao] = useState(0);
  const [criterio, setCriterio] = useState<CriterioRateio>('PONTOS');
  const [abrindoRemessa, setAbrindoRemessa] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const acao = useAcao();

  const periodos = useRequisicao(() => apiComissoes.listarPeriodos({ ano }), [ano]);
  const periodoDaSemana = useMemo(() => (periodos.dados ?? []).find((p) => p.semana === semana), [periodos.dados, semana]);

  const detalhe = useRequisicao(
    () => apiComissoes.obterPeriodo(periodoDaSemana?.id as string),
    [periodoDaSemana?.id],
    Boolean(periodoDaSemana?.id),
  );

  // Carrega os parametros e a grade a partir do periodo vindo da API.
  useEffect(() => {
    const dados = detalhe.dados;
    if (!dados) return;
    setValorArrecadado(dados.valorArrecadado);
    setPercentualRetencao(dados.percentualRetencao);
    setCriterio(dados.criterioRateio);
    setLinhas(
      dados.lancamentos.map((l) => ({
        colaboradorId: l.colaboradorId,
        nome: l.colaboradorNome,
        funcao: l.funcao,
        centroCusto: l.centroCusto,
        pontos: l.pontos,
        horas: l.horas,
        ajuste: l.ajuste,
        valorManual: l.valor,
      })),
    );
  }, [detalhe.dados]);

  // Recalculo ao vivo: mostra o efeito de cada digito antes de gravar.
  const previa = useMemo(
    () =>
      ratearComissoes({
        valorArrecadado,
        percentualRetencao,
        criterio,
        participantes: linhas.map((l) => ({
          colaboradorId: l.colaboradorId,
          nome: l.nome,
          pontos: l.pontos,
          horas: l.horas,
          ajuste: l.ajuste,
          valorManual: l.valorManual,
        })),
      }),
    [valorArrecadado, percentualRetencao, criterio, linhas],
  );

  const valorPorId = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const linha of previa.linhas) mapa.set(linha.colaboradorId, linha.valor);
    return mapa;
  }, [previa.linhas]);

  const periodo: PeriodoComissaoDetalhado | null = detalhe.dados;
  const aberto = periodo?.status === 'ABERTO';
  const { inicio, fim } = intervaloDaSemanaISO(ano, semana);

  function alterarLinha(id: string, campo: 'pontos' | 'horas' | 'ajuste' | 'valorManual', valor: number): void {
    setLinhas((atual) => atual.map((l) => (l.colaboradorId === id ? { ...l, [campo]: valor } : l)));
  }

  async function criarPeriodo(): Promise<void> {
    const criado = await acao.executar(() =>
      apiComissoes.criarPeriodo({ ano, semana, valorArrecadado, percentualRetencao, criterioRateio: criterio }),
    );
    if (criado) {
      periodos.recarregar();
      detalhe.definir(criado);
    }
  }

  async function aplicarParametros(): Promise<void> {
    if (!periodo) return;
    // A semana ja existe: `POST /periodos` devolveria 409. Quem altera valor
    // arrecadado, retencao e criterio de um periodo aberto e o PUT.
    const atualizado = await acao.executar(() =>
      apiComissoes.atualizarPeriodo(periodo.id, { valorArrecadado, percentualRetencao, criterioRateio: criterio }),
    );
    if (atualizado) {
      detalhe.definir(atualizado);
      setAviso('Parametros da semana atualizados. Clique em "Ratear" para redistribuir.');
    }
  }

  async function ratearEntreAtivos(): Promise<void> {
    if (!periodo) return;
    const atualizado = await acao.executar(() => apiComissoes.ratear(periodo.id));
    if (atualizado) {
      detalhe.definir(atualizado);
      setAviso('Rateio recalculado com os colaboradores ativos da semana.');
    }
  }

  async function salvarLancamentos(): Promise<void> {
    if (!periodo) return;
    const atualizado = await acao.executar(() =>
      apiComissoes.salvarLancamentos(
        periodo.id,
        linhas.map((l) => ({
          colaboradorId: l.colaboradorId,
          pontos: l.pontos,
          horas: l.horas,
          ajuste: l.ajuste,
          ...(criterio === 'MANUAL' ? { valorManual: l.valorManual } : {}),
        })),
      ),
    );
    if (atualizado) {
      detalhe.definir(atualizado);
      setAviso('Lancamentos gravados.');
    }
  }

  async function fecharSemana(): Promise<void> {
    if (!periodo) return;
    const atualizado = await acao.executar(() => apiComissoes.fechar(periodo.id));
    if (atualizado) {
      detalhe.definir(atualizado);
      periodos.recarregar();
      setAviso('Semana fechada. Agora ela pode virar pagamento no banco.');
    }
  }

  async function reabrirSemana(): Promise<void> {
    if (!periodo) return;
    const atualizado = await acao.executar(() => apiComissoes.reabrir(periodo.id));
    if (atualizado) {
      detalhe.definir(atualizado);
      periodos.recarregar();
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha={`Semana ${String(semana).padStart(2, '0')} de ${ano} · ${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`}
        titulo="Comissoes da semana"
        descricao="Arrecadacao da casa rateada entre a equipe e adiantada antes do fechamento da folha."
        acoes={
          <>
            <SeletorSemana ano={ano} semana={semana} aoMudar={(a, s) => { setAno(a); setSemana(s); setAviso(null); }} />
            {periodo ? <Badge tom={TOM_STATUS_PERIODO[periodo.status]}>{ROTULO_STATUS_PERIODO[periodo.status]}</Badge> : null}
          </>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Operacao recusada" aoFechar={acao.limparErro}>{acao.erro}</Alerta> : null}
      {aviso ? <Alerta nivel="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta> : null}

      {periodos.erro ? (
        <Alerta nivel="critico" titulo="Nao foi possivel carregar as semanas">
          {periodos.erro}
        </Alerta>
      ) : null}

      {periodos.carregando ? (
        <div className="cartao p-4">
          <Carregando linhas={5} />
        </div>
      ) : !periodoDaSemana ? (
        <section className="cartao p-4">
          <EstadoVazio
            icone={<IconeMoedas />}
            titulo={`Semana ${String(semana).padStart(2, '0')} ainda nao foi aberta`}
            descricao="Informe a arrecadacao da semana e o criterio de rateio para abrir o periodo."
          />
          <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-3">
            <MoedaInput rotulo="Valor arrecadado na semana" valor={valorArrecadado} aoMudar={setValorArrecadado} />
            <CampoTexto
              rotulo="Retencao da casa (%)"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={percentualRetencao}
              onChange={(e) => setPercentualRetencao(Number(e.target.value))}
            />
            <CampoSelect
              rotulo="Criterio de rateio"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value as CriterioRateio)}
              opcoes={CRITERIOS_RATEIO.map((c) => ({ valor: c, rotulo: ROTULO_CRITERIO[c] }))}
              dica={DESCRICAO_CRITERIO[criterio]}
              className="sm:col-span-3"
            />
          </div>
          <div className="mt-4 flex justify-center">
            <button type="button" className="botao-primario" onClick={criarPeriodo} disabled={!podeEditar || acao.executando || valorArrecadado <= 0}>
              {acao.executando ? <Girando rotulo="Abrindo" /> : 'Abrir semana e ratear'}
            </button>
          </div>
        </section>
      ) : detalhe.carregando && !periodo ? (
        <div className="cartao p-4">
          <Carregando linhas={6} />
        </div>
      ) : periodo ? (
        <>
          {periodo.status !== 'ABERTO' ? (
            <TrilhoPagamento etapa={periodo.status === 'PAGO' ? 'gerada' : 'origem'} compacto />
          ) : null}

          <section className="cartao p-4">
            <h2 className="sobrancelha mb-3">Parametros da semana</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MoedaInput
                rotulo="Valor arrecadado"
                valor={valorArrecadado}
                aoMudar={setValorArrecadado}
                desabilitado={!aberto || !podeEditar}
              />
              <CampoTexto
                rotulo="Retencao da casa (%)"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={percentualRetencao}
                disabled={!aberto || !podeEditar}
                onChange={(e) => setPercentualRetencao(Number(e.target.value))}
                dica={`Retido: ${formatarBRL(previa.valorRetido)}`}
              />
              <CampoSelect
                rotulo="Criterio de rateio"
                value={criterio}
                disabled={!aberto || !podeEditar}
                onChange={(e) => setCriterio(e.target.value as CriterioRateio)}
                opcoes={CRITERIOS_RATEIO.map((c) => ({ valor: c, rotulo: ROTULO_CRITERIO[c] }))}
                dica={DESCRICAO_CRITERIO[criterio]}
              />
              <div className="flex items-end gap-2">
                <button type="button" className="botao-secundario" onClick={aplicarParametros} disabled={!aberto || !podeEditar || acao.executando}>
                  Aplicar parametros
                </button>
                <button type="button" className="botao-secundario" onClick={ratearEntreAtivos} disabled={!aberto || !podeEditar || acao.executando} title="Refaz a grade com os colaboradores ativos na semana">
                  <IconeRaio /> Ratear
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--texto-3)]">
              Competencia da folha que absorve esta semana: <strong>{rotuloCompetencia(periodo.competencia)}</strong>.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador rotulo="Arrecadado" valor={formatarBRL(previa.valorArrecadado)} />
            <Indicador rotulo="Retido pela casa" valor={formatarBRL(previa.valorRetido)} apoio={`${formatarNumero(percentualRetencao, 1)}% da arrecadacao`} />
            <Indicador rotulo="Distribuivel" valor={formatarBRL(previa.valorDistribuivel)} apoio={`${linhas.length} participante(s)`} />
            <Indicador
              rotulo="Total distribuido"
              valor={formatarBRL(previa.totalDistribuido)}
              apoio={
                Math.abs(previa.valorDistribuivel - previa.totalDistribuido) > 0.005
                  ? `Diferenca de ${formatarBRL(previa.valorDistribuivel - previa.totalDistribuido)}`
                  : 'Bate com o distribuivel'
              }
              trilho
            />
          </div>

          {previa.alertas.map((texto) => (
            <Alerta key={texto} nivel="atencao">
              {texto}
            </Alerta>
          ))}

          <section className="cartao overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 border-b border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
              <h2 className="sobrancelha">Grade de participantes</h2>
              <span className="text-2xs text-[var(--texto-3)]">
                {aberto ? 'Os valores recalculam enquanto voce digita.' : 'Semana fechada — grade somente leitura.'}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {aberto ? (
                  <>
                    <button type="button" className="botao-secundario" onClick={salvarLancamentos} disabled={!podeEditar || acao.executando}>
                      {acao.executando ? <Girando rotulo="Gravando" /> : 'Salvar lancamentos'}
                    </button>
                    <button type="button" className="botao-primario" onClick={fecharSemana} disabled={!podeEditar || acao.executando || linhas.length === 0}>
                      Fechar semana
                    </button>
                  </>
                ) : periodo.status === 'FECHADO' ? (
                  <>
                    <button type="button" className="botao-secundario" onClick={reabrirSemana} disabled={!podeEditar || acao.executando}>
                      Reabrir
                    </button>
                    <button type="button" className="botao-trilho" onClick={() => setAbrindoRemessa(true)} disabled={!podeBanco}>
                      <IconeBanco /> Gerar pagamento no banco
                    </button>
                  </>
                ) : (
                  <Badge tom="positivo">Pago — periodo imutavel</Badge>
                )}
              </div>
            </header>

            {linhas.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum participante na semana"
                descricao="Use o botao Ratear para trazer os colaboradores ativos com pontos de comissao."
                acao={
                  aberto ? (
                    <button type="button" className="botao-primario" onClick={ratearEntreAtivos} disabled={!podeEditar}>
                      <IconeRaio /> Ratear entre os ativos
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="tabela-rolagem rolagem-fina">
                <table className="w-full text-sm">
                  <caption className="sr-only">Participantes do rateio semanal</caption>
                  <thead className="bg-[var(--superficie-sutil)]">
                    <tr className="border-b border-[var(--borda-forte)] text-left">
                      <th className="px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Colaborador</th>
                      <th className="px-3 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Centro de custo</th>
                      <th className="w-24 px-3 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Pontos</th>
                      <th className="w-24 px-3 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Horas</th>
                      <th className="w-36 px-3 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Ajuste</th>
                      <th className="w-36 px-3 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">
                        {criterio === 'MANUAL' ? 'Valor (manual)' : 'Valor'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha) => (
                      <tr key={linha.colaboradorId} className="border-b border-[var(--borda)] last:border-0">
                        <td className="px-3 py-1.5">
                          <p className="font-medium">{linha.nome}</p>
                          <p className="text-2xs text-[var(--texto-3)]">{linha.funcao}</p>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-[var(--texto-3)]">{linha.centroCusto}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            disabled={!aberto || !podeEditar}
                            value={linha.pontos}
                            onChange={(e) => alterarLinha(linha.colaboradorId, 'pontos', Number(e.target.value))}
                            aria-label={`Pontos de ${linha.nome}`}
                            className="campo num px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            disabled={!aberto || !podeEditar}
                            value={linha.horas}
                            onChange={(e) => alterarLinha(linha.colaboradorId, 'horas', Number(e.target.value))}
                            aria-label={`Horas de ${linha.nome}`}
                            className="campo num px-2 py-1 text-right text-sm"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <MoedaInput
                            valor={linha.ajuste}
                            aoMudar={(v) => alterarLinha(linha.colaboradorId, 'ajuste', v)}
                            desabilitado={!aberto || !podeEditar}
                            emGrade
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          {criterio === 'MANUAL' ? (
                            <MoedaInput
                              valor={linha.valorManual}
                              aoMudar={(v) => alterarLinha(linha.colaboradorId, 'valorManual', v)}
                              desabilitado={!aberto || !podeEditar}
                              emGrade
                            />
                          ) : (
                            <span className="num block py-1 text-right font-semibold tabular-nums">
                              {formatarBRL(valorPorId.get(linha.colaboradorId) ?? 0)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[var(--superficie-alta)] font-semibold">
                    <tr className="border-t-2 border-[var(--borda-forte)]">
                      <td className="px-3 py-2" colSpan={2}>
                        Total da semana
                      </td>
                      <td className="num px-3 py-2 text-right tabular-nums">{formatarNumero(linhas.reduce((s, l) => s + l.pontos, 0), 1)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums">{formatarNumero(linhas.reduce((s, l) => s + l.horas, 0), 1)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums">{formatarBRL(linhas.reduce((s, l) => s + l.ajuste, 0))}</td>
                      <td className="num trilho px-3 py-2 text-right tabular-nums text-ouro-600 dark:text-ouro-200">
                        {formatarBRL(previa.totalDistribuido)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {abrindoRemessa ? (
            <ModalRemessa
              aberto
              aoFechar={() => setAbrindoRemessa(false)}
              origem="COMISSAO_SEMANAL"
              origemId={periodo.id}
              descricao={`Semana ${String(periodo.semana).padStart(2, '0')}/${periodo.ano} · ${formatarBRL(previa.totalDistribuido)}`}
              dataSugerida={periodo.dataFim}
              gerar={(dados) => apiComissoes.gerarRemessa(periodo.id, dados)}
              aoGerar={() => {
                detalhe.recarregar();
                periodos.recarregar();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
