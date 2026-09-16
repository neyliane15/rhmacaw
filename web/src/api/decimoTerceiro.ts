import type { DataISO, DecimoTerceiro, FolhaDetalhada } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';

export function listar(ano: number): Promise<DecimoTerceiro[]> {
  return requisitar<DecimoTerceiro[]>('/decimo-terceiro', { query: { ano } });
}

export function processar(dados: { ano: number; parcela: 1 | 2; dataPagamento: DataISO }): Promise<FolhaDetalhada> {
  return requisitar<FolhaDetalhada>('/decimo-terceiro/processar', { metodo: 'POST', corpo: dados });
}
