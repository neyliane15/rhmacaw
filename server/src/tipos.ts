/**
 * Tipos proprios do servidor — sempre extensoes do contrato de `@rhmacaw/shared`,
 * nunca redefinicoes. O front continua podendo tratar tudo como `ItemFolha`.
 */
import type { EventoAvulso, FolhaDetalhada, ItemFolha, Papel, Tenant, Usuario } from '@rhmacaw/shared';

/**
 * Ajustes lancados manualmente no contracheque de um colaborador. Ficam
 * gravados junto ao item para que reprocessar a folha em rascunho nao apague
 * o que o RH corrigiu a mao.
 */
export interface EntradaManualItem {
  horasExtras?: number;
  horasNoturnas?: number;
  horasTrabalhadas?: number;
  adiantamento?: number;
  pensaoAlimenticia?: number;
  eventos?: EventoAvulso[];
  observacoes?: string | null;
}

export interface ItemFolhaCompleto extends ItemFolha {
  /** Avisos devolvidos pelo motor de calculo (liquido negativo etc.). */
  alertas: string[];
  /** `true` quando o RH ja conferiu e assumiu os alertas criticos. */
  alertasReconhecidos: boolean;
  entradaManual: EntradaManualItem | null;
}

export interface FolhaCompleta extends FolhaDetalhada {
  itens: ItemFolhaCompleto[];
}

/** Identidade extraida do JWT e anexada a requisicao. */
export interface Identidade {
  usuarioId: string;
  tenantId: string;
  papel: Papel;
}

export interface Sessao {
  identidade: Identidade;
  usuario: Usuario;
  tenant: Tenant;
}
