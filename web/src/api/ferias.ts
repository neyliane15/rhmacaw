import type { Ferias, FeriasEntrada, ID, ResultadoFerias, SaldoFerias, StatusFerias } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';

export interface FiltroFerias {
  colaboradorId?: ID;
  status?: StatusFerias | '';
  ano?: number;
}

export function listar(filtro: FiltroFerias = {}): Promise<Ferias[]> {
  return requisitar<Ferias[]>('/ferias', { query: { ...filtro } });
}

export function saldos(): Promise<SaldoFerias[]> {
  return requisitar<SaldoFerias[]>('/ferias/saldos');
}

export function simular(dados: FeriasEntrada): Promise<ResultadoFerias> {
  return requisitar<ResultadoFerias>('/ferias/simular', { metodo: 'POST', corpo: dados });
}

export function programar(dados: FeriasEntrada): Promise<Ferias> {
  return requisitar<Ferias>('/ferias', { metodo: 'POST', corpo: dados });
}

export function atualizar(id: ID, dados: Partial<FeriasEntrada>): Promise<Ferias> {
  return requisitar<Ferias>(`/ferias/${id}`, { metodo: 'PUT', corpo: dados });
}

export function remover(id: ID): Promise<void> {
  return requisitar<void>(`/ferias/${id}`, { metodo: 'DELETE' });
}
