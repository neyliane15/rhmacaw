import type { Competencia, ResumoDashboard } from '@rhmacaw/shared';
import { requisitar } from './cliente.js';
import type {
  PontoEvolucaoFolha,
  RelatorioAbsenteismo,
  RelatorioCentroCusto,
  RelatorioComissoes,
  RelatorioFolhaAnalitica,
  RelatorioMovimentacao,
  RelatorioProvisoes,
} from './tipos.js';

export function dashboard(competencia: Competencia): Promise<ResumoDashboard> {
  return requisitar<ResumoDashboard>('/dashboard', { query: { competencia } });
}

export function folhaAnalitica(competencia: Competencia): Promise<RelatorioFolhaAnalitica> {
  return requisitar<RelatorioFolhaAnalitica>('/relatorios/folha-analitica', { query: { competencia } });
}

export function custoCentroCusto(competencia: Competencia): Promise<RelatorioCentroCusto> {
  return requisitar<RelatorioCentroCusto>('/relatorios/custo-centro-custo', { query: { competencia } });
}

export function comissoes(ano: number, competencia?: Competencia): Promise<RelatorioComissoes> {
  return requisitar<RelatorioComissoes>('/relatorios/comissoes', { query: { ano, competencia } });
}

export function absenteismo(competencia: Competencia): Promise<RelatorioAbsenteismo> {
  return requisitar<RelatorioAbsenteismo>('/relatorios/absenteismo', { query: { competencia } });
}

export function movimentacao(ano: number): Promise<RelatorioMovimentacao> {
  return requisitar<RelatorioMovimentacao>('/relatorios/movimentacao', { query: { ano } });
}

export function provisoes(competencia: Competencia): Promise<RelatorioProvisoes> {
  return requisitar<RelatorioProvisoes>('/relatorios/provisoes', { query: { competencia } });
}

/**
 * Serie de 12 meses ate a competencia informada, numa unica chamada. Substitui
 * o leque de requisicoes paralelas a `custo-centro-custo` que o painel fazia.
 */
export function evolucaoFolha(competencia: Competencia): Promise<PontoEvolucaoFolha[]> {
  return requisitar<PontoEvolucaoFolha[]>('/relatorios/evolucao-folha', { query: { competencia } });
}
