import type { LayoutBancario, OrigemRemessa, Remessa, StatusRemessa } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';
import { gravarJSON, lerJSON } from './comum.js';

interface LinhaRemessa {
  id: string;
  tenant_id: string;
  origem: string;
  origem_id: string;
  descricao: string;
  layout: string;
  banco_codigo: string;
  data_pagamento: string;
  numero_remessa: number;
  quantidade_pagamentos: number;
  valor_total: number;
  nome_arquivo: string;
  conteudo: string;
  status: string;
  inconsistencias: string;
  gerado_por: string | null;
  criado_em: string;
  enviado_em: string | null;
  confirmado_em: string | null;
}

const paraRemessa = (l: LinhaRemessa): Remessa => ({
  id: l.id,
  tenantId: l.tenant_id,
  origem: l.origem as OrigemRemessa,
  origemId: l.origem_id,
  descricao: l.descricao,
  layout: l.layout as LayoutBancario,
  bancoCodigo: l.banco_codigo,
  dataPagamento: l.data_pagamento,
  numeroRemessa: l.numero_remessa,
  quantidadePagamentos: l.quantidade_pagamentos,
  valorTotal: l.valor_total,
  nomeArquivo: l.nome_arquivo,
  conteudo: l.conteudo,
  status: l.status as StatusRemessa,
  inconsistencias: lerJSON<string[]>(l.inconsistencias, []),
  geradoPor: l.gerado_por,
  criadoEm: l.criado_em,
  enviadoEm: l.enviado_em,
  confirmadoEm: l.confirmado_em,
});

export interface FiltroRemessas {
  origem?: OrigemRemessa | undefined;
  status?: StatusRemessa | undefined;
  origemId?: string | undefined;
}

/**
 * Lista as remessas. O conteudo do arquivo e omitido de proposito: uma remessa
 * de 40 pagamentos tem ~25 KB e a listagem so precisa dos metadados.
 */
export function listarRemessas(tenantId: string, filtro: FiltroRemessas = {}): Omit<Remessa, 'conteudo'>[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];
  if (filtro.origem) {
    partes.push('origem = ?');
    args.push(filtro.origem);
  }
  if (filtro.status) {
    partes.push('status = ?');
    args.push(filtro.status);
  }
  if (filtro.origemId) {
    partes.push('origem_id = ?');
    args.push(filtro.origemId);
  }
  return obterBanco()
    .prepare<unknown[], LinhaRemessa>(
      `SELECT id, tenant_id, origem, origem_id, descricao, layout, banco_codigo, data_pagamento, numero_remessa,
              quantidade_pagamentos, valor_total, nome_arquivo, '' AS conteudo, status, inconsistencias, gerado_por,
              criado_em, enviado_em, confirmado_em
         FROM remessas WHERE ${partes.join(' AND ')} ORDER BY criado_em DESC`,
    )
    .all(...args)
    .map((l) => {
      const { conteudo: _omitido, ...resto } = paraRemessa(l);
      return resto;
    });
}

export function buscarRemessa(tenantId: string, id: string): Remessa | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaRemessa>('SELECT * FROM remessas WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraRemessa(linha) : null;
}

/** Remessa ainda valida para a origem (regra 4: so pode haver uma). */
export function buscarRemessaAtiva(tenantId: string, origem: OrigemRemessa, origemId: string): Remessa | null {
  const linha = obterBanco()
    .prepare<[string, string, string], LinhaRemessa>(
      `SELECT * FROM remessas WHERE tenant_id = ? AND origem = ? AND origem_id = ? AND status <> 'CANCELADA'`,
    )
    .get(tenantId, origem, origemId);
  return linha ? paraRemessa(linha) : null;
}

export type DadosRemessa = Omit<Remessa, 'id' | 'tenantId' | 'criadoEm' | 'enviadoEm' | 'confirmadoEm'>;

export function criarRemessa(tenantId: string, dados: DadosRemessa): Remessa {
  const remessa: Remessa = {
    ...dados,
    id: novoId('rem'),
    tenantId,
    criadoEm: agora(),
    enviadoEm: null,
    confirmadoEm: null,
  };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO remessas (
         id, tenant_id, origem, origem_id, descricao, layout, banco_codigo, data_pagamento, numero_remessa,
         quantidade_pagamentos, valor_total, nome_arquivo, conteudo, status, inconsistencias, gerado_por, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      remessa.id,
      tenantId,
      remessa.origem,
      remessa.origemId,
      remessa.descricao,
      remessa.layout,
      remessa.bancoCodigo,
      remessa.dataPagamento,
      remessa.numeroRemessa,
      remessa.quantidadePagamentos,
      remessa.valorTotal,
      remessa.nomeArquivo,
      remessa.conteudo,
      remessa.status,
      gravarJSON(remessa.inconsistencias),
      remessa.geradoPor ?? null,
      remessa.criadoEm,
    );
  return remessa;
}

export function atualizarStatusRemessa(tenantId: string, remessa: Remessa): void {
  obterBanco()
    .prepare<unknown[], unknown>(
      'UPDATE remessas SET status = ?, enviado_em = ?, confirmado_em = ? WHERE tenant_id = ? AND id = ?',
    )
    .run(remessa.status, remessa.enviadoEm ?? null, remessa.confirmadoEm ?? null, tenantId, remessa.id);
}

export function contarRemessasPendentes(tenantId: string): number {
  return (
    obterBanco()
      .prepare<[string], { total: number }>(
        `SELECT COUNT(*) AS total FROM remessas WHERE tenant_id = ? AND status IN ('GERADA', 'ENVIADA')`,
      )
      .get(tenantId)?.total ?? 0
  );
}
