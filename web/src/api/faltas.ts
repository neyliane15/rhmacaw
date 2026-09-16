import type { Competencia, DataISO, Falta, FaltaEntrada, ID, TipoFalta } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';
import type { ResumoFaltasColaborador } from './tipos.js';

export interface FiltroFaltas {
  colaboradorId?: ID;
  competencia?: Competencia;
  tipo?: TipoFalta | '';
  de?: DataISO;
  ate?: DataISO;
}

export function listar(filtro: FiltroFaltas = {}): Promise<Falta[]> {
  return requisitar<Falta[]>('/faltas', { query: { ...filtro } });
}

export function criar(dados: FaltaEntrada): Promise<Falta> {
  return requisitar<Falta>('/faltas', { metodo: 'POST', corpo: dados });
}

export function atualizar(id: ID, dados: Partial<FaltaEntrada>): Promise<Falta> {
  return requisitar<Falta>(`/faltas/${id}`, { metodo: 'PUT', corpo: dados });
}

export function remover(id: ID): Promise<void> {
  return requisitar<void>(`/faltas/${id}`, { metodo: 'DELETE' });
}

export function resumo(competencia: Competencia): Promise<ResumoFaltasColaborador[]> {
  return requisitar<ResumoFaltasColaborador[]>('/faltas/resumo', { query: { competencia } });
}
