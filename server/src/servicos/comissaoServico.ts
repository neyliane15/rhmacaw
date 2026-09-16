/**
 * Ciclo de vida do periodo semanal de comissao:
 * ABERTO (rateia e ajusta) -> FECHADO (conferido) -> PAGO (remessa gerada).
 */
import type {
  CriterioRateio,
  DataISO,
  ParticipanteRateio,
  PeriodoComissao,
  PeriodoComissaoDetalhado,
} from '@rhmacaw/shared';
import { competenciaDe, intervaloDaSemanaISO, ratearComissoes, somar } from '@rhmacaw/shared';
import { agora, emTransacao } from '../db/conexao.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import { erroConflito, erroNaoEncontrado, erroNaoProcessavel } from '../erros.js';
import { vinculadoNaCompetencia } from './comum.js';

export interface PedidoPeriodo {
  ano: number;
  semana: number;
  valorArrecadado: number;
  percentualRetencao: number;
  criterioRateio: CriterioRateio;
  dataPagamento?: DataISO | undefined;
  observacoes?: string | undefined;
}

export function exigirPeriodo(tenantId: string, periodoId: string): PeriodoComissao {
  const periodo = repoComissoes.buscarPeriodo(tenantId, periodoId);
  if (!periodo) throw erroNaoEncontrado('Periodo de comissao');
  return periodo;
}

function detalhar(tenantId: string, periodoId: string): PeriodoComissaoDetalhado {
  const detalhado = repoComissoes.detalharPeriodo(tenantId, periodoId);
  if (!detalhado) throw erroNaoEncontrado('Periodo de comissao');
  return detalhado;
}

/**
 * Cria o periodo. As datas vem da semana ISO (nao do corpo) para que duas
 * empresas nunca discordem sobre onde comeca a semana 33 de 2025.
 */
export function criarPeriodo(tenantId: string, pedido: PedidoPeriodo, usuarioId: string | null): PeriodoComissaoDetalhado {
  if (pedido.semana < 1 || pedido.semana > 53) {
    throw erroNaoProcessavel('Semana ISO deve estar entre 1 e 53.');
  }
  if (repoComissoes.buscarPeriodoPorSemana(tenantId, pedido.ano, pedido.semana)) {
    throw erroConflito(`Ja existe periodo para a semana ${pedido.semana}/${pedido.ano}.`);
  }

  const intervalo = intervaloDaSemanaISO(pedido.ano, pedido.semana);
  const periodo = repoComissoes.criarPeriodo(tenantId, {
    ano: pedido.ano,
    semana: pedido.semana,
    dataInicio: intervalo.inicio,
    dataFim: intervalo.fim,
    // A comissao entra na folha do mes em que a semana termina.
    competencia: competenciaDe(intervalo.fim),
    valorArrecadado: pedido.valorArrecadado,
    percentualRetencao: pedido.percentualRetencao,
    criterioRateio: pedido.criterioRateio,
    status: 'ABERTO',
    dataPagamento: pedido.dataPagamento ?? null,
    totalDistribuido: 0,
    observacoes: pedido.observacoes ?? null,
  });

  registrar(tenantId, usuarioId, 'comissao:criar-periodo', 'periodo_comissao', periodo.id, {
    ano: pedido.ano,
    semana: pedido.semana,
  });
  return detalhar(tenantId, periodo.id);
}

/** Colaboradores elegiveis ao rateio da semana: com vinculo vivo e nao afastados. */
function participantes(tenantId: string, periodo: PeriodoComissao): ParticipanteRateio[] {
  return repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => vinculadoNaCompetencia(c, periodo.competencia))
    .filter((c) => c.situacao === 'ATIVO')
    .map((c) => ({ colaboradorId: c.id, nome: c.nome, pontos: c.pontosComissao, horas: c.cargaHorariaMensal / 4 }));
}

export function ratearPeriodo(tenantId: string, periodoId: string, usuarioId: string | null): PeriodoComissaoDetalhado {
  const periodo = exigirPeriodo(tenantId, periodoId);
  garantirEditavel(periodo);

  const elegiveis = participantes(tenantId, periodo);
  if (elegiveis.length === 0) throw erroNaoProcessavel('Nenhum colaborador ativo elegivel ao rateio desta semana.');

  // Ajustes ja lancados sao preservados: o rateio recalcula so a parte proporcional.
  const ajustes = new Map(repoComissoes.listarLancamentos(tenantId, periodoId).map((l) => [l.colaboradorId, l.ajuste]));
  const resultado = ratearComissoes({
    valorArrecadado: periodo.valorArrecadado,
    percentualRetencao: periodo.percentualRetencao,
    criterio: periodo.criterioRateio,
    participantes: elegiveis.map((p) => ({ ...p, ajuste: ajustes.get(p.colaboradorId) ?? 0 })),
  });

  return emTransacao(() => {
    repoComissoes.substituirLancamentos(
      tenantId,
      periodoId,
      resultado.linhas.map((l) => ({
        colaboradorId: l.colaboradorId,
        pontos: l.pontos,
        horas: l.horas,
        ajuste: l.ajuste,
        valor: l.valor,
        observacao: null,
      })),
    );
    repoComissoes.atualizarPeriodo(tenantId, { ...periodo, totalDistribuido: resultado.totalDistribuido });
    registrar(tenantId, usuarioId, 'comissao:ratear', 'periodo_comissao', periodoId, {
      total: resultado.totalDistribuido,
      participantes: resultado.linhas.length,
    });
    return detalhar(tenantId, periodoId);
  });
}

export interface LancamentoManual {
  colaboradorId: string;
  pontos: number;
  horas: number;
  ajuste: number;
  valorManual?: number | undefined;
  observacao?: string | undefined;
}

/**
 * Substitui a lista de lancamentos. Quando o criterio e MANUAL o valor vem
 * pronto do cliente; nos demais o motor rateia com os pesos informados.
 */
export function lancarManualmente(
  tenantId: string,
  periodoId: string,
  lancamentos: LancamentoManual[],
  usuarioId: string | null,
): PeriodoComissaoDetalhado {
  const periodo = exigirPeriodo(tenantId, periodoId);
  garantirEditavel(periodo);

  const conhecidos = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));
  const desconhecidos = lancamentos.filter((l) => !conhecidos.has(l.colaboradorId));
  if (desconhecidos.length > 0) {
    throw erroNaoProcessavel(`Colaborador(es) fora do tenant: ${desconhecidos.map((d) => d.colaboradorId).join(', ')}.`);
  }

  const resultado = ratearComissoes({
    valorArrecadado: periodo.valorArrecadado,
    percentualRetencao: periodo.percentualRetencao,
    criterio: periodo.criterioRateio,
    participantes: lancamentos.map((l) => {
      const base: ParticipanteRateio = {
        colaboradorId: l.colaboradorId,
        nome: conhecidos.get(l.colaboradorId)?.nome ?? l.colaboradorId,
        pontos: l.pontos,
        horas: l.horas,
        ajuste: l.ajuste,
      };
      return l.valorManual === undefined ? base : { ...base, valorManual: l.valorManual };
    }),
  });

  const observacoes = new Map(lancamentos.map((l) => [l.colaboradorId, l.observacao ?? null]));

  return emTransacao(() => {
    repoComissoes.substituirLancamentos(
      tenantId,
      periodoId,
      resultado.linhas.map((l) => ({
        colaboradorId: l.colaboradorId,
        pontos: l.pontos,
        horas: l.horas,
        ajuste: l.ajuste,
        valor: l.valor,
        observacao: observacoes.get(l.colaboradorId) ?? null,
      })),
    );
    repoComissoes.atualizarPeriodo(tenantId, { ...periodo, totalDistribuido: resultado.totalDistribuido });
    registrar(tenantId, usuarioId, 'comissao:lancar', 'periodo_comissao', periodoId, {
      total: resultado.totalDistribuido,
    });
    return detalhar(tenantId, periodoId);
  });
}

export interface AtualizacaoPeriodo {
  valorArrecadado: number;
  percentualRetencao: number;
  criterioRateio?: CriterioRateio | undefined;
  observacoes?: string | undefined;
}

/**
 * Altera os parametros do rateio. Nao redistribui sozinho: quem decide quando
 * recalcular e o usuario, via `POST /ratear` — assim ele ve o efeito da
 * mudanca antes de sobrescrever os lancamentos.
 */
export function atualizarDadosPeriodo(
  tenantId: string,
  periodoId: string,
  dados: AtualizacaoPeriodo,
  usuarioId: string | null,
): PeriodoComissaoDetalhado {
  const periodo = exigirPeriodo(tenantId, periodoId);
  garantirEditavel(periodo);

  repoComissoes.atualizarPeriodo(tenantId, {
    ...periodo,
    valorArrecadado: dados.valorArrecadado,
    percentualRetencao: dados.percentualRetencao,
    criterioRateio: dados.criterioRateio ?? periodo.criterioRateio,
    observacoes: dados.observacoes ?? periodo.observacoes,
  });
  registrar(tenantId, usuarioId, 'comissao:atualizar-periodo', 'periodo_comissao', periodoId, {
    valorArrecadado: dados.valorArrecadado,
  });
  return detalhar(tenantId, periodoId);
}

function garantirEditavel(periodo: PeriodoComissao): void {
  if (periodo.status === 'PAGO') throw erroConflito('Periodo PAGO e imutavel (regra 1 do contrato).');
  if (periodo.status === 'FECHADO') throw erroConflito('Periodo FECHADO: reabra antes de alterar os lancamentos.');
}

export function fecharPeriodo(tenantId: string, periodoId: string, usuarioId: string | null): PeriodoComissaoDetalhado {
  const periodo = exigirPeriodo(tenantId, periodoId);
  if (periodo.status !== 'ABERTO') throw erroConflito(`Periodo ja esta ${periodo.status}.`);

  const lancamentos = repoComissoes.listarLancamentos(tenantId, periodoId);
  if (lancamentos.length === 0) throw erroNaoProcessavel('Periodo sem lancamentos: rateie antes de fechar.');

  repoComissoes.atualizarPeriodo(tenantId, {
    ...periodo,
    status: 'FECHADO',
    fechadoEm: agora(),
    totalDistribuido: somar(...lancamentos.map((l) => l.valor)),
  });
  registrar(tenantId, usuarioId, 'comissao:fechar', 'periodo_comissao', periodoId, {
    lancamentos: lancamentos.length,
  });
  return detalhar(tenantId, periodoId);
}

/**
 * Reabre um periodo. Regra 1 do contrato: PAGO so volta para ADMIN e apenas se
 * a remessa daquele periodo estiver CANCELADA.
 */
export function reabrirPeriodo(
  tenantId: string,
  periodoId: string,
  ehAdmin: boolean,
  remessaAtiva: boolean,
  usuarioId: string | null,
): PeriodoComissaoDetalhado {
  const periodo = exigirPeriodo(tenantId, periodoId);

  if (periodo.status === 'PAGO') {
    if (!ehAdmin) throw erroConflito('Somente ADMIN pode reabrir um periodo PAGO.');
    if (remessaAtiva) throw erroConflito('Cancele a remessa do periodo antes de reabri-lo.');
  } else if (periodo.status !== 'FECHADO') {
    throw erroConflito(`Periodo ${periodo.status} nao pode ser reaberto.`);
  }

  repoComissoes.atualizarPeriodo(tenantId, { ...periodo, status: 'ABERTO', fechadoEm: null, pagoEm: null });
  registrar(tenantId, usuarioId, 'comissao:reabrir', 'periodo_comissao', periodoId, { deStatus: periodo.status });
  return detalhar(tenantId, periodoId);
}

/** Marca o periodo como PAGO — chamado apenas pelo servico de remessa. */
export function marcarComoPago(tenantId: string, periodo: PeriodoComissao, dataPagamento: DataISO): void {
  repoComissoes.atualizarPeriodo(tenantId, { ...periodo, status: 'PAGO', pagoEm: agora(), dataPagamento });
}
/**
 * Devolve o periodo semanal de PAGO para FECHADO quando a remessa que o pagou
 * e cancelada — mesmo motivo da folha: sem isso a semana fica quitada no
 * sistema e sem pagamento nenhum no banco.
 */
export function reverterPagamento(tenantId: string, periodoId: string): void {
  const periodo = repoComissoes.buscarPeriodo(tenantId, periodoId);
  if (!periodo || periodo.status !== 'PAGO') return;
  repoComissoes.atualizarPeriodo(tenantId, { ...periodo, status: 'FECHADO', pagoEm: null, dataPagamento: null });
}


export function detalharPeriodo(tenantId: string, periodoId: string): PeriodoComissaoDetalhado {
  return detalhar(tenantId, periodoId);
}
