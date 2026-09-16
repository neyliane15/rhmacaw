/**
 * Ferias: saldo do periodo aquisitivo, simulacao do recibo e programacao.
 * Todo o calculo legal vem de `calcularFerias`/`calcularSaldoFerias`.
 */
import type { Ferias, FeriasEntrada, ResultadoFerias, SaldoFerias, StatusFerias } from '@rhmacaw/shared';
import {
  REGIMES_CONTRATO,
  calcularFerias,
  calcularSaldoFerias,
  competenciaDe,
  hojeISO,
  periodoAquisitivoAtual,
  periodoAquisitivoVencido,
  somarDias,
} from '@rhmacaw/shared';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import { existeFolhaTravada } from '../db/repositorios/folhas.js';
import { erroConflito, erroNaoEncontrado, erroNaoProcessavel } from '../erros.js';
import { exigirColaborador, mediasDeComissoes } from './comum.js';

/** Faltas injustificadas no periodo aquisitivo — definem os dias de direito (art. 130). */
function faltasNoPeriodo(tenantId: string, colaboradorId: string, inicio: string, fim: string): number {
  return repoFaltas.contarFaltasNoIntervalo(tenantId, colaboradorId, inicio, fim, ['FALTA', 'SUSPENSAO']);
}

export function listarSaldos(tenantId: string, referencia = hojeISO()): SaldoFerias[] {
  const gozados = repoFerias.diasGozadosPorPeriodo(tenantId);
  return repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => c.situacao !== 'DEMITIDO')
    // Socio, PJ e estagiario nao adquirem ferias (REGIMES_CONTRATO): manter o
    // saldo deles na lista transformava o alerta de vencimento em ruido e
    // sugeria uma verba que a empresa nao deve.
    .filter((c) => REGIMES_CONTRATO[c.tipoContrato].temDecimoTerceiroEFerias)
    .map((c) => {
      const periodo = periodoAquisitivoAtual(c.admissao, referencia);
      const faltas = faltasNoPeriodo(tenantId, c.id, periodo.inicio, periodo.fim);
      // So o gozo lancado NAQUELE periodo aquisitivo abate o saldo dele.
      const vencido = periodoAquisitivoVencido(c.admissao, referencia);
      const diasDoPeriodo = repoFerias.diasGozadosNoPeriodo(gozados, c.id, vencido);
      return calcularSaldoFerias(c, faltas, diasDoPeriodo, referencia);
    })
    .sort((a, b) => a.limiteConcessivo.localeCompare(b.limiteConcessivo));
}

export function simularFerias(tenantId: string, entrada: FeriasEntrada): ResultadoFerias {
  const colaborador = exigirColaborador(tenantId, entrada.colaboradorId);
  const competencia = competenciaDe(entrada.inicioGozo);
  const media = mediasDeComissoes(tenantId, competencia).get(colaborador.id) ?? 0;

  return calcularFerias({
    colaborador,
    mediaComissoes: media,
    diasGozo: entrada.diasGozo,
    diasAbono: entrada.diasAbono,
    inicioGozo: entrada.inicioGozo,
    adiantarDecimoTerceiro: entrada.adiantarDecimoTerceiro,
  });
}

/** Monta a linha persistida a partir da entrada + resultado do motor. */
function montarDados(entrada: FeriasEntrada, resultado: ResultadoFerias, status: StatusFerias): repoFerias.DadosFerias {
  return {
    colaboradorId: entrada.colaboradorId,
    periodoAquisitivoInicio: entrada.periodoAquisitivoInicio,
    periodoAquisitivoFim: entrada.periodoAquisitivoFim,
    inicioGozo: entrada.inicioGozo,
    fimGozo: resultado.fimGozo,
    diasGozo: entrada.diasGozo,
    diasAbono: entrada.diasAbono,
    adiantarDecimoTerceiro: entrada.adiantarDecimoTerceiro,
    status,
    valorFerias: resultado.valorFerias,
    valorTerco: resultado.valorTerco,
    valorAbono: resultado.valorAbono,
    valorTercoAbono: resultado.valorTercoAbono,
    valorAdiantamentoDecimo: resultado.valorAdiantamentoDecimo,
    inss: resultado.inss,
    irrf: resultado.irrf,
    liquido: resultado.liquido,
    competenciaPagamento: competenciaDe(entrada.inicioGozo),
    observacoes: entrada.observacoes ?? null,
  };
}

/**
 * Regra 6 do contrato: nada pode ser lancado em competencia cuja folha ja esta
 * FECHADA ou PAGA, sob pena de a folha divergir dos eventos do mes.
 */
function garantirCompetenciaAberta(tenantId: string, ...datas: string[]): void {
  const competencias = new Set(datas.map(competenciaDe));
  for (const competencia of competencias) {
    const folha = existeFolhaTravada(tenantId, competencia);
    if (folha) {
      throw erroConflito(
        `A folha de ${competencia} esta ${folha.status}: reabra-a antes de alterar ferias nesta competencia.`,
      );
    }
  }
}

export function programarFerias(tenantId: string, entrada: FeriasEntrada, usuarioId: string | null): Ferias {
  const colaborador = exigirColaborador(tenantId, entrada.colaboradorId);
  const regime = REGIMES_CONTRATO[colaborador.tipoContrato];
  if (!regime.temDecimoTerceiroEFerias) {
    throw erroNaoProcessavel(
      `${colaborador.nome} tem contrato ${colaborador.tipoContrato}, que nao adquire ferias remuneradas. ${regime.fundamento}`,
    );
  }
  const resultado = simularFerias(tenantId, entrada);
  garantirCompetenciaAberta(tenantId, entrada.inicioGozo, resultado.fimGozo);

  if (entrada.diasGozo <= 0 && entrada.diasAbono <= 0) {
    throw erroNaoProcessavel('Informe ao menos um dia de gozo ou de abono.');
  }

  // Sobreposicao de periodos no mesmo colaborador indica erro de digitacao.
  const fim = resultado.fimGozo;
  const conflito = repoFerias
    .listarFerias(tenantId, { colaboradorId: entrada.colaboradorId })
    .find((f) => f.status !== 'CANCELADA' && f.inicioGozo <= fim && f.fimGozo >= entrada.inicioGozo);
  if (conflito) {
    throw erroConflito(`Ja existe periodo de ferias de ${conflito.inicioGozo} a ${conflito.fimGozo} para este colaborador.`);
  }

  const ferias = repoFerias.criarFeriasNoBanco(tenantId, montarDados(entrada, resultado, entrada.status ?? 'PROGRAMADA'));
  registrar(tenantId, usuarioId, 'ferias:programar', 'ferias', ferias.id, {
    colaboradorId: entrada.colaboradorId,
    inicioGozo: entrada.inicioGozo,
  });
  return ferias;
}

export function atualizarFerias(
  tenantId: string,
  id: string,
  entrada: Partial<FeriasEntrada>,
  usuarioId: string | null,
): Ferias {
  const atual = repoFerias.buscarFerias(tenantId, id);
  if (!atual) throw erroNaoEncontrado('Periodo de ferias');
  if (atual.status === 'CONCLUIDA') throw erroConflito('Periodo de ferias CONCLUIDA nao pode ser alterado.');

  const mesclada: FeriasEntrada = {
    colaboradorId: entrada.colaboradorId ?? atual.colaboradorId,
    periodoAquisitivoInicio: entrada.periodoAquisitivoInicio ?? atual.periodoAquisitivoInicio,
    periodoAquisitivoFim: entrada.periodoAquisitivoFim ?? atual.periodoAquisitivoFim,
    inicioGozo: entrada.inicioGozo ?? atual.inicioGozo,
    diasGozo: entrada.diasGozo ?? atual.diasGozo,
    diasAbono: entrada.diasAbono ?? atual.diasAbono,
    adiantarDecimoTerceiro: entrada.adiantarDecimoTerceiro ?? atual.adiantarDecimoTerceiro,
    observacoes: entrada.observacoes ?? atual.observacoes,
    status: entrada.status ?? atual.status,
  };

  const resultado = simularFerias(tenantId, mesclada);
  garantirCompetenciaAberta(tenantId, atual.inicioGozo, mesclada.inicioGozo, resultado.fimGozo);

  const atualizada = repoFerias.substituirFerias(
    tenantId,
    id,
    montarDados(mesclada, resultado, mesclada.status ?? atual.status),
  );
  if (!atualizada) throw erroNaoEncontrado('Periodo de ferias');
  registrar(tenantId, usuarioId, 'ferias:atualizar', 'ferias', id, { status: atualizada.status });
  return atualizada;
}

export function removerFerias(tenantId: string, id: string, usuarioId: string | null): void {
  const atual = repoFerias.buscarFerias(tenantId, id);
  if (!atual) throw erroNaoEncontrado('Periodo de ferias');
  if (atual.status === 'CONCLUIDA') throw erroConflito('Periodo de ferias CONCLUIDA nao pode ser excluido.');
  garantirCompetenciaAberta(tenantId, atual.inicioGozo, atual.fimGozo);

  repoFerias.removerFerias(tenantId, id);
  registrar(tenantId, usuarioId, 'ferias:remover', 'ferias', id, { colaboradorId: atual.colaboradorId });
}

/** Periodo aquisitivo sugerido para o colaborador, usado pelo front ao abrir o formulario. */
export function sugerirPeriodoAquisitivo(tenantId: string, colaboradorId: string): { inicio: string; fim: string } {
  const colaborador = exigirColaborador(tenantId, colaboradorId);
  const atual = periodoAquisitivoAtual(colaborador.admissao);
  // O periodo em aberto para gozo e o anterior ao que ainda esta correndo.
  return atual.numero > 1
    ? { inicio: somarDias(atual.inicio, -365), fim: somarDias(atual.inicio, -1) }
    : { inicio: atual.inicio, fim: atual.fim };
}
