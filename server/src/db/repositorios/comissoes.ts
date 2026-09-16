import type {
  Competencia,
  CriterioRateio,
  LancamentoComissao,
  PeriodoComissao,
  PeriodoComissaoDetalhado,
  StatusPeriodo,
} from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';

interface LinhaPeriodo {
  id: string;
  tenant_id: string;
  ano: number;
  semana: number;
  data_inicio: string;
  data_fim: string;
  competencia: string;
  valor_arrecadado: number;
  percentual_retencao: number;
  criterio_rateio: string;
  status: string;
  data_pagamento: string | null;
  total_distribuido: number;
  observacoes: string | null;
  criado_em: string;
  fechado_em: string | null;
  pago_em: string | null;
}

interface LinhaLancamento {
  id: string;
  tenant_id: string;
  periodo_id: string;
  colaborador_id: string;
  pontos: number;
  horas: number;
  ajuste: number;
  valor: number;
  observacao: string | null;
}

const paraPeriodo = (l: LinhaPeriodo): PeriodoComissao => ({
  id: l.id,
  tenantId: l.tenant_id,
  ano: l.ano,
  semana: l.semana,
  dataInicio: l.data_inicio,
  dataFim: l.data_fim,
  competencia: l.competencia,
  valorArrecadado: l.valor_arrecadado,
  percentualRetencao: l.percentual_retencao,
  criterioRateio: l.criterio_rateio as CriterioRateio,
  status: l.status as StatusPeriodo,
  dataPagamento: l.data_pagamento,
  totalDistribuido: l.total_distribuido,
  observacoes: l.observacoes,
  criadoEm: l.criado_em,
  fechadoEm: l.fechado_em,
  pagoEm: l.pago_em,
});

const paraLancamento = (l: LinhaLancamento): LancamentoComissao => ({
  id: l.id,
  tenantId: l.tenant_id,
  periodoId: l.periodo_id,
  colaboradorId: l.colaborador_id,
  pontos: l.pontos,
  horas: l.horas,
  ajuste: l.ajuste,
  valor: l.valor,
  observacao: l.observacao,
});

export interface FiltroPeriodos {
  ano?: number | undefined;
  status?: StatusPeriodo | undefined;
  competencia?: Competencia | undefined;
}

export function listarPeriodos(tenantId: string, filtro: FiltroPeriodos = {}): PeriodoComissao[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];
  if (filtro.ano) {
    partes.push('ano = ?');
    args.push(filtro.ano);
  }
  if (filtro.status) {
    partes.push('status = ?');
    args.push(filtro.status);
  }
  if (filtro.competencia) {
    partes.push('competencia = ?');
    args.push(filtro.competencia);
  }
  return obterBanco()
    .prepare<unknown[], LinhaPeriodo>(
      `SELECT * FROM periodos_comissao WHERE ${partes.join(' AND ')} ORDER BY ano DESC, semana DESC`,
    )
    .all(...args)
    .map(paraPeriodo);
}

export function buscarPeriodo(tenantId: string, id: string): PeriodoComissao | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaPeriodo>('SELECT * FROM periodos_comissao WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraPeriodo(linha) : null;
}

export function buscarPeriodoPorSemana(tenantId: string, ano: number, semana: number): PeriodoComissao | null {
  const linha = obterBanco()
    .prepare<[string, number, number], LinhaPeriodo>(
      'SELECT * FROM periodos_comissao WHERE tenant_id = ? AND ano = ? AND semana = ?',
    )
    .get(tenantId, ano, semana);
  return linha ? paraPeriodo(linha) : null;
}

export type DadosPeriodo = Omit<PeriodoComissao, 'id' | 'tenantId' | 'criadoEm' | 'fechadoEm' | 'pagoEm'>;

export function criarPeriodo(tenantId: string, dados: DadosPeriodo): PeriodoComissao {
  const periodo: PeriodoComissao = {
    ...dados,
    id: novoId('per'),
    tenantId,
    criadoEm: agora(),
    fechadoEm: null,
    pagoEm: null,
  };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO periodos_comissao (
         id, tenant_id, ano, semana, data_inicio, data_fim, competencia, valor_arrecadado, percentual_retencao,
         criterio_rateio, status, data_pagamento, total_distribuido, observacoes, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      periodo.id,
      tenantId,
      periodo.ano,
      periodo.semana,
      periodo.dataInicio,
      periodo.dataFim,
      periodo.competencia,
      periodo.valorArrecadado,
      periodo.percentualRetencao,
      periodo.criterioRateio,
      periodo.status,
      periodo.dataPagamento ?? null,
      periodo.totalDistribuido,
      periodo.observacoes ?? null,
      periodo.criadoEm,
    );
  return periodo;
}

export function atualizarPeriodo(tenantId: string, periodo: PeriodoComissao): void {
  obterBanco()
    .prepare<unknown[], unknown>(
      `UPDATE periodos_comissao SET valor_arrecadado = ?, percentual_retencao = ?, criterio_rateio = ?, status = ?,
         data_pagamento = ?, total_distribuido = ?, observacoes = ?, fechado_em = ?, pago_em = ?
       WHERE tenant_id = ? AND id = ?`,
    )
    .run(
      periodo.valorArrecadado,
      periodo.percentualRetencao,
      periodo.criterioRateio,
      periodo.status,
      periodo.dataPagamento ?? null,
      periodo.totalDistribuido,
      periodo.observacoes ?? null,
      periodo.fechadoEm ?? null,
      periodo.pagoEm ?? null,
      tenantId,
      periodo.id,
    );
}

export function listarLancamentos(tenantId: string, periodoId: string): LancamentoComissao[] {
  return obterBanco()
    .prepare<[string, string], LinhaLancamento>(
      'SELECT * FROM lancamentos_comissao WHERE tenant_id = ? AND periodo_id = ?',
    )
    .all(tenantId, periodoId)
    .map(paraLancamento);
}

export interface DadosLancamento {
  colaboradorId: string;
  pontos: number;
  horas: number;
  ajuste: number;
  valor: number;
  observacao?: string | null;
}

/** Troca todos os lancamentos do periodo de uma vez (o rateio e sempre integral). */
export function substituirLancamentos(tenantId: string, periodoId: string, dados: DadosLancamento[]): void {
  const db = obterBanco();
  const apagar = db.prepare<[string, string], unknown>(
    'DELETE FROM lancamentos_comissao WHERE tenant_id = ? AND periodo_id = ?',
  );
  const inserir = db.prepare<unknown[], unknown>(
    `INSERT INTO lancamentos_comissao (id, tenant_id, periodo_id, colaborador_id, pontos, horas, ajuste, valor, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    apagar.run(tenantId, periodoId);
    for (const d of dados) {
      inserir.run(
        novoId('lcm'),
        tenantId,
        periodoId,
        d.colaboradorId,
        d.pontos,
        d.horas,
        d.ajuste,
        d.valor,
        d.observacao ?? null,
      );
    }
  })();
}

export function detalharPeriodo(tenantId: string, periodoId: string): PeriodoComissaoDetalhado | null {
  const periodo = buscarPeriodo(tenantId, periodoId);
  if (!periodo) return null;

  const linhas = obterBanco()
    .prepare<[string, string], LinhaLancamento & { colaborador_nome: string; funcao: string; centro_custo: string }>(
      `SELECT l.*, c.nome AS colaborador_nome, c.funcao, c.centro_custo
         FROM lancamentos_comissao l
         JOIN colaboradores c ON c.id = l.colaborador_id AND c.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND l.periodo_id = ?
        ORDER BY c.nome`,
    )
    .all(tenantId, periodoId);

  return {
    ...periodo,
    lancamentos: linhas.map((l) => ({
      ...paraLancamento(l),
      colaboradorNome: l.colaborador_nome,
      funcao: l.funcao,
      centroCusto: l.centro_custo,
    })),
  };
}

/**
 * Soma das comissoes ja pagas na competencia por colaborador.
 *
 * Somente periodos `PAGO` entram: sao esses os valores que o colaborador ja
 * recebeu na semana e que precisam ser abatidos do liquido da folha mensal.
 */
export function comissoesPagasNaCompetencia(tenantId: string, competencia: Competencia): Map<string, number> {
  const linhas = obterBanco()
    .prepare<[string, string], { colaborador_id: string; total: number }>(
      `SELECT l.colaborador_id, SUM(l.valor) AS total
         FROM lancamentos_comissao l
         JOIN periodos_comissao p ON p.id = l.periodo_id AND p.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND p.competencia = ? AND p.status = 'PAGO'
        GROUP BY l.colaborador_id`,
    )
    .all(tenantId, competencia);
  return new Map(linhas.map((l) => [l.colaborador_id, l.total]));
}

/**
 * Comissoes ainda nao pagas (periodos ABERTO/FECHADO) da competencia.
 * Entram como provento na folha, ja que o colaborador ainda nao recebeu.
 */
export function comissoesAPagarNaCompetencia(tenantId: string, competencia: Competencia): Map<string, number> {
  const linhas = obterBanco()
    .prepare<[string, string], { colaborador_id: string; total: number }>(
      `SELECT l.colaborador_id, SUM(l.valor) AS total
         FROM lancamentos_comissao l
         JOIN periodos_comissao p ON p.id = l.periodo_id AND p.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND p.competencia = ? AND p.status <> 'PAGO'
        GROUP BY l.colaborador_id`,
    )
    .all(tenantId, competencia);
  return new Map(linhas.map((l) => [l.colaborador_id, l.total]));
}

/** Comissoes por competencia de um colaborador — base das medias de ferias/13o/rescisao. */
export function historicoComissoes(
  tenantId: string,
  colaboradorId: string,
  deCompetencia: Competencia,
  ateCompetencia: Competencia,
): Map<Competencia, number> {
  const linhas = obterBanco()
    .prepare<[string, string, string, string], { competencia: string; total: number }>(
      `SELECT p.competencia AS competencia, SUM(l.valor) AS total
         FROM lancamentos_comissao l
         JOIN periodos_comissao p ON p.id = l.periodo_id AND p.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND l.colaborador_id = ? AND p.competencia BETWEEN ? AND ?
        GROUP BY p.competencia ORDER BY p.competencia`,
    )
    .all(tenantId, colaboradorId, deCompetencia, ateCompetencia);
  return new Map(linhas.map((l) => [l.competencia, l.total]));
}

/** Total de comissoes por competencia de todos os colaboradores, em um unico SELECT. */
export function comissoesPorColaboradorNoIntervalo(
  tenantId: string,
  deCompetencia: Competencia,
  ateCompetencia: Competencia,
): Map<string, Map<Competencia, number>> {
  const linhas = obterBanco()
    .prepare<[string, string, string], { colaborador_id: string; competencia: string; total: number }>(
      `SELECT l.colaborador_id, p.competencia AS competencia, SUM(l.valor) AS total
         FROM lancamentos_comissao l
         JOIN periodos_comissao p ON p.id = l.periodo_id AND p.tenant_id = l.tenant_id
        WHERE l.tenant_id = ? AND p.competencia BETWEEN ? AND ?
        GROUP BY l.colaborador_id, p.competencia`,
    )
    .all(tenantId, deCompetencia, ateCompetencia);

  const mapa = new Map<string, Map<Competencia, number>>();
  for (const l of linhas) {
    const porCompetencia = mapa.get(l.colaborador_id) ?? new Map<Competencia, number>();
    porCompetencia.set(l.competencia, l.total);
    mapa.set(l.colaborador_id, porCompetencia);
  }
  return mapa;
}
