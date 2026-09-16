import type { Competencia, Folha, StatusFolha, TipoFolha, Verba } from '@rhmacaw/shared';
import type { EntradaManualItem, FolhaCompleta, ItemFolhaCompleto } from '../../tipos.js';
import { agora, novoId, obterBanco } from '../conexao.js';
import { deBooleano, gravarJSON, lerJSON, paraBooleano } from './comum.js';

interface LinhaFolha {
  id: string;
  tenant_id: string;
  competencia: string;
  tipo: string;
  status: string;
  descricao: string | null;
  data_pagamento: string;
  total_proventos: number;
  total_descontos: number;
  total_liquido: number;
  total_comissoes_adiantadas: number;
  total_transferir: number;
  quantidade_colaboradores: number;
  criado_em: string;
  fechado_em: string | null;
  pago_em: string | null;
}

interface LinhaItem {
  id: string;
  tenant_id: string;
  folha_id: string;
  colaborador_id: string;
  colaborador_nome: string;
  funcao: string;
  centro_custo: string;
  salario_base: number;
  dias_trabalhados: number;
  faltas_dias: number;
  faltas_horas: number;
  desconto_faltas: number;
  desconto_dsr: number;
  comissoes: number;
  horas_extras: number;
  adicional_noturno: number;
  outros_proventos: number;
  desconto_vale_transporte: number;
  outros_descontos: number;
  base_inss: number;
  inss: number;
  base_irrf: number;
  irrf: number;
  base_fgts: number;
  fgts: number;
  salario_familia: number;
  total_proventos: number;
  total_descontos: number;
  salario_liquido: number;
  comissoes_adiantadas: number;
  valor_transferir: number;
  verbas: string;
  alertas: string;
  alertas_reconhecidos: number;
  entrada_manual: string | null;
  observacoes: string | null;
}

const paraFolha = (l: LinhaFolha): Folha => ({
  id: l.id,
  tenantId: l.tenant_id,
  competencia: l.competencia,
  tipo: l.tipo as TipoFolha,
  status: l.status as StatusFolha,
  descricao: l.descricao,
  dataPagamento: l.data_pagamento,
  totalProventos: l.total_proventos,
  totalDescontos: l.total_descontos,
  totalLiquido: l.total_liquido,
  totalComissoesAdiantadas: l.total_comissoes_adiantadas,
  totalTransferir: l.total_transferir,
  quantidadeColaboradores: l.quantidade_colaboradores,
  criadoEm: l.criado_em,
  fechadoEm: l.fechado_em,
  pagoEm: l.pago_em,
});

const paraItem = (l: LinhaItem): ItemFolhaCompleto => ({
  id: l.id,
  tenantId: l.tenant_id,
  folhaId: l.folha_id,
  colaboradorId: l.colaborador_id,
  colaboradorNome: l.colaborador_nome,
  funcao: l.funcao,
  centroCusto: l.centro_custo,
  salarioBase: l.salario_base,
  diasTrabalhados: l.dias_trabalhados,
  faltasDias: l.faltas_dias,
  faltasHoras: l.faltas_horas,
  descontoFaltas: l.desconto_faltas,
  descontoDSR: l.desconto_dsr,
  comissoes: l.comissoes,
  horasExtras: l.horas_extras,
  adicionalNoturno: l.adicional_noturno,
  outrosProventos: l.outros_proventos,
  descontoValeTransporte: l.desconto_vale_transporte,
  outrosDescontos: l.outros_descontos,
  baseINSS: l.base_inss,
  inss: l.inss,
  baseIRRF: l.base_irrf,
  irrf: l.irrf,
  baseFGTS: l.base_fgts,
  fgts: l.fgts,
  salarioFamilia: l.salario_familia,
  totalProventos: l.total_proventos,
  totalDescontos: l.total_descontos,
  salarioLiquido: l.salario_liquido,
  comissoesAdiantadas: l.comissoes_adiantadas,
  valorTransferir: l.valor_transferir,
  verbas: lerJSON<Verba[]>(l.verbas, []),
  alertas: lerJSON<string[]>(l.alertas, []),
  alertasReconhecidos: paraBooleano(l.alertas_reconhecidos),
  entradaManual: lerJSON<EntradaManualItem | null>(l.entrada_manual, null),
  observacoes: l.observacoes,
});

export interface FiltroFolhas {
  competencia?: Competencia | undefined;
  tipo?: TipoFolha | undefined;
  status?: StatusFolha | undefined;
}

export function listarFolhas(tenantId: string, filtro: FiltroFolhas = {}): Folha[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];
  if (filtro.competencia) {
    partes.push('competencia = ?');
    args.push(filtro.competencia);
  }
  if (filtro.tipo) {
    partes.push('tipo = ?');
    args.push(filtro.tipo);
  }
  if (filtro.status) {
    partes.push('status = ?');
    args.push(filtro.status);
  }
  return obterBanco()
    .prepare<unknown[], LinhaFolha>(
      `SELECT * FROM folhas WHERE ${partes.join(' AND ')} ORDER BY competencia DESC, tipo`,
    )
    .all(...args)
    .map(paraFolha);
}

export function buscarFolha(tenantId: string, id: string): Folha | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaFolha>('SELECT * FROM folhas WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraFolha(linha) : null;
}

/** Folha viva (nao cancelada) da competencia/tipo — no maximo uma, pelo indice unico. */
export function buscarFolhaAtiva(tenantId: string, competencia: Competencia, tipo: TipoFolha): Folha | null {
  const linha = obterBanco()
    .prepare<[string, string, string], LinhaFolha>(
      `SELECT * FROM folhas WHERE tenant_id = ? AND competencia = ? AND tipo = ? AND status <> 'CANCELADA'`,
    )
    .get(tenantId, competencia, tipo);
  return linha ? paraFolha(linha) : null;
}

/** Existe folha travada (FECHADA/PAGA) nesta competencia? Bloqueia faltas e ferias. */
export function existeFolhaTravada(tenantId: string, competencia: Competencia): Folha | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaFolha>(
      `SELECT * FROM folhas WHERE tenant_id = ? AND competencia = ? AND status IN ('FECHADA', 'PAGA') LIMIT 1`,
    )
    .get(tenantId, competencia);
  return linha ? paraFolha(linha) : null;
}

export function listarItens(tenantId: string, folhaId: string): ItemFolhaCompleto[] {
  return obterBanco()
    .prepare<[string, string], LinhaItem>(
      'SELECT * FROM itens_folha WHERE tenant_id = ? AND folha_id = ? ORDER BY centro_custo, colaborador_nome',
    )
    .all(tenantId, folhaId)
    .map(paraItem);
}

export function buscarItem(tenantId: string, folhaId: string, colaboradorId: string): ItemFolhaCompleto | null {
  const linha = obterBanco()
    .prepare<[string, string, string], LinhaItem>(
      'SELECT * FROM itens_folha WHERE tenant_id = ? AND folha_id = ? AND colaborador_id = ?',
    )
    .get(tenantId, folhaId, colaboradorId);
  return linha ? paraItem(linha) : null;
}

export function detalharFolha(tenantId: string, folhaId: string): FolhaCompleta | null {
  const folha = buscarFolha(tenantId, folhaId);
  if (!folha) return null;
  return { ...folha, itens: listarItens(tenantId, folhaId) };
}

export type DadosFolha = Omit<Folha, 'id' | 'tenantId' | 'criadoEm' | 'fechadoEm' | 'pagoEm'>;

export function criarFolha(tenantId: string, dados: DadosFolha): Folha {
  const folha: Folha = { ...dados, id: novoId('flh'), tenantId, criadoEm: agora(), fechadoEm: null, pagoEm: null };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO folhas (
         id, tenant_id, competencia, tipo, status, descricao, data_pagamento, total_proventos, total_descontos,
         total_liquido, total_comissoes_adiantadas, total_transferir, quantidade_colaboradores, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      folha.id,
      tenantId,
      folha.competencia,
      folha.tipo,
      folha.status,
      folha.descricao ?? null,
      folha.dataPagamento,
      folha.totalProventos,
      folha.totalDescontos,
      folha.totalLiquido,
      folha.totalComissoesAdiantadas,
      folha.totalTransferir,
      folha.quantidadeColaboradores,
      folha.criadoEm,
    );
  return folha;
}

export function atualizarFolha(tenantId: string, folha: Folha): void {
  obterBanco()
    .prepare<unknown[], unknown>(
      `UPDATE folhas SET status = ?, descricao = ?, data_pagamento = ?, total_proventos = ?, total_descontos = ?,
         total_liquido = ?, total_comissoes_adiantadas = ?, total_transferir = ?, quantidade_colaboradores = ?,
         fechado_em = ?, pago_em = ?
       WHERE tenant_id = ? AND id = ?`,
    )
    .run(
      folha.status,
      folha.descricao ?? null,
      folha.dataPagamento,
      folha.totalProventos,
      folha.totalDescontos,
      folha.totalLiquido,
      folha.totalComissoesAdiantadas,
      folha.totalTransferir,
      folha.quantidadeColaboradores,
      folha.fechadoEm ?? null,
      folha.pagoEm ?? null,
      tenantId,
      folha.id,
    );
}

export type DadosItem = Omit<ItemFolhaCompleto, 'id' | 'tenantId' | 'folhaId'>;

const SQL_UPSERT_ITEM = `
INSERT INTO itens_folha (
  id, tenant_id, folha_id, colaborador_id, colaborador_nome, funcao, centro_custo, salario_base, dias_trabalhados,
  faltas_dias, faltas_horas, desconto_faltas, desconto_dsr, comissoes, horas_extras, adicional_noturno,
  outros_proventos, desconto_vale_transporte, outros_descontos, base_inss, inss, base_irrf, irrf, base_fgts, fgts,
  salario_familia, total_proventos, total_descontos, salario_liquido, comissoes_adiantadas, valor_transferir,
  verbas, alertas, alertas_reconhecidos, entrada_manual, observacoes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (folha_id, colaborador_id) DO UPDATE SET
  colaborador_nome = excluded.colaborador_nome, funcao = excluded.funcao, centro_custo = excluded.centro_custo,
  salario_base = excluded.salario_base, dias_trabalhados = excluded.dias_trabalhados,
  faltas_dias = excluded.faltas_dias, faltas_horas = excluded.faltas_horas,
  desconto_faltas = excluded.desconto_faltas, desconto_dsr = excluded.desconto_dsr, comissoes = excluded.comissoes,
  horas_extras = excluded.horas_extras, adicional_noturno = excluded.adicional_noturno,
  outros_proventos = excluded.outros_proventos, desconto_vale_transporte = excluded.desconto_vale_transporte,
  outros_descontos = excluded.outros_descontos, base_inss = excluded.base_inss, inss = excluded.inss,
  base_irrf = excluded.base_irrf, irrf = excluded.irrf, base_fgts = excluded.base_fgts, fgts = excluded.fgts,
  salario_familia = excluded.salario_familia, total_proventos = excluded.total_proventos,
  total_descontos = excluded.total_descontos, salario_liquido = excluded.salario_liquido,
  comissoes_adiantadas = excluded.comissoes_adiantadas, valor_transferir = excluded.valor_transferir,
  verbas = excluded.verbas, alertas = excluded.alertas, alertas_reconhecidos = excluded.alertas_reconhecidos,
  entrada_manual = excluded.entrada_manual, observacoes = excluded.observacoes`;

function argumentosItem(tenantId: string, folhaId: string, item: DadosItem): unknown[] {
  return [
    novoId('itf'),
    tenantId,
    folhaId,
    item.colaboradorId,
    item.colaboradorNome,
    item.funcao,
    item.centroCusto,
    item.salarioBase,
    item.diasTrabalhados,
    item.faltasDias,
    item.faltasHoras,
    item.descontoFaltas,
    item.descontoDSR,
    item.comissoes,
    item.horasExtras,
    item.adicionalNoturno,
    item.outrosProventos,
    item.descontoValeTransporte,
    item.outrosDescontos,
    item.baseINSS,
    item.inss,
    item.baseIRRF,
    item.irrf,
    item.baseFGTS,
    item.fgts,
    item.salarioFamilia,
    item.totalProventos,
    item.totalDescontos,
    item.salarioLiquido,
    item.comissoesAdiantadas,
    item.valorTransferir,
    gravarJSON(item.verbas),
    gravarJSON(item.alertas),
    deBooleano(item.alertasReconhecidos),
    item.entradaManual ? gravarJSON(item.entradaManual) : null,
    item.observacoes ?? null,
  ];
}

export function gravarItem(tenantId: string, folhaId: string, item: DadosItem): void {
  obterBanco().prepare<unknown[], unknown>(SQL_UPSERT_ITEM).run(...argumentosItem(tenantId, folhaId, item));
}

/**
 * Substitui o conjunto de itens da folha. Quem sumiu da lista (colaborador
 * demitido, filtro de centro de custo trocado) e removido para que os totais
 * da folha e o arquivo do banco batam.
 */
export function substituirItens(tenantId: string, folhaId: string, itens: DadosItem[]): void {
  const db = obterBanco();
  const upsert = db.prepare<unknown[], unknown>(SQL_UPSERT_ITEM);
  const apagarSobras = db.prepare<[string, string], unknown>(
    'DELETE FROM itens_folha WHERE tenant_id = ? AND folha_id = ?',
  );
  db.transaction(() => {
    apagarSobras.run(tenantId, folhaId);
    for (const item of itens) upsert.run(...argumentosItem(tenantId, folhaId, item));
  })();
}

export function marcarAlertasReconhecidos(tenantId: string, folhaId: string): void {
  obterBanco()
    .prepare<[string, string], unknown>(
      'UPDATE itens_folha SET alertas_reconhecidos = 1 WHERE tenant_id = ? AND folha_id = ?',
    )
    .run(tenantId, folhaId);
}

/** Itens de um colaborador ao longo do tempo — usado na linha do tempo do cadastro. */
export function itensDoColaborador(tenantId: string, colaboradorId: string): (ItemFolhaCompleto & { competencia: Competencia; tipo: TipoFolha; status: StatusFolha })[] {
  return obterBanco()
    .prepare<[string, string], LinhaItem & { competencia: string; tipo: string; status: string }>(
      `SELECT i.*, f.competencia, f.tipo, f.status
         FROM itens_folha i
         JOIN folhas f ON f.id = i.folha_id AND f.tenant_id = i.tenant_id
        WHERE i.tenant_id = ? AND i.colaborador_id = ?
        ORDER BY f.competencia DESC`,
    )
    .all(tenantId, colaboradorId)
    .map((l) => ({
      ...paraItem(l),
      competencia: l.competencia,
      tipo: l.tipo as TipoFolha,
      status: l.status as StatusFolha,
    }));
}
