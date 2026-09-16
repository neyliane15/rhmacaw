import type { Competencia, DataISO, Falta, FaltaEntrada, TipoFalta } from '@rhmacaw/shared';
import { primeiroDiaDaCompetencia, ultimoDiaDaCompetencia } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';

interface LinhaFalta {
  id: string;
  tenant_id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  horas: number | null;
  justificativa: string | null;
  documento: string | null;
  registrado_por: string | null;
  criado_em: string;
}

const paraFalta = (l: LinhaFalta): Falta => ({
  id: l.id,
  tenantId: l.tenant_id,
  colaboradorId: l.colaborador_id,
  data: l.data,
  tipo: l.tipo as TipoFalta,
  horas: l.horas,
  justificativa: l.justificativa,
  documento: l.documento,
  registradoPor: l.registrado_por,
  criadoEm: l.criado_em,
});

export interface FiltroFaltas {
  colaboradorId?: string | undefined;
  competencia?: Competencia | undefined;
  tipo?: TipoFalta | undefined;
  de?: DataISO | undefined;
  ate?: DataISO | undefined;
}

export function listarFaltas(tenantId: string, filtro: FiltroFaltas = {}): Falta[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];

  if (filtro.colaboradorId) {
    partes.push('colaborador_id = ?');
    args.push(filtro.colaboradorId);
  }
  if (filtro.tipo) {
    partes.push('tipo = ?');
    args.push(filtro.tipo);
  }
  if (filtro.competencia) {
    partes.push('data BETWEEN ? AND ?');
    args.push(primeiroDiaDaCompetencia(filtro.competencia), ultimoDiaDaCompetencia(filtro.competencia));
  }
  if (filtro.de) {
    partes.push('data >= ?');
    args.push(filtro.de);
  }
  if (filtro.ate) {
    partes.push('data <= ?');
    args.push(filtro.ate);
  }

  return obterBanco()
    .prepare<unknown[], LinhaFalta>(
      `SELECT * FROM faltas WHERE ${partes.join(' AND ')} ORDER BY data DESC, colaborador_id`,
    )
    .all(...args)
    .map(paraFalta);
}

/** Faltas da competencia agrupadas por colaborador — evita N+1 no fechamento da folha. */
export function faltasPorColaboradorNaCompetencia(tenantId: string, competencia: Competencia): Map<string, Falta[]> {
  const mapa = new Map<string, Falta[]>();
  for (const falta of listarFaltas(tenantId, { competencia })) {
    const atual = mapa.get(falta.colaboradorId);
    if (atual) atual.push(falta);
    else mapa.set(falta.colaboradorId, [falta]);
  }
  return mapa;
}

export function buscarFalta(tenantId: string, id: string): Falta | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaFalta>('SELECT * FROM faltas WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraFalta(linha) : null;
}

export function criarFalta(tenantId: string, dados: FaltaEntrada): Falta {
  const falta: Falta = { ...dados, id: novoId('flt'), tenantId, criadoEm: agora() };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO faltas (id, tenant_id, colaborador_id, data, tipo, horas, justificativa, documento, registrado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      falta.id,
      tenantId,
      falta.colaboradorId,
      falta.data,
      falta.tipo,
      falta.horas ?? null,
      falta.justificativa ?? null,
      falta.documento ?? null,
      falta.registradoPor ?? null,
      falta.criadoEm,
    );
  return falta;
}

export function atualizarFalta(tenantId: string, id: string, dados: Partial<FaltaEntrada>): Falta | null {
  const atual = buscarFalta(tenantId, id);
  if (!atual) return null;
  const novo: Falta = {
    ...atual,
    ...dados,
    horas: dados.horas === undefined ? atual.horas : dados.horas,
  };
  obterBanco()
    .prepare<unknown[], unknown>(
      `UPDATE faltas SET colaborador_id = ?, data = ?, tipo = ?, horas = ?, justificativa = ?, documento = ?
       WHERE tenant_id = ? AND id = ?`,
    )
    .run(
      novo.colaboradorId,
      novo.data,
      novo.tipo,
      novo.horas ?? null,
      novo.justificativa ?? null,
      novo.documento ?? null,
      tenantId,
      id,
    );
  return novo;
}

export function removerFalta(tenantId: string, id: string): boolean {
  return (
    obterBanco()
      .prepare<[string, string], unknown>('DELETE FROM faltas WHERE tenant_id = ? AND id = ?')
      .run(tenantId, id).changes > 0
  );
}

export function contarFaltasNoIntervalo(
  tenantId: string,
  colaboradorId: string,
  de: DataISO,
  ate: DataISO,
  tipos: readonly TipoFalta[],
): number {
  if (tipos.length === 0) return 0;
  const marcadores = tipos.map(() => '?').join(', ');
  return (
    obterBanco()
      .prepare<unknown[], { total: number }>(
        `SELECT COUNT(*) AS total FROM faltas
         WHERE tenant_id = ? AND colaborador_id = ? AND data BETWEEN ? AND ? AND tipo IN (${marcadores})`,
      )
      .get(tenantId, colaboradorId, de, ate, ...tipos)?.total ?? 0
  );
}
