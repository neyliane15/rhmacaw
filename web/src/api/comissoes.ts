import type {
  Competencia,
  CriterioRateio,
  DataISO,
  ID,
  LayoutBancario,
  PeriodoComissao,
  PeriodoComissaoDetalhado,
  Remessa,
  StatusPeriodo,
} from '@rhmacaw/shared';
import { requisitar } from './cliente.js';

export interface FiltroPeriodos {
  ano?: number;
  status?: StatusPeriodo | '';
  competencia?: Competencia;
}

export interface EntradaPeriodo {
  ano: number;
  semana: number;
  valorArrecadado: number;
  percentualRetencao: number;
  criterioRateio: CriterioRateio;
}

export interface LancamentoEntrada {
  colaboradorId: ID;
  pontos: number;
  horas: number;
  ajuste: number;
  valorManual?: number;
}

export function listarPeriodos(filtro: FiltroPeriodos = {}): Promise<PeriodoComissao[]> {
  return requisitar<PeriodoComissao[]>('/comissoes/periodos', { query: { ...filtro } });
}

export function obterPeriodo(id: ID): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}`);
}

export function criarPeriodo(dados: EntradaPeriodo): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>('/comissoes/periodos', { metodo: 'POST', corpo: dados });
}

/**
 * Altera os parametros de um período que ja existe. `POST /períodos` cria e
 * devolve 409 na segunda chamada da mesma semana — trocar arrecadação,
 * retencao ou critério e este PUT.
 */
export function atualizarPeriodo(
  id: ID,
  dados: { valorArrecadado: number; percentualRetencao: number; criterioRateio?: CriterioRateio; observacoes?: string },
): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}`, { metodo: 'PUT', corpo: dados });
}

export function ratear(id: ID): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}/ratear`, { metodo: 'POST', corpo: {} });
}

export function salvarLancamentos(id: ID, lancamentos: LancamentoEntrada[]): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}/lancamentos`, {
    metodo: 'PUT',
    corpo: { lancamentos },
  });
}

export function fechar(id: ID): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}/fechar`, { metodo: 'POST', corpo: {} });
}

export function reabrir(id: ID): Promise<PeriodoComissaoDetalhado> {
  return requisitar<PeriodoComissaoDetalhado>(`/comissoes/periodos/${id}/reabrir`, { metodo: 'POST', corpo: {} });
}

export function gerarRemessa(
  id: ID,
  dados: { layout: LayoutBancario; bancoCodigo: string; dataPagamento: DataISO },
): Promise<Remessa> {
  return requisitar<Remessa>(`/comissoes/periodos/${id}/remessa`, { metodo: 'POST', corpo: dados });
}
