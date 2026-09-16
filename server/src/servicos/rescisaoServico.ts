/**
 * Rescisao contratual: simulacao do TRCT e efetivacao do desligamento.
 *
 * A simulacao nunca grava nada — e ela que alimenta a tela de conferencia do
 * RH antes de assinar o termo. A efetivacao grava a rescisao, muda o
 * colaborador para DEMITIDO e preenche a data de demissao.
 */
import type {
  Colaborador,
  DataISO,
  MotivoRescisao,
  Rescisao,
  ResultadoRescisao,
  TipoAviso,
} from '@rhmacaw/shared';
import {
  calcularRescisao,
  calcularSaldoFerias,
  competenciaDe,
  diasEntre,
  periodoAquisitivoAtual,
  periodoAquisitivoVencido,
} from '@rhmacaw/shared';
import { emTransacao } from '../db/conexao.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import * as repoRescisoes from '../db/repositorios/rescisoes.js';
import { erroConflito, erroNaoEncontrado } from '../erros.js';
import { exigirColaborador, mediasDeComissoes } from './comum.js';

export interface PedidoRescisao {
  colaboradorId: string;
  dataAviso: DataISO;
  dataDesligamento: DataISO;
  motivo: MotivoRescisao;
  tipoAviso: TipoAviso;
  saldoFGTS?: number | undefined;
  decimoTerceiroAdiantado?: number | undefined;
  outrosProventos?: number | undefined;
  outrosDescontos?: number | undefined;
  /** Sobrescreve o saldo apurado no banco (quando o RH ja conferiu o extrato). */
  diasFeriasVencidas?: number | undefined;
  saldoComissoes?: number | undefined;
  /** Sobrescreve a media de comissoes dos 12 meses calculada a partir do banco. */
  mediaComissoes?: number | undefined;
  /** Sobrescreve a contagem de faltas injustificadas do periodo aquisitivo. */
  faltasInjustificadasNoPeriodo?: number | undefined;
}

/**
 * Estima o saldo do FGTS pelos depositos de 8% sobre o salario desde a
 * admissao. E uma aproximacao: o extrato oficial da CAIXA prevalece e pode
 * ser informado no pedido.
 */
function estimarSaldoFGTS(colaborador: Colaborador, ate: DataISO): number {
  const meses = Math.max(0, Math.floor(diasEntre(colaborador.admissao, ate) / 30));
  return Number((colaborador.salarioBase * 0.08 * meses).toFixed(2));
}

export function simularRescisao(tenantId: string, pedido: PedidoRescisao): ResultadoRescisao {
  const colaborador = exigirColaborador(tenantId, pedido.colaboradorId);
  const competencia = competenciaDe(pedido.dataDesligamento);

  const periodo = periodoAquisitivoAtual(colaborador.admissao, pedido.dataDesligamento);
  const faltasNoPeriodo = repoFaltas.contarFaltasNoIntervalo(tenantId, colaborador.id, periodo.inicio, periodo.fim, [
    'FALTA',
    'SUSPENSAO',
  ]);

  // O RH pode ter conferido a ficha e discordar da contagem do sistema.
  const faltasConsideradas = pedido.faltasInjustificadasNoPeriodo ?? faltasNoPeriodo;

  // Somente o gozo lancado no periodo aquisitivo que esta sendo apurado abate o
  // saldo: somar o gozo do vinculo inteiro zerava as ferias vencidas do TRCT de
  // qualquer empregado que ja tivesse tirado ferias alguma vez.
  const vencido = periodoAquisitivoVencido(colaborador.admissao, pedido.dataDesligamento);
  const gozados = repoFerias.diasGozadosNoPeriodo(
    repoFerias.diasGozadosPorPeriodo(tenantId),
    colaborador.id,
    vencido,
  );
  const saldo = calcularSaldoFerias(colaborador, faltasConsideradas, gozados, pedido.dataDesligamento);

  // Comissoes ainda nao pagas da competencia do desligamento entram no TRCT.
  const comissoesPendentes =
    pedido.saldoComissoes ??
    repoComissoes.comissoesAPagarNaCompetencia(tenantId, competencia).get(colaborador.id) ??
    0;

  return calcularRescisao({
    colaborador,
    dataAviso: pedido.dataAviso,
    dataDesligamento: pedido.dataDesligamento,
    motivo: pedido.motivo,
    tipoAviso: pedido.tipoAviso,
    mediaComissoes: pedido.mediaComissoes ?? mediasDeComissoes(tenantId, competencia).get(colaborador.id) ?? 0,
    diasFeriasVencidas: pedido.diasFeriasVencidas ?? saldo.diasSaldo,
    faltasInjustificadasNoPeriodo: faltasConsideradas,
    saldoFGTS: pedido.saldoFGTS ?? estimarSaldoFGTS(colaborador, pedido.dataDesligamento),
    decimoTerceiroAdiantado: pedido.decimoTerceiroAdiantado ?? 0,
    saldoComissoes: comissoesPendentes,
    outrosProventos: pedido.outrosProventos ?? 0,
    outrosDescontos: pedido.outrosDescontos ?? 0,
  });
}

export function efetivarRescisao(tenantId: string, pedido: PedidoRescisao, usuarioId: string | null): Rescisao {
  const colaborador = exigirColaborador(tenantId, pedido.colaboradorId);
  if (colaborador.situacao === 'DEMITIDO') {
    throw erroConflito(`${colaborador.nome} ja consta como DEMITIDO desde ${colaborador.demissao ?? 'data nao informada'}.`);
  }
  if (pedido.dataDesligamento < pedido.dataAviso) {
    throw erroConflito('Data de desligamento anterior a data do aviso.');
  }

  const resultado = simularRescisao(tenantId, pedido);

  return emTransacao(() => {
    const rescisao = repoRescisoes.criarRescisao(tenantId, {
      colaboradorId: colaborador.id,
      colaboradorNome: colaborador.nome,
      dataAviso: pedido.dataAviso,
      dataDesligamento: pedido.dataDesligamento,
      motivo: pedido.motivo,
      tipoAviso: pedido.tipoAviso,
      diasAvisoPrevio: resultado.diasAvisoPrevio,
      saldoSalario: resultado.saldoSalario,
      avisoPrevioIndenizado: resultado.avisoPrevioIndenizado,
      decimoTerceiroProporcional: resultado.decimoTerceiroProporcional,
      feriasVencidas: resultado.feriasVencidas,
      tercoFeriasVencidas: resultado.tercoFeriasVencidas,
      feriasProporcionais: resultado.feriasProporcionais,
      tercoFeriasProporcionais: resultado.tercoFeriasProporcionais,
      saldoComissoes: resultado.saldoComissoes,
      outrosProventos: resultado.outrosProventos,
      totalProventos: resultado.totalProventos,
      inss: resultado.inss,
      irrf: resultado.irrf,
      avisoPrevioDescontado: resultado.avisoPrevioDescontado,
      outrosDescontos: resultado.outrosDescontos,
      totalDescontos: resultado.totalDescontos,
      liquido: resultado.liquido,
      saldoFGTS: resultado.saldoFGTS,
      multaFGTS: resultado.multaFGTS,
      habilitaSeguroDesemprego: resultado.habilitaSeguroDesemprego,
      verbas: resultado.verbas,
      status: 'FECHADA',
    });

    repoColaboradores.atualizarColaborador(tenantId, colaborador.id, {
      situacao: 'DEMITIDO',
      demissao: pedido.dataDesligamento,
    });

    registrar(tenantId, usuarioId, 'rescisao:efetivar', 'rescisao', rescisao.id, {
      colaboradorId: colaborador.id,
      motivo: pedido.motivo,
      liquido: resultado.liquido,
    });
    return rescisao;
  });
}

export function exigirRescisao(tenantId: string, id: string): Rescisao {
  const rescisao = repoRescisoes.buscarRescisao(tenantId, id);
  if (!rescisao) throw erroNaoEncontrado('Rescisao');
  return rescisao;
}

/** Marca a rescisao como paga — chamado apenas pelo servico de remessa. */
export function marcarComoPaga(tenantId: string, rescisaoId: string): void {
  repoRescisoes.atualizarStatusRescisao(tenantId, rescisaoId, 'PAGA');
}
