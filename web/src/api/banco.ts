import type { BancoSuportado, ContaPagadora, ID, OrigemRemessa, Remessa, StatusRemessa } from '@rhmacaw/shared';
import { requisitar, requisitarTexto } from './cliente.js';
import type { EntradaPrevia, PreviaRemessa } from './tipos.js';

export interface FiltroRemessas {
  origem?: OrigemRemessa | '';
  status?: StatusRemessa | '';
}

export function listarRemessas(filtro: FiltroRemessas = {}): Promise<Remessa[]> {
  return requisitar<Remessa[]>('/banco/remessas', { query: { ...filtro } });
}

export function obterRemessa(id: ID): Promise<Remessa> {
  return requisitar<Remessa>(`/banco/remessas/${id}`);
}

export function baixarArquivo(id: ID): Promise<string> {
  return requisitarTexto(`/banco/remessas/${id}/arquivo`);
}

export function mudarStatus(id: ID, status: StatusRemessa): Promise<Remessa> {
  return requisitar<Remessa>(`/banco/remessas/${id}/status`, { metodo: 'POST', corpo: { status } });
}

export function listarBancos(): Promise<BancoSuportado[]> {
  return requisitar<BancoSuportado[]>('/banco/bancos');
}

export function obterConta(): Promise<ContaPagadora> {
  return requisitar<ContaPagadora>('/banco/conta');
}

export function salvarConta(dados: ContaPagadora): Promise<ContaPagadora> {
  return requisitar<ContaPagadora>('/banco/conta', { metodo: 'PUT', corpo: dados });
}

/** Prévia do lote: valida favorecidos e lista inconsistências sem gravar nada. */
export function previa(dados: EntradaPrevia): Promise<PreviaRemessa> {
  return requisitar<PreviaRemessa>('/banco/previa', { metodo: 'POST', corpo: dados });
}
