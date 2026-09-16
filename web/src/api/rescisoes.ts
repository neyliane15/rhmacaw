import type { DataISO, ID, LayoutBancario, Remessa, Rescisao, ResultadoRescisao } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';
import type { EntradaRescisaoApi } from './tipos.js';

export function listar(): Promise<Rescisao[]> {
  return requisitar<Rescisao[]>('/rescisoes');
}

export function obter(id: ID): Promise<Rescisao> {
  return requisitar<Rescisao>(`/rescisoes/${id}`);
}

export function simular(dados: EntradaRescisaoApi): Promise<ResultadoRescisao> {
  return requisitar<ResultadoRescisao>('/rescisoes/simular', { metodo: 'POST', corpo: dados });
}

export function efetivar(dados: EntradaRescisaoApi): Promise<Rescisao> {
  return requisitar<Rescisao>('/rescisoes', { metodo: 'POST', corpo: dados });
}

export function gerarRemessa(
  id: ID,
  dados: { layout: LayoutBancario; bancoCodigo: string; dataPagamento: DataISO },
): Promise<Remessa> {
  return requisitar<Remessa>(`/rescisoes/${id}/remessa`, { metodo: 'POST', corpo: dados });
}
