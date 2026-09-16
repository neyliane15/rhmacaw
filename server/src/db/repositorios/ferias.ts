import type { Competencia, Ferias, StatusFerias } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';
import { deBooleano, paraBooleano } from './comum.js';

interface LinhaFerias {
  id: string;
  tenant_id: string;
  colaborador_id: string;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  inicio_gozo: string;
  fim_gozo: string;
  dias_gozo: number;
  dias_abono: number;
  adiantar_decimo_terceiro: number;
  status: string;
  valor_ferias: number;
  valor_terco: number;
  valor_abono: number;
  valor_terco_abono: number;
  valor_adiantamento_decimo: number;
  inss: number;
  irrf: number;
  liquido: number;
  competencia_pagamento: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

const paraFerias = (l: LinhaFerias): Ferias => ({
  id: l.id,
  tenantId: l.tenant_id,
  colaboradorId: l.colaborador_id,
  periodoAquisitivoInicio: l.periodo_aquisitivo_inicio,
  periodoAquisitivoFim: l.periodo_aquisitivo_fim,
  inicioGozo: l.inicio_gozo,
  fimGozo: l.fim_gozo,
  diasGozo: l.dias_gozo,
  diasAbono: l.dias_abono,
  adiantarDecimoTerceiro: paraBooleano(l.adiantar_decimo_terceiro),
  status: l.status as StatusFerias,
  valorFerias: l.valor_ferias,
  valorTerco: l.valor_terco,
  valorAbono: l.valor_abono,
  valorTercoAbono: l.valor_terco_abono,
  valorAdiantamentoDecimo: l.valor_adiantamento_decimo,
  inss: l.inss,
  irrf: l.irrf,
  liquido: l.liquido,
  competenciaPagamento: l.competencia_pagamento,
  observacoes: l.observacoes,
  criadoEm: l.criado_em,
  atualizadoEm: l.atualizado_em,
});

export interface FiltroFerias {
  colaboradorId?: string | undefined;
  status?: StatusFerias | undefined;
  ano?: number | undefined;
}

export function listarFerias(tenantId: string, filtro: FiltroFerias = {}): Ferias[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];

  if (filtro.colaboradorId) {
    partes.push('colaborador_id = ?');
    args.push(filtro.colaboradorId);
  }
  if (filtro.status) {
    partes.push('status = ?');
    args.push(filtro.status);
  }
  if (filtro.ano) {
    // O ano filtra pelo inicio do gozo: e como o RH enxerga a escala de ferias.
    partes.push('inicio_gozo BETWEEN ? AND ?');
    args.push(`${filtro.ano}-01-01`, `${filtro.ano}-12-31`);
  }

  return obterBanco()
    .prepare<unknown[], LinhaFerias>(`SELECT * FROM ferias WHERE ${partes.join(' AND ')} ORDER BY inicio_gozo DESC`)
    .all(...args)
    .map(paraFerias);
}

export function buscarFerias(tenantId: string, id: string): Ferias | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaFerias>('SELECT * FROM ferias WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraFerias(linha) : null;
}

/** Dias ja gozados (ou em gozo) por colaborador, usados no calculo do saldo. */
export function diasGozadosPorColaborador(tenantId: string): Map<string, number> {
  const linhas = obterBanco()
    .prepare<[string], { colaborador_id: string; dias: number }>(
      `SELECT colaborador_id, SUM(dias_gozo + dias_abono) AS dias FROM ferias
       WHERE tenant_id = ? AND status IN ('PROGRAMADA', 'EM_GOZO', 'CONCLUIDA')
       GROUP BY colaborador_id`,
    )
    .all(tenantId);
  return new Map(linhas.map((l) => [l.colaborador_id, l.dias]));
}

export type DadosFerias = Omit<Ferias, 'id' | 'tenantId' | 'criadoEm' | 'atualizadoEm'>;

export function criarFeriasNoBanco(tenantId: string, dados: DadosFerias): Ferias {
  const carimbo = agora();
  const ferias: Ferias = { ...dados, id: novoId('fer'), tenantId, criadoEm: carimbo, atualizadoEm: carimbo };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO ferias (
         id, tenant_id, colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim, inicio_gozo, fim_gozo,
         dias_gozo, dias_abono, adiantar_decimo_terceiro, status, valor_ferias, valor_terco, valor_abono,
         valor_terco_abono, valor_adiantamento_decimo, inss, irrf, liquido, competencia_pagamento, observacoes,
         criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ferias.id,
      tenantId,
      ferias.colaboradorId,
      ferias.periodoAquisitivoInicio,
      ferias.periodoAquisitivoFim,
      ferias.inicioGozo,
      ferias.fimGozo,
      ferias.diasGozo,
      ferias.diasAbono,
      deBooleano(ferias.adiantarDecimoTerceiro),
      ferias.status,
      ferias.valorFerias,
      ferias.valorTerco,
      ferias.valorAbono,
      ferias.valorTercoAbono,
      ferias.valorAdiantamentoDecimo,
      ferias.inss,
      ferias.irrf,
      ferias.liquido,
      ferias.competenciaPagamento ?? null,
      ferias.observacoes ?? null,
      carimbo,
      carimbo,
    );
  return ferias;
}

export function substituirFerias(tenantId: string, id: string, dados: DadosFerias): Ferias | null {
  const atual = buscarFerias(tenantId, id);
  if (!atual) return null;
  const carimbo = agora();
  obterBanco()
    .prepare<unknown[], unknown>(
      `UPDATE ferias SET colaborador_id = ?, periodo_aquisitivo_inicio = ?, periodo_aquisitivo_fim = ?,
         inicio_gozo = ?, fim_gozo = ?, dias_gozo = ?, dias_abono = ?, adiantar_decimo_terceiro = ?, status = ?,
         valor_ferias = ?, valor_terco = ?, valor_abono = ?, valor_terco_abono = ?, valor_adiantamento_decimo = ?,
         inss = ?, irrf = ?, liquido = ?, competencia_pagamento = ?, observacoes = ?, atualizado_em = ?
       WHERE tenant_id = ? AND id = ?`,
    )
    .run(
      dados.colaboradorId,
      dados.periodoAquisitivoInicio,
      dados.periodoAquisitivoFim,
      dados.inicioGozo,
      dados.fimGozo,
      dados.diasGozo,
      dados.diasAbono,
      deBooleano(dados.adiantarDecimoTerceiro),
      dados.status,
      dados.valorFerias,
      dados.valorTerco,
      dados.valorAbono,
      dados.valorTercoAbono,
      dados.valorAdiantamentoDecimo,
      dados.inss,
      dados.irrf,
      dados.liquido,
      dados.competenciaPagamento ?? null,
      dados.observacoes ?? null,
      carimbo,
      tenantId,
      id,
    );
  return { ...dados, id, tenantId, criadoEm: atual.criadoEm, atualizadoEm: carimbo };
}

export function removerFerias(tenantId: string, id: string): boolean {
  return (
    obterBanco()
      .prepare<[string, string], unknown>('DELETE FROM ferias WHERE tenant_id = ? AND id = ?')
      .run(tenantId, id).changes > 0
  );
}

/** Dias de ferias gozados dentro da competencia, para abater da folha mensal. */
export function diasDeFeriasNaCompetencia(tenantId: string, competencia: Competencia): Map<string, number> {
  const inicio = `${competencia}-01`;
  const fim = `${competencia}-31`;
  const linhas = obterBanco()
    .prepare<[string, string, string], LinhaFerias>(
      `SELECT * FROM ferias WHERE tenant_id = ? AND status IN ('PROGRAMADA', 'EM_GOZO', 'CONCLUIDA')
         AND inicio_gozo <= ? AND fim_gozo >= ?`,
    )
    .all(tenantId, fim, inicio);

  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    // Conta apenas a interseccao do gozo com a competencia: ferias a cavalo
    // entre dois meses descontam proporcionalmente em cada folha.
    const de = linha.inicio_gozo > inicio ? linha.inicio_gozo : inicio;
    const ate = linha.fim_gozo < fim ? linha.fim_gozo : fim;
    const dias = Math.max(0, Number(ate.slice(8, 10)) - Number(de.slice(8, 10)) + 1);
    mapa.set(linha.colaborador_id, (mapa.get(linha.colaborador_id) ?? 0) + dias);
  }
  return mapa;
}
