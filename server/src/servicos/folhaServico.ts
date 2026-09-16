/**
 * Orquestracao da folha mensal.
 *
 * O servico nao calcula nada por conta propria: ele monta a `EntradaFolha` a
 * partir do banco (faltas, comissoes, ferias, ajustes manuais), chama
 * `calcularFolhaMensal` do motor compartilhado e persiste o resultado.
 */
import type {
  Colaborador,
  Competencia,
  DataISO,
  EntradaFolha,
  Folha,
  ResultadoFolha,
  TipoFolha,
} from '@rhmacaw/shared';
import {
  calcularFolhaMensal,
  consolidarFolha,
  gerarFolhaCSV,
  rotuloCompetencia,
  somar,
  somarMeses,
  ultimoDiaDaCompetencia,
} from '@rhmacaw/shared';
import { agora, emTransacao } from '../db/conexao.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import { registrar } from '../db/repositorios/auditoria.js';
import { erroConflito, erroNaoEncontrado, erroNaoProcessavel } from '../erros.js';
import type { EntradaManualItem, FolhaCompleta, ItemFolhaCompleto } from '../tipos.js';
import { vinculadoNaCompetencia } from './comum.js';

export interface PedidoProcessamento {
  competencia: Competencia;
  tipo: TipoFolha;
  dataPagamento: DataISO;
  centroCusto?: string | undefined;
}

/**
 * Alertas que impedem o fechamento enquanto o RH nao os reconhecer. Sao os que
 * comprometem o pagamento (nada a transferir / desconto maior que provento);
 * os demais sao informativos.
 */
export function alertasCriticos(item: Pick<ItemFolhaCompleto, 'valorTransferir' | 'salarioLiquido'>): string[] {
  const criticos: string[] = [];
  if (item.salarioLiquido < 0) criticos.push('Liquido negativo: descontos superam os proventos.');
  if (item.valorTransferir < 0) {
    criticos.push('Valor a transferir negativo: comissoes adiantadas maiores que o liquido da folha.');
  }
  return criticos;
}

export function exigirFolha(tenantId: string, folhaId: string): Folha {
  const folha = repoFolhas.buscarFolha(tenantId, folhaId);
  if (!folha) throw erroNaoEncontrado('Folha');
  return folha;
}

/** Converte o resultado do motor no item persistido, preservando o ajuste manual. */
function paraItem(
  colaborador: Colaborador,
  resultado: ResultadoFolha,
  entradaManual: EntradaManualItem | null,
  reconhecidos: boolean,
): repoFolhas.DadosItem {
  return {
    colaboradorId: colaborador.id,
    colaboradorNome: colaborador.nome,
    funcao: colaborador.funcao,
    centroCusto: colaborador.centroCusto,
    salarioBase: resultado.salarioBase,
    diasTrabalhados: resultado.diasTrabalhados,
    faltasDias: resultado.faltasDias,
    faltasHoras: resultado.faltasHoras,
    descontoFaltas: resultado.descontoFaltas,
    descontoDSR: resultado.descontoDSR,
    comissoes: resultado.comissoes,
    horasExtras: resultado.horasExtras,
    adicionalNoturno: resultado.adicionalNoturno,
    outrosProventos: resultado.outrosProventos,
    descontoValeTransporte: resultado.descontoValeTransporte,
    outrosDescontos: resultado.outrosDescontos,
    baseINSS: resultado.baseINSS,
    inss: resultado.inss,
    baseIRRF: resultado.baseIRRF,
    irrf: resultado.irrf,
    baseFGTS: resultado.baseFGTS,
    fgts: resultado.fgts,
    salarioFamilia: resultado.salarioFamilia,
    totalProventos: resultado.totalProventos,
    totalDescontos: resultado.totalDescontos,
    salarioLiquido: resultado.salarioLiquido,
    comissoesAdiantadas: resultado.comissoesAdiantadas,
    valorTransferir: resultado.valorTransferir,
    verbas: resultado.verbas,
    alertas: resultado.alertas,
    alertasReconhecidos: reconhecidos,
    entradaManual,
    observacoes: entradaManual?.observacoes ?? null,
  };
}

/** Junta os ajustes manuais do item a entrada padrao montada a partir do banco. */
function comAjustes(base: EntradaFolha, manual: EntradaManualItem | null): EntradaFolha {
  if (!manual) return base;
  return {
    ...base,
    horasExtras: manual.horasExtras ?? base.horasExtras,
    horasNoturnas: manual.horasNoturnas ?? base.horasNoturnas,
    horasTrabalhadas: manual.horasTrabalhadas ?? base.horasTrabalhadas,
    adiantamento: manual.adiantamento ?? base.adiantamento,
    pensaoAlimenticia: manual.pensaoAlimenticia ?? base.pensaoAlimenticia,
    eventos: manual.eventos ?? base.eventos,
  };
}

/**
 * Processa (ou reprocessa) a folha de uma competencia.
 *
 * Reprocessar uma folha em RASCUNHO substitui os itens; folha FECHADA ou PAGA
 * nao pode ser reprocessada (regra 2 do contrato).
 */
export function processarFolha(
  tenantId: string,
  pedido: PedidoProcessamento,
  usuarioId: string | null,
): FolhaCompleta {
  const { competencia, tipo, dataPagamento } = pedido;

  const existente = repoFolhas.buscarFolhaAtiva(tenantId, competencia, tipo);
  if (existente && existente.status !== 'RASCUNHO') {
    throw erroConflito(
      `A folha ${tipo} de ${rotuloCompetencia(competencia)} esta ${existente.status} e nao pode ser reprocessada. Reabra antes.`,
    );
  }

  const colaboradores = repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => vinculadoNaCompetencia(c, competencia))
    .filter((c) => !pedido.centroCusto || c.centroCusto === pedido.centroCusto);

  if (colaboradores.length === 0) {
    throw erroNaoProcessavel(`Nenhum colaborador com vinculo ativo em ${rotuloCompetencia(competencia)}.`);
  }

  const faltas = repoFaltas.faltasPorColaboradorNaCompetencia(tenantId, competencia);
  const adiantadas = repoComissoes.comissoesPagasNaCompetencia(tenantId, competencia);
  const aPagar = repoComissoes.comissoesAPagarNaCompetencia(tenantId, competencia);
  const diasFerias = repoFerias.diasDeFeriasNaCompetencia(tenantId, competencia);

  // Ajustes manuais anteriores sao recuperados antes de recriar os itens.
  const manuaisAnteriores = new Map<string, { entrada: EntradaManualItem | null; reconhecidos: boolean }>();
  if (existente) {
    for (const item of repoFolhas.listarItens(tenantId, existente.id)) {
      manuaisAnteriores.set(item.colaboradorId, {
        entrada: item.entradaManual,
        reconhecidos: item.alertasReconhecidos,
      });
    }
  }

  const resultados: ResultadoFolha[] = [];
  const itens: repoFolhas.DadosItem[] = [];

  for (const colaborador of colaboradores) {
    const anterior = manuaisAnteriores.get(colaborador.id) ?? { entrada: null, reconhecidos: false };
    const base: EntradaFolha = {
      competencia,
      colaborador,
      faltas: faltas.get(colaborador.id) ?? [],
      comissoesAdiantadas: adiantadas.get(colaborador.id) ?? 0,
      comissoesAPagar: aPagar.get(colaborador.id) ?? 0,
      diasFerias: diasFerias.get(colaborador.id) ?? 0,
    };
    const resultado = calcularFolhaMensal(comAjustes(base, anterior.entrada));
    resultados.push(resultado);
    // Reconhecimento anterior so vale se o item continuar sem alerta novo.
    const aindaReconhecido = anterior.reconhecidos && alertasCriticos(resultado).length > 0;
    itens.push(paraItem(colaborador, resultado, anterior.entrada, aindaReconhecido));
  }

  const totais = consolidarFolha(resultados);

  return emTransacao(() => {
    const folha: Folha = existente
      ? {
          ...existente,
          dataPagamento,
          descricao: `Folha ${tipo} de ${rotuloCompetencia(competencia)}`,
          totalProventos: totais.totalProventos,
          totalDescontos: totais.totalDescontos,
          totalLiquido: totais.totalLiquido,
          totalComissoesAdiantadas: totais.totalComissoesAdiantadas,
          totalTransferir: totais.totalTransferir,
          quantidadeColaboradores: totais.quantidade,
        }
      : repoFolhas.criarFolha(tenantId, {
          competencia,
          tipo,
          status: 'RASCUNHO',
          descricao: `Folha ${tipo} de ${rotuloCompetencia(competencia)}`,
          dataPagamento,
          totalProventos: totais.totalProventos,
          totalDescontos: totais.totalDescontos,
          totalLiquido: totais.totalLiquido,
          totalComissoesAdiantadas: totais.totalComissoesAdiantadas,
          totalTransferir: totais.totalTransferir,
          quantidadeColaboradores: totais.quantidade,
        });

    if (existente) repoFolhas.atualizarFolha(tenantId, folha);
    repoFolhas.substituirItens(tenantId, folha.id, itens);
    registrar(tenantId, usuarioId, existente ? 'folha:reprocessar' : 'folha:processar', 'folha', folha.id, {
      competencia,
      tipo,
      colaboradores: totais.quantidade,
      totalTransferir: totais.totalTransferir,
    });

    const detalhada = repoFolhas.detalharFolha(tenantId, folha.id);
    if (!detalhada) throw erroNaoEncontrado('Folha');
    return detalhada;
  });
}

/** Recalcula um unico item (contracheque) sem mexer no resto da folha. */
export function ajustarItem(
  tenantId: string,
  folhaId: string,
  colaboradorId: string,
  ajustes: EntradaManualItem,
  reconhecerAlertas: boolean,
  usuarioId: string | null,
): ItemFolhaCompleto {
  const folha = exigirFolha(tenantId, folhaId);
  if (folha.status !== 'RASCUNHO') {
    throw erroConflito(`Folha ${folha.status}: so e possivel ajustar itens enquanto ela esta em RASCUNHO.`);
  }

  const itemAtual = repoFolhas.buscarItem(tenantId, folhaId, colaboradorId);
  if (!itemAtual) throw erroNaoEncontrado('Item da folha');

  const colaborador = repoColaboradores.buscarColaborador(tenantId, colaboradorId);
  if (!colaborador) throw erroNaoEncontrado('Colaborador');

  const faltas = repoFaltas.listarFaltas(tenantId, { colaboradorId, competencia: folha.competencia });
  const adiantadas = repoComissoes.comissoesPagasNaCompetencia(tenantId, folha.competencia).get(colaboradorId) ?? 0;
  const aPagar = repoComissoes.comissoesAPagarNaCompetencia(tenantId, folha.competencia).get(colaboradorId) ?? 0;
  const diasFerias = repoFerias.diasDeFeriasNaCompetencia(tenantId, folha.competencia).get(colaboradorId) ?? 0;

  // Mescla com o que ja estava lancado: o PUT do contracheque e incremental.
  const manual: EntradaManualItem = { ...(itemAtual.entradaManual ?? {}), ...ajustes };
  const resultado = calcularFolhaMensal(
    comAjustes(
      { competencia: folha.competencia, colaborador, faltas, comissoesAdiantadas: adiantadas, comissoesAPagar: aPagar, diasFerias },
      manual,
    ),
  );

  return emTransacao(() => {
    repoFolhas.gravarItem(tenantId, folhaId, paraItem(colaborador, resultado, manual, reconhecerAlertas));
    recalcularTotais(tenantId, folhaId);
    registrar(tenantId, usuarioId, 'folha:ajustar-item', 'folha', folhaId, { colaboradorId });
    const atualizado = repoFolhas.buscarItem(tenantId, folhaId, colaboradorId);
    if (!atualizado) throw erroNaoEncontrado('Item da folha');
    return atualizado;
  });
}

/** Refaz os totais do cabecalho a partir dos itens gravados. */
export function recalcularTotais(tenantId: string, folhaId: string): Folha {
  const folha = exigirFolha(tenantId, folhaId);
  const itens = repoFolhas.listarItens(tenantId, folhaId);
  const atualizada: Folha = {
    ...folha,
    totalProventos: somar(...itens.map((i) => i.totalProventos)),
    totalDescontos: somar(...itens.map((i) => i.totalDescontos)),
    totalLiquido: somar(...itens.map((i) => i.salarioLiquido)),
    totalComissoesAdiantadas: somar(...itens.map((i) => i.comissoesAdiantadas)),
    totalTransferir: somar(...itens.map((i) => i.valorTransferir)),
    quantidadeColaboradores: itens.length,
  };
  repoFolhas.atualizarFolha(tenantId, atualizada);
  return atualizada;
}

export function fecharFolha(
  tenantId: string,
  folhaId: string,
  reconhecerAlertas: boolean,
  usuarioId: string | null,
): FolhaCompleta {
  const folha = exigirFolha(tenantId, folhaId);
  if (folha.status === 'PAGA') throw erroConflito('Folha PAGA e imutavel.');
  if (folha.status !== 'RASCUNHO') throw erroConflito(`Folha ja esta ${folha.status}.`);

  const itens = repoFolhas.listarItens(tenantId, folhaId);
  if (itens.length === 0) throw erroNaoProcessavel('Folha sem itens: processe a competencia antes de fechar.');

  const pendentes = itens
    .filter((i) => !i.alertasReconhecidos && alertasCriticos(i).length > 0)
    .map((i) => `${i.colaboradorNome}: ${alertasCriticos(i).join(' ')}`);

  if (pendentes.length > 0 && !reconhecerAlertas) {
    throw erroConflito(
      `${pendentes.length} item(ns) com alerta critico nao reconhecido. Corrija ou feche com reconhecerAlertas=true. ${pendentes.join(' | ')}`,
    );
  }

  return emTransacao(() => {
    if (reconhecerAlertas) repoFolhas.marcarAlertasReconhecidos(tenantId, folhaId);
    repoFolhas.atualizarFolha(tenantId, { ...folha, status: 'FECHADA', fechadoEm: agora() });
    registrar(tenantId, usuarioId, 'folha:fechar', 'folha', folhaId, {
      competencia: folha.competencia,
      alertasReconhecidos: pendentes.length,
    });
    const detalhada = repoFolhas.detalharFolha(tenantId, folhaId);
    if (!detalhada) throw erroNaoEncontrado('Folha');
    return detalhada;
  });
}

export function reabrirFolha(tenantId: string, folhaId: string, usuarioId: string | null): FolhaCompleta {
  const folha = exigirFolha(tenantId, folhaId);
  if (folha.status === 'PAGA') throw erroConflito('Folha PAGA e imutavel: cancele a remessa antes de reabrir.');
  if (folha.status !== 'FECHADA') throw erroConflito(`Folha ${folha.status} nao pode ser reaberta.`);

  repoFolhas.atualizarFolha(tenantId, { ...folha, status: 'RASCUNHO', fechadoEm: null });
  registrar(tenantId, usuarioId, 'folha:reabrir', 'folha', folhaId, { competencia: folha.competencia });

  const detalhada = repoFolhas.detalharFolha(tenantId, folhaId);
  if (!detalhada) throw erroNaoEncontrado('Folha');
  return detalhada;
}

/** Marca a folha como PAGA — so o servico de remessa deve chamar. */
export function marcarComoPaga(tenantId: string, folha: Folha): void {
  repoFolhas.atualizarFolha(tenantId, { ...folha, status: 'PAGA', pagoEm: agora() });
}

/**
 * Devolve a folha de PAGA para FECHADA quando a remessa que a pagou e
 * cancelada.
 *
 * Sem isso a folha ficaria presa: gerar remessa exige FECHADA, entao uma
 * rejeicao do banco deixaria a competencia paga no sistema e sem arquivo
 * nenhum no banco — impossivel de reemitir.
 */
export function reverterPagamento(tenantId: string, folhaId: string): void {
  const folha = repoFolhas.buscarFolha(tenantId, folhaId);
  if (!folha || folha.status !== 'PAGA') return;
  repoFolhas.atualizarFolha(tenantId, { ...folha, status: 'FECHADA', pagoEm: null });
}

export function exportarFolha(tenantId: string, folhaId: string, formato: 'csv' | 'json'): { conteudo: string; nomeArquivo: string; tipoConteudo: string } {
  const detalhada = repoFolhas.detalharFolha(tenantId, folhaId);
  if (!detalhada) throw erroNaoEncontrado('Folha');

  const base = `folha_${detalhada.competencia}_${detalhada.tipo.toLowerCase()}`;
  if (formato === 'json') {
    return { conteudo: JSON.stringify(detalhada, null, 2), nomeArquivo: `${base}.json`, tipoConteudo: 'application/json; charset=utf-8' };
  }
  return {
    conteudo: gerarFolhaCSV(detalhada.itens, detalhada.competencia),
    nomeArquivo: `${base}.csv`,
    tipoConteudo: 'text/csv; charset=utf-8',
  };
}

/**
 * Data de pagamento sugerida: dia 5 do mes seguinte, prazo maximo do art. 459,
 * par. 1o da CLT. O usuario pode sobrescrever no pedido de processamento.
 */
export function dataPagamentoPadrao(competencia: Competencia): DataISO {
  return `${somarMeses(ultimoDiaDaCompetencia(competencia), 1).slice(0, 7)}-05`;
}
