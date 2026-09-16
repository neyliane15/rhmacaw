/**
 * Relatorios gerenciais. Todos sao derivados do que ja esta gravado (folha,
 * faltas, comissoes) — nenhum deles recalcula a folha, para que o numero do
 * relatorio seja exatamente o que foi pago.
 */
import type { Competencia, Folha, ItemFolha, StatusFolha, StatusPeriodo } from '@rhmacaw/shared';
import {
  REGIMES_CONTRATO,
  arredondar,
  calcularFGTS,
  diaDaSemana,
  diasNoMes,
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

function folhaDaCompetencia(tenantId: string, competencia: Competencia): Folha {
  const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
  if (!folha) throw erroNaoEncontrado(`Folha mensal de ${rotuloCompetencia(competencia)}`);
  return folha;
}

function itensDaCompetencia(tenantId: string, competencia: Competencia): ItemFolha[] {
  return repoFolhas.listarItens(tenantId, folhaDaCompetencia(tenantId, competencia).id);
}

export interface TotaisFolhaAnalitica {
  totalProventos: number;
  totalDescontos: number;
  totalLiquido: number;
  totalTransferir: number;
  totalComissoesAdiantadas: number;
  totalINSS: number;
  totalIRRF: number;
  totalFGTS: number;
}

export interface RelatorioFolhaAnalitica {
  competencia: Competencia;
  folhaId: string;
  status: StatusFolha;
  itens: ItemFolha[];
  totais: TotaisFolhaAnalitica;
}

/**
 * Folha analitica: os itens gravados, sem recalculo, mais os totais.
 *
 * Devolve `ItemFolha` inteiro (e nao uma projecao): a tela mostra colunas
 * diferentes conforme o que o usuario escolhe, e o CSV exporta tudo.
 */
export function folhaAnalitica(tenantId: string, competencia: Competencia): RelatorioFolhaAnalitica {
  const folha = folhaDaCompetencia(tenantId, competencia);
  const itens = repoFolhas.listarItens(tenantId, folha.id);

  return {
    competencia,
    folhaId: folha.id,
    status: folha.status,
    itens,
    totais: {
      totalProventos: somar(...itens.map((i) => i.totalProventos)),
      totalDescontos: somar(...itens.map((i) => i.totalDescontos)),
      totalLiquido: somar(...itens.map((i) => i.salarioLiquido)),
      totalTransferir: somar(...itens.map((i) => i.valorTransferir)),
      totalComissoesAdiantadas: somar(...itens.map((i) => i.comissoesAdiantadas)),
      totalINSS: somar(...itens.map((i) => i.inss)),
      totalIRRF: somar(...itens.map((i) => i.irrf)),
      totalFGTS: somar(...itens.map((i) => i.fgts)),
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
): { competencia: Competencia; linhas: LinhaCentroCusto[]; total: number } {
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

  return { competencia, linhas, total: somar(...linhas.map((l) => l.custoTotal)) };
}

export interface LinhaComissao {
  colaboradorId: string;
  colaboradorNome: string;
  funcao: string;
  centroCusto: string;
  /** Quantidade de semanas em que o colaborador recebeu alguma comissao. */
  semanas: number;
  pontos: number;
  total: number;
  porCompetencia: Record<string, number>;
}

export interface LinhaSemanaComissao {
  ano: number;
  semana: number;
  competencia: Competencia;
  arrecadado: number;
  distribuido: number;
  status: StatusPeriodo;
}

export interface RelatorioComissoes {
  ano: number;
  competencia: Competencia | null;
  linhas: LinhaComissao[];
  porSemana: LinhaSemanaComissao[];
  totalArrecadado: number;
  totalDistribuido: number;
  periodos: number;
}

export function relatorioComissoes(
  tenantId: string,
  ano: number,
  competencia?: Competencia,
): RelatorioComissoes {
  const periodos = repoComissoes.listarPeriodos(tenantId, competencia ? { competencia } : { ano });
  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));

  const acumulado = new Map<string, LinhaComissao>();
  for (const periodo of periodos) {
    for (const lancamento of repoComissoes.listarLancamentos(tenantId, periodo.id)) {
      const cadastro = cadastros.get(lancamento.colaboradorId);
      const linha = acumulado.get(lancamento.colaboradorId) ?? {
        colaboradorId: lancamento.colaboradorId,
        colaboradorNome: cadastro?.nome ?? lancamento.colaboradorId,
        funcao: cadastro?.funcao ?? '-',
        centroCusto: cadastro?.centroCusto ?? '-',
        semanas: 0,
        pontos: 0,
        total: 0,
        porCompetencia: {},
      };
      // Semana sem valor nao conta como semana participada.
      if (lancamento.valor !== 0) linha.semanas += 1;
      linha.pontos = arredondar(Math.max(linha.pontos, lancamento.pontos), 4);
      linha.total = somar(linha.total, lancamento.valor);
      linha.porCompetencia[periodo.competencia] = somar(
        linha.porCompetencia[periodo.competencia] ?? 0,
        lancamento.valor,
      );
      acumulado.set(lancamento.colaboradorId, linha);
    }
  }

  const porSemana: LinhaSemanaComissao[] = periodos
    .map((p) => ({
      ano: p.ano,
      semana: p.semana,
      competencia: p.competencia,
      arrecadado: p.valorArrecadado,
      distribuido: p.totalDistribuido,
      status: p.status,
    }))
    .sort((a, b) => a.ano - b.ano || a.semana - b.semana);

  const linhas = [...acumulado.values()].sort((a, b) => b.total - a.total);
  return {
    ano,
    competencia: competencia ?? null,
    linhas,
    porSemana,
    totalArrecadado: somar(...porSemana.map((p) => p.arrecadado)),
    totalDistribuido: somar(...linhas.map((l) => l.total)),
    periodos: periodos.length,
  };
}

export interface LinhaAbsenteismo {
  colaboradorId: string;
  colaboradorNome: string;
  funcao: string;
  centroCusto: string;
  /** Dias uteis estimados da competencia, denominador do percentual. */
  diasUteis: number;
  faltas: number;
  faltasJustificadas: number;
  atestados: number;
  atrasosHoras: number;
  descontoFaltas: number;
  descontoDSR: number;
  /** Faltas injustificadas sobre os dias uteis do mes, em percentual. */
  percentual: number;
}

export interface RelatorioAbsenteismo {
  competencia: Competencia;
  diasUteis: number;
  linhas: LinhaAbsenteismo[];
  percentualGeral: number;
}

/** Dias uteis (segunda a sabado) da competencia — denominador do absenteismo. */
function diasUteisDaCompetencia(competencia: Competencia): number {
  const total = diasNoMes(competencia);
  let uteis = 0;
  for (let dia = 1; dia <= total; dia += 1) {
    if (diaDaSemana(`${competencia}-${String(dia).padStart(2, '0')}`) !== 0) uteis += 1;
  }
  return uteis;
}

export function absenteismo(tenantId: string, competencia: Competencia): RelatorioAbsenteismo {
  const faltas = repoFaltas.listarFaltas(tenantId, { competencia });
  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));
  const diasUteis = diasUteisDaCompetencia(competencia);

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
      funcao: cadastro?.funcao ?? '-',
      centroCusto: cadastro?.centroCusto ?? '-',
      diasUteis,
      faltas: 0,
      faltasJustificadas: 0,
      atestados: 0,
      atrasosHoras: 0,
      descontoFaltas: itens.get(falta.colaboradorId)?.descontoFaltas ?? 0,
      descontoDSR: itens.get(falta.colaboradorId)?.descontoDSR ?? 0,
      percentual: 0,
    };
    if (falta.tipo === 'FALTA' || falta.tipo === 'SUSPENSAO') linha.faltas += 1;
    else if (falta.tipo === 'ATESTADO') linha.atestados += 1;
    else if (falta.tipo === 'ATRASO') linha.atrasosHoras = arredondar(linha.atrasosHoras + (falta.horas ?? 0));
    else linha.faltasJustificadas += 1;
    mapa.set(falta.colaboradorId, linha);
  }

  const linhas = [...mapa.values()]
    .map((l) => ({ ...l, percentual: diasUteis > 0 ? arredondar((l.faltas / diasUteis) * 100, 2) : 0 }))
    .sort((a, b) => b.faltas - a.faltas);

  const ativos = [...cadastros.values()].filter((c) => c.situacao !== 'DEMITIDO').length;
  const percentualGeral =
    ativos > 0 && diasUteis > 0
      ? arredondar((linhas.reduce((a, l) => a + l.faltas, 0) / (ativos * diasUteis)) * 100, 2)
      : 0;

  return { competencia, diasUteis, linhas, percentualGeral };
}

export interface MesMovimentacao {
  competencia: Competencia;
  admissoes: number;
  demissoes: number;
  saldo: number;
  /** Headcount vivo no ultimo dia do mes. */
  ativosFimDoMes: number;
}

export interface RelatorioMovimentacao {
  ano: number;
  meses: MesMovimentacao[];
  totalAdmissoes: number;
  totalDemissoes: number;
  /** Turnover do ano: media entre admissoes e demissoes sobre o headcount medio. */
  turnover: number;
}

export function movimentacao(tenantId: string, ano: number): RelatorioMovimentacao {
  const colaboradores = repoColaboradores.listarTodos(tenantId);
  const meses: MesMovimentacao[] = Array.from({ length: 12 }, (_, i) => {
    const competencia: Competencia = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const inicio = primeiroDiaDaCompetencia(competencia);
    const fim = ultimoDiaDaCompetencia(competencia);
    const admissoes = colaboradores.filter((c) => c.admissao >= inicio && c.admissao <= fim).length;
    const demissoes = colaboradores.filter((c) => c.demissao && c.demissao >= inicio && c.demissao <= fim).length;
    const ativosFimDoMes = colaboradores.filter((c) => c.admissao <= fim && (!c.demissao || c.demissao > fim)).length;
    return { competencia, admissoes, demissoes, saldo: admissoes - demissoes, ativosFimDoMes };
  });

  const totalAdmissoes = meses.reduce((a, m) => a + m.admissoes, 0);
  const totalDemissoes = meses.reduce((a, m) => a + m.demissoes, 0);
  const headcountMedio = meses.reduce((a, m) => a + m.ativosFimDoMes, 0) / 12;

  return {
    ano,
    meses,
    totalAdmissoes,
    totalDemissoes,
    turnover: headcountMedio > 0 ? arredondar(((totalAdmissoes + totalDemissoes) / 2 / headcountMedio) * 100, 2) : 0,
  };
}

export interface LinhaProvisao {
  colaboradorId: string;
  colaboradorNome: string;
  centroCusto: string;
  remuneracaoBase: number;
  /** 1/12 da remuneracao por mes trabalhado no periodo aquisitivo. */
  provisaoFerias: number;
  /** 1/3 constitucional sobre a provisao de ferias, em linha propria. */
  provisaoTercoFerias: number;
  provisaoDecimoTerceiro: number;
  /** FGTS e INSS patronal incidentes sobre as tres provisoes. */
  encargosSobreProvisoes: number;
  total: number;
}

export type TotaisProvisao = Pick<
  LinhaProvisao,
  'provisaoFerias' | 'provisaoTercoFerias' | 'provisaoDecimoTerceiro' | 'encargosSobreProvisoes' | 'total'
>;

export interface RelatorioProvisoes {
  competencia: Competencia;
  linhas: LinhaProvisao[];
  totais: TotaisProvisao;
}

/**
 * Provisao mensal de ferias, 13o e encargos.
 *
 * O regime de competencia exige reconhecer 1/12 de ferias (+1/3) e 1/12 de 13o
 * a cada mes, com os encargos patronais correspondentes — mesmo que o
 * desembolso so ocorra la na frente. Ferias e o terco saem em linhas separadas
 * porque a contabilidade os lanca em contas diferentes.
 */
export function provisoes(tenantId: string, competencia: Competencia): RelatorioProvisoes {
  const medias = mediasDeComissoes(tenantId, competencia);
  const linhas: LinhaProvisao[] = repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => c.situacao !== 'DEMITIDO' && c.admissao <= ultimoDiaDaCompetencia(competencia))
    // So se provisiona o que a empresa vai mesmo dever: socio, PJ e estagiario
    // nao geram ferias nem 13o, e provisiona-los inflava o passivo do balanco.
    .filter((c) => REGIMES_CONTRATO[c.tipoContrato].temDecimoTerceiroEFerias)
    .map((c) => {
      const remuneracao = arredondar(c.salarioBase + (medias.get(c.id) ?? 0));
      const provisaoFerias = arredondar(remuneracao / 12);
      const provisaoTercoFerias = arredondar(provisaoFerias / 3);
      const provisaoDecimo = arredondar(remuneracao / 12);
      const baseEncargos = provisaoFerias + provisaoTercoFerias + provisaoDecimo;
      const encargos = arredondar(calcularFGTS(baseEncargos) + baseEncargos * ENCARGO_PATRONAL);
      return {
        colaboradorId: c.id,
        colaboradorNome: c.nome,
        centroCusto: c.centroCusto,
        remuneracaoBase: remuneracao,
        provisaoFerias,
        provisaoTercoFerias,
        provisaoDecimoTerceiro: provisaoDecimo,
        encargosSobreProvisoes: encargos,
        total: arredondar(baseEncargos + encargos),
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    competencia,
    linhas,
    totais: {
      provisaoFerias: somar(...linhas.map((l) => l.provisaoFerias)),
      provisaoTercoFerias: somar(...linhas.map((l) => l.provisaoTercoFerias)),
      provisaoDecimoTerceiro: somar(...linhas.map((l) => l.provisaoDecimoTerceiro)),
      encargosSobreProvisoes: somar(...linhas.map((l) => l.encargosSobreProvisoes)),
      total: somar(...linhas.map((l) => l.total)),
    },
  };
}

/** Evolucao do custo da folha nos ultimos 12 meses — usado nos graficos do painel. */
export function evolucaoFolha(tenantId: string, ate: Competencia): { competencia: Competencia; custo: number; transferir: number }[] {
  return competenciasAnteriores(ate, 12).map((competencia) => {
    const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
    return { competencia, custo: folha?.totalProventos ?? 0, transferir: folha?.totalTransferir ?? 0 };
  });
}
