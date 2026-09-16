/** Resumo da competencia para a tela inicial. */
import type { Alerta, Competencia, ResumoDashboard, StatusFolha } from '@rhmacaw/shared';
import {
  feriasAVencer,
  primeiroDiaDaCompetencia,
  rotuloCompetencia,
  somar,
  ultimoDiaDaCompetencia,
} from '@rhmacaw/shared';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import { contarRemessasPendentes } from '../db/repositorios/remessas.js';
import { alertasCriticos } from './folhaServico.js';
import { listarSaldos } from './feriasServico.js';

export function montarDashboard(tenantId: string, competencia: Competencia): ResumoDashboard {
  const inicio = primeiroDiaDaCompetencia(competencia);
  const fim = ultimoDiaDaCompetencia(competencia);
  const colaboradores = repoColaboradores.listarTodos(tenantId);

  const ativos = colaboradores.filter((c) => c.situacao !== 'DEMITIDO');
  const folha = repoFolhas.buscarFolhaAtiva(tenantId, competencia, 'MENSAL');
  const itens = folha ? repoFolhas.listarItens(tenantId, folha.id) : [];

  // Os saldos de ferias sao apurados na virada da competencia, e nao "hoje",
  // para que o painel de um mes fechado continue mostrando o que se via la.
  const saldos = listarSaldos(tenantId, fim);
  const vencendo = feriasAVencer(saldos, 90);

  const porCentroCusto = new Map<string, { colaboradores: number; custo: number }>();
  for (const colaborador of ativos) {
    const atual = porCentroCusto.get(colaborador.centroCusto) ?? { colaboradores: 0, custo: 0 };
    atual.colaboradores += 1;
    porCentroCusto.set(colaborador.centroCusto, atual);
  }
  for (const item of itens) {
    const atual = porCentroCusto.get(item.centroCusto) ?? { colaboradores: 0, custo: 0 };
    atual.custo = somar(atual.custo, item.totalProventos);
    porCentroCusto.set(item.centroCusto, atual);
  }

  const alertas: Alerta[] = [];
  if (!folha) {
    alertas.push({
      nivel: 'ATENCAO',
      titulo: `Folha de ${rotuloCompetencia(competencia)} não iniciada`,
      detalhe: 'Nenhuma folha mensal foi processada nesta competência.',
      acao: '/folha',
    });
  }
  const comAlertaCritico = itens.filter((i) => alertasCriticos(i).length > 0);
  if (comAlertaCritico.length > 0) {
    alertas.push({
      nivel: 'CRITICO',
      titulo: `${comAlertaCritico.length} contracheque(s) com problema`,
      detalhe: comAlertaCritico
        .slice(0, 5)
        .map((i) => i.colaboradorNome)
        .join(', '),
      acao: `/folha/${folha?.id ?? ''}`,
    });
  }
  const vencidas = saldos.filter((s) => s.vencida);
  if (vencidas.length > 0) {
    alertas.push({
      nivel: 'CRITICO',
      titulo: `${vencidas.length} colaborador(es) com férias vencidas`,
      detalhe: 'Férias vencidas sao devidas em dobro (art. 137 da CLT).',
      acao: '/ferias',
    });
  }
  if (vencendo.length > 0) {
    alertas.push({
      nivel: 'ATENCAO',
      titulo: `${vencendo.length} período(s) de férias vencem em até 90 dias`,
      detalhe: vencendo
        .slice(0, 5)
        .map((s) => `${s.colaboradorNome} (${s.limiteConcessivo})`)
        .join(', '),
      acao: '/ferias',
    });
  }
  const periodosAbertos = repoComissoes.listarPeriodos(tenantId, { competencia, status: 'ABERTO' });
  if (periodosAbertos.length > 0) {
    alertas.push({
      nivel: 'INFO',
      titulo: `${periodosAbertos.length} semana(s) de comissao em aberto`,
      detalhe: periodosAbertos.map((p) => `semana ${p.semana}`).join(', '),
      acao: '/comissoes',
    });
  }

  const comissoesDaCompetencia = repoComissoes.listarPeriodos(tenantId, { competencia });
  const folhaStatus: StatusFolha | 'NAO_INICIADA' = folha ? folha.status : 'NAO_INICIADA';

  return {
    competencia,
    colaboradoresAtivos: ativos.filter((c) => c.situacao === 'ATIVO').length,
    admissoesNoMes: colaboradores.filter((c) => c.admissao >= inicio && c.admissao <= fim).length,
    demissoesNoMes: colaboradores.filter((c) => c.demissao && c.demissao >= inicio && c.demissao <= fim).length,
    emFerias: ativos.filter((c) => c.situacao === 'FERIAS').length,
    feriasVencendo: vencendo.length,
    faltasNoMes: repoFaltas.listarFaltas(tenantId, { competencia }).length,
    custoFolha: folha?.totalProventos ?? 0,
    totalComissoesSemana: somar(...comissoesDaCompetencia.map((p) => p.totalDistribuido)),
    totalTransferir: folha?.totalTransferir ?? 0,
    folhaStatus,
    remessasPendentes: contarRemessasPendentes(tenantId),
    porCentroCusto: [...porCentroCusto.entries()]
      .map(([centroCusto, dados]) => ({ centroCusto, ...dados }))
      .sort((a, b) => b.custo - a.custo),
    alertas,
  };
}
