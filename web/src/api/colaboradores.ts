import type { Colaborador, ColaboradorEntrada, ID, Paginado, Rescisao, Situacao, TipoContrato } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';
import type { EntradaRescisaoApi, EventoHistorico } from './tipos.js';

export interface FiltroColaboradores {
  busca?: string;
  situacao?: Situacao | '';
  centroCusto?: string;
  tipoContrato?: TipoContrato | '';
  pagina?: number;
  porPagina?: number;
}

export function listar(filtro: FiltroColaboradores = {}): Promise<Paginado<Colaborador>> {
  return requisitar<Paginado<Colaborador>>('/colaboradores', { query: { ...filtro } });
}

export function obter(id: ID): Promise<Colaborador> {
  return requisitar<Colaborador>(`/colaboradores/${id}`);
}

export function criar(dados: ColaboradorEntrada): Promise<Colaborador> {
  return requisitar<Colaborador>('/colaboradores', { metodo: 'POST', corpo: dados });
}

export function atualizar(id: ID, dados: Partial<ColaboradorEntrada>): Promise<Colaborador> {
  return requisitar<Colaborador>(`/colaboradores/${id}`, { metodo: 'PUT', corpo: dados });
}

export function remover(id: ID): Promise<void> {
  return requisitar<void>(`/colaboradores/${id}`, { metodo: 'DELETE' });
}

/** Simula o desligamento: devolve a rescisao calculada sem gravar a demissao. */
export function demitir(id: ID, dados: Omit<EntradaRescisaoApi, 'colaboradorId'>): Promise<Rescisao> {
  return requisitar<Rescisao>(`/colaboradores/${id}/demitir`, { metodo: 'POST', corpo: dados });
}

export function historico(id: ID): Promise<EventoHistorico[]> {
  return requisitar<EventoHistorico[]>(`/colaboradores/${id}/historico`);
}
