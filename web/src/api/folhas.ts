import type {
  Competencia,
  DataISO,
  Folha,
  FolhaDetalhada,
  ID,
  ItemFolha,
  LayoutBancario,
  Remessa,
  StatusFolha,
  TipoFolha,
} from '@rhmacaw/shared';
import { requisitar, requisitarTexto } from './cliente.js';

export interface FiltroFolhas {
  competencia?: Competencia;
  tipo?: TipoFolha | '';
  status?: StatusFolha | '';
}

export function listar(filtro: FiltroFolhas = {}): Promise<Folha[]> {
  return requisitar<Folha[]>('/folhas', { query: { ...filtro } });
}

export function obter(id: ID): Promise<FolhaDetalhada> {
  return requisitar<FolhaDetalhada>(`/folhas/${id}`);
}

export function processar(dados: {
  competencia: Competencia;
  tipo: TipoFolha;
  dataPagamento: DataISO;
  centroCusto?: string;
}): Promise<FolhaDetalhada> {
  return requisitar<FolhaDetalhada>('/folhas/processar', { metodo: 'POST', corpo: dados });
}

export function obterItem(folhaId: ID, colaboradorId: ID): Promise<ItemFolha> {
  return requisitar<ItemFolha>(`/folhas/${folhaId}/itens/${colaboradorId}`);
}

export interface AjusteItem {
  outrosProventos?: number;
  outrosDescontos?: number;
  horasExtras?: number;
  adicionalNoturno?: number;
  observacoes?: string;
}

export function ajustarItem(folhaId: ID, colaboradorId: ID, dados: AjusteItem): Promise<ItemFolha> {
  return requisitar<ItemFolha>(`/folhas/${folhaId}/itens/${colaboradorId}`, { metodo: 'PUT', corpo: dados });
}

export function fechar(id: ID): Promise<FolhaDetalhada> {
  return requisitar<FolhaDetalhada>(`/folhas/${id}/fechar`, { metodo: 'POST', corpo: {} });
}

export function reabrir(id: ID): Promise<FolhaDetalhada> {
  return requisitar<FolhaDetalhada>(`/folhas/${id}/reabrir`, { metodo: 'POST', corpo: {} });
}

export function gerarRemessa(
  id: ID,
  dados: { layout: LayoutBancario; bancoCodigo: string; dataPagamento: DataISO },
): Promise<Remessa> {
  return requisitar<Remessa>(`/folhas/${id}/remessa`, { metodo: 'POST', corpo: dados });
}

export function exportar(id: ID, formato: 'csv' | 'json'): Promise<string> {
  return requisitarTexto(`/folhas/${id}/exportar`, { query: { formato } });
}
