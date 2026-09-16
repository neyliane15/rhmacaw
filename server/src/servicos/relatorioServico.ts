/**
 * Relatorios gerenciais. Todos sao derivados do que ja esta gravado (folha,
 * faltas, comissoes) — nenhum deles recalcula a folha, para que o numero do
 * relatorio seja exatamente o que foi pago.
 */
import type { Competencia, ItemFolha } from '@rhmacaw/shared';
import {
  arredondar,
  calcularFGTS,
  primeiroDiaDaCompetencia,
  rotuloCompetencia,
  somar,
  ultimoDiaDaCompetencia,
} from '@rhmacaw/shared';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import { erroNaoEncontrado } from '../erros.js';
import { competenciasAnteriores, mediasDeComissoes } from './comum.js';

function itensDaCompetencia(tenantId: string, competencia: Competencia): ItemFolha[] {
  const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
  if (!folha) throw erroNaoEncontrado(`Folha mensal de ${rotuloCompetencia(competencia)}`);
  return repoFolhas.listarItens(tenantId, folha.id);
}

export interface LinhaAnalitica {
  colaboradorId: string;
  colaboradorNome: string;
  funcao: string;
  centroCusto: string;
  salarioBase: number;
  proventos: number;
  descontos: number;
  inss: number;
  irrf: number;
  fgts: number;
  liquido: number;
  comissoesAdiantadas: number;
  valorTransferir: number;
}

export function folhaAnalitica(
  tenantId: string,
  competencia: Competencia,
): { competencia: Competencia; linhas: LinhaAnalitica[]; totais: Omit<LinhaAnalitica, 'colaboradorId' | 'colaboradorNome' | 'funcao' | 'centroCusto'> } {
  const itens = itensDaCompetencia(tenantId, competencia);
  const linhas = itens.map((i) => ({
    colaboradorId: i.colaboradorId,
    colaboradorNome: i.colaboradorNome,
    funcao: i.funcao,
    centroCusto: i.centroCusto,
    salarioBase: i.salarioBase,
    proventos: i.totalProventos,
    descontos: i.totalDescontos,
    inss: i.inss,
    irrf: i.irrf,
    fgts: i.fgts,
    liquido: i.salarioLiquido,
    comissoesAdiantadas: i.comissoesAdiantadas,
    valorTransferir: i.valorTransferir,
  }));

  return {
    competencia,
    linhas,
    totais: {
      salarioBase: somar(...linhas.map((l) => l.salarioBase)),
      proventos: somar(...linhas.map((l) => l.proventos)),
      descontos: somar(...linhas.map((l) => l.descontos)),
      inss: somar(...linhas.map((l) => l.inss)),
      irrf: somar(...linhas.map((l) => l.irrf)),
      fgts: somar(...linhas.map((l) => l.fgts)),
      liquido: somar(...linhas.map((l) => l.liquido)),
      comissoesAdiantadas: somar(...linhas.map((l) => l.comissoesAdiantadas)),
      valorTransferir: somar(...linhas.map((l) => l.valorTransferir)),
    },
  };
}

export interface LinhaCentroCusto {
  centroCusto: string;
  colaboradores: number;
  proventos: number;
  descontos: number;
  liquido: number;
  inss: number;
  fgts: number;
  /** Proventos + encargos patronais (FGTS 8% + INSS patronal estimado em 26,8%). */
  custoTotal: number;
}

/** Aliquota patronal padrao do Simples/Lucro Presumido para restaurante (INSS + terceiros + RAT). */
const ENCARGO_PATRONAL = 0.268;

export function custoPorCentroCusto(
  tenantId: string,
  competencia: Competencia,
): { competencia: Competencia; linhas: LinhaCentroCusto[]; custoTotal: number } {
  const itens = itensDaCompetencia(tenantId, competencia);
  const mapa = new Map<string, ItemFolha[]>();
  for (const item of itens) {
    const atual = mapa.get(item.centroCusto);
    if (atual) atual.push(item);
    else mapa.set(item.centroCusto, [item]);
  }

  const linhas = [...mapa.entries()]
    .map(([centroCusto, doCentro]) => {
      const proventos = somar(...doCentro.map((i) => i.totalProventos));
      const fgts = somar(...doCentro.map((i) => i.fgts));
      return {
        centroCusto,
        colaboradores: doCentro.length,
        proventos,
        descontos: somar(...doCentro.map((i) => i.totalDescontos)),
        liquido: somar(...doCentro.map((i) => i.salarioLiquido)),
        inss: somar(...doCentro.map((i) => i.inss)),
        fgts,
        custoTotal: arredondar(proventos + fgts + proventos * ENCARGO_PATRONAL),
      };
    })
    .sort((a, b) => b.custoTotal - a.custoTotal);

  return { competencia, linhas, custoTotal: somar(...linhas.map((l) => l.custoTotal)) };
}

export interface LinhaComissao {
  colaboradorId: string;
  colaboradorNome: string;
  centroCusto: string;
  total: number;
  porCompetencia: Record<string, number>;
}

export function relatorioComissoes(
  tenantId: string,
  ano: number,
  competencia?: Competencia,
): { ano: number; linhas: LinhaComissao[]; totalGeral: number; periodos: number } {
  const periodos = repoComissoes.listarPeriodos(tenantId, competencia ? { competencia } : { ano });
  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));

  const acumulado = new Map<string, LinhaComissao>();
  for (const periodo of periodos) {
    for (const lancamento of repoComissoes.listarLancamentos(tenantId, periodo.id)) {
      const cadastro = cadastros.get(lancamento.colaboradorId);
      const linha = acumulado.get(lancamento.colaboradorId) ?? {
        colaboradorId: lancamento.colaboradorId,
        colaboradorNome: cadastro?.nome ?? lancamento.colaboradorId,
        centroCusto: cadastro?.centroCusto ?? '-',
        total: 0,
        porCompetencia: {},
      };
      linha.total = somar(linha.total, lancamento.valor);
      linha.porCompetencia[periodo.competencia] = somar(
        linha.porCompetencia[periodo.competencia] ?? 0,
        lancamento.valor,
      );
      acumulado.set(lancamento.colaboradorId, linha);
    }
  }

  const linhas = [...acumulado.values()].sort((a, b) => b.total - a.total);
  return { ano, linhas, totalGeral: somar(...linhas.map((l) => l.total)), periodos: periodos.length };
}

export interface LinhaAbsenteismo {
  colaboradorId: string;
  colaboradorNome: string;
  centroCusto: string;
  faltas: number;
  faltasJustificadas: number;
  atestados: number;
  atrasosHoras: number;
  descontoFaltas: number;
  descontoDSR: number;
}

export function absenteismo(
  tenantId: string,
  competencia: Competencia,
): { competencia: Competencia; linhas: LinhaAbsenteismo[]; taxaAbsenteismo: number } {
  const faltas = repoFaltas.listarFaltas(tenantId, { competencia });
  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));

  // Os valores descontados vem da folha quando ela ja existe; sem folha
  // processada o relatorio mostra apenas a contagem de ocorrencias.
  const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
  const itens = new Map<string, ItemFolha>(
    folha ? repoFolhas.listarItens(tenantId, folha.id).map((i) => [i.colaboradorId, i]) : [],
  );

  const mapa = new Map<string, LinhaAbsenteismo>();
  for (const falta of faltas) {
    const cadastro = cadastros.get(falta.colaboradorId);
    const linha = mapa.get(falta.colaboradorId) ?? {
      colaboradorId: falta.colaboradorId,
      colaboradorNome: cadastro?.nome ?? falta.colaboradorId,
      centroCusto: cadastro?.centroCusto ?? '-',
      faltas: 0,
      faltasJustificadas: 0,
      atestados: 0,
      atrasosHoras: 0,
      descontoFaltas: itens.get(falta.colaboradorId)?.descontoFaltas ?? 0,
      descontoDSR: itens.get(falta.colaboradorId)?.descontoDSR ?? 0,
    };
    if (falta.tipo === 'FALTA' || falta.tipo === 'SUSPENSAO') linha.faltas += 1;
    else if (falta.tipo === 'ATESTADO') linha.atestados += 1;
    else if (falta.tipo === 'ATRASO') linha.atrasosHoras = arredondar(linha.atrasosHoras + (falta.horas ?? 0));
    else linha.faltasJustificadas += 1;
    mapa.set(falta.colaboradorId, linha);
  }

  const linhas = [...mapa.values()].sort((a, b) => b.faltas - a.faltas);
  const ativos = [...cadastros.values()].filter((c) => c.situacao !== 'DEMITIDO').length;
  const diasUteisEstimados = 26;
  const taxa = ativos > 0 ? arredondar((somar(...linhas.map((l) => l.faltas)) / (ativos * diasUteisEstimados)) * 100, 2) : 0;

  return { competencia, linhas, taxaAbsenteismo: taxa };
}

export function movimentacao(
  tenantId: string,
  ano: number,
): { ano: number; meses: { competencia: Competencia; admissoes: number; demissoes: number; saldo: number }[]; admissoes: number; demissoes: number } {
  const colaboradores = repoColaboradores.listarTodos(tenantId);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const competencia: Competencia = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const inicio = primeiroDiaDaCompetencia(competencia);
    const fim = ultimoDiaDaCompetencia(competencia);
    const admissoes = colaboradores.filter((c) => c.admissao >= inicio && c.admissao <= fim).length;
    const demissoes = colaboradores.filter((c) => c.demissao && c.demissao >= inicio && c.demissao <= fim).length;
    return { competencia, admissoes, demissoes, saldo: admissoes - demissoes };
  });

  return {
    ano,
    meses,
    admissoes: meses.reduce((a, m) => a + m.admissoes, 0),
    demissoes: meses.reduce((a, m) => a + m.demissoes, 0),
  };
}

export interface LinhaProvisao {
  colaboradorId: string;
  colaboradorNome: string;
  centroCusto: string;
  remuneracaoBase: number;
  /** 1/12 da remuneracao por mes trabalhado no periodo aquisitivo + 1/3. */
  provisaoFerias: number;
  provisaoDecimoTerceiro: number;
  /** FGTS e INSS patronal incidentes sobre as duas provisoes. */
  encargosSobreProvisoes: number;
  total: number;
}

/**
 * Provisao mensal de ferias, 13o e encargos.
 *
 * O regime de competencia exige reconhecer 1/12 de ferias (+1/3) e 1/12 de 13o
 * a cada mes, com os encargos patronais correspondentes — mesmo que o
 * desembolso so ocorra la na frente.
 */
export function provisoes(
  tenantId: string,
  competencia: Competencia,
): { competencia: Competencia; linhas: LinhaProvisao[]; total: number } {
  const medias = mediasDeComissoes(tenantId, competencia);
  const linhas = repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => c.situacao !== 'DEMITIDO' && c.admissao <= ultimoDiaDaCompetencia(competencia))
    .map((c) => {
      const remuneracao = arredondar(c.salarioBase + (medias.get(c.id) ?? 0));
      const provisaoFerias = arredondar((remuneracao / 12) * (4 / 3));
      const provisaoDecimo = arredondar(remuneracao / 12);
      const encargos = arredondar(
        calcularFGTS(provisaoFerias + provisaoDecimo) + (provisaoFerias + provisaoDecimo) * ENCARGO_PATRONAL,
      );
      return {
        colaboradorId: c.id,
        colaboradorNome: c.nome,
        centroCusto: c.centroCusto,
        remuneracaoBase: remuneracao,
        provisaoFerias,
        provisaoDecimoTerceiro: provisaoDecimo,
        encargosSobreProvisoes: encargos,
        total: arredondar(provisaoFerias + provisaoDecimo + encargos),
      };
    })
    .sort((a, b) => b.total - a.total);

  return { competencia, linhas, total: somar(...linhas.map((l) => l.total)) };
}

/** Evolucao do custo da folha nos ultimos 12 meses — usado nos graficos do painel. */
export function evolucaoFolha(tenantId: string, ate: Competencia): { competencia: Competencia; custo: number; transferir: number }[] {
  return competenciasAnteriores(ate, 12).map((competencia) => {
    const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
    return { competencia, custo: folha?.totalProventos ?? 0, transferir: folha?.totalTransferir ?? 0 };
  });
}
