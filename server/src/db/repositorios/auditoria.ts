import { agora, novoId, obterBanco } from '../conexao.js';
import { gravarJSON, lerJSON } from './comum.js';

export interface RegistroAuditoria {
  id: string;
  tenantId: string;
  usuarioId: string | null;
  acao: string;
  recurso: string;
  recursoId: string | null;
  detalhes: Record<string, unknown> | null;
  criadoEm: string;
}

interface LinhaAuditoria {
  id: string;
  tenant_id: string;
  usuario_id: string | null;
  acao: string;
  recurso: string;
  recurso_id: string | null;
  detalhes: string | null;
  criado_em: string;
}

/**
 * Registra uma acao sensivel (fechamento de folha, geracao de remessa, etc.).
 * Falhas aqui nao podem derrubar a operacao de negocio: a auditoria e
 * complementar, nao transacional.
 */
export function registrar(
  tenantId: string,
  usuarioId: string | null,
  acao: string,
  recurso: string,
  recursoId: string | null,
  detalhes?: Record<string, unknown>,
): void {
  try {
    obterBanco()
      .prepare<unknown[], unknown>(
        `INSERT INTO auditoria (id, tenant_id, usuario_id, acao, recurso, recurso_id, detalhes, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(novoId('aud'), tenantId, usuarioId, acao, recurso, recursoId, detalhes ? gravarJSON(detalhes) : null, agora());
  } catch {
    // Silencioso de proposito: ver comentario acima.
  }
}

export function listarAuditoria(tenantId: string, limite = 100): RegistroAuditoria[] {
  return obterBanco()
    .prepare<[string, number], LinhaAuditoria>(
      'SELECT * FROM auditoria WHERE tenant_id = ? ORDER BY criado_em DESC LIMIT ?',
    )
    .all(tenantId, limite)
    .map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      usuarioId: l.usuario_id,
      acao: l.acao,
      recurso: l.recurso,
      recursoId: l.recurso_id,
      detalhes: lerJSON<Record<string, unknown> | null>(l.detalhes, null),
      criadoEm: l.criado_em,
    }));
}
