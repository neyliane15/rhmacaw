import { Router } from 'express';
import type { FaltaEntrada, TipoFalta } from '@rhmacaw/shared';
import { REGIMES_CONTRATO, apurarFaltas, arredondar, competenciaDe, ehCompetencia } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import { existeFolhaTravada } from '../db/repositorios/folhas.js';
import { erroConflito, erroNaoEncontrado, erroValidacao } from '../erros.js';
import { param, query } from './http.js';
import { esquemaFalta, esquemaFaltaParcial, esquemaFiltroFaltas, validar } from './validacao.js';

export const rotasFaltas = Router();
rotasFaltas.use(autenticar);

/** Regra 6 do contrato: competencia com folha FECHADA/PAGA nao aceita lancamento. */
function garantirCompetenciaAberta(tenantId: string, data: string): void {
  const competencia = competenciaDe(data);
  const folha = existeFolhaTravada(tenantId, competencia);
  if (folha) {
    throw erroConflito(
      `A folha de ${competencia} esta ${folha.status}: reabra-a antes de lancar ou alterar faltas nesta competência.`,
    );
  }
}

rotasFaltas.get('/', exigirPermissao('faltas:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const filtro = validar(esquemaFiltroFaltas, req.query);
  res.json(repoFaltas.listarFaltas(identidade.tenantId, filtro));
});

/**
 * Resumo do absenteismo da competencia, por colaborador: dias descontaveis,
 * DSR perdido e valor estimado do desconto.
 *
 * O DSR vem de `apurarFaltas` — a mesma funcao que a folha usa — para que o
 * numero conferido aqui seja exatamente o que sera descontado no contracheque.
 */
rotasFaltas.get('/resumo', exigirPermissao('faltas:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const competencia = query(req, 'competencia');
  if (!competencia) throw erroValidacao('Informe a competência (YYYY-MM).');
  if (!ehCompetencia(competencia)) {
    throw erroValidacao('Competencia invalida.', [{ campo: 'competencia', mensagem: 'Use o formato YYYY-MM.' }]);
  }

  const cadastros = new Map(repoColaboradores.listarTodos(identidade.tenantId).map((c) => [c.id, c]));
  const porColaborador = repoFaltas.faltasPorColaboradorNaCompetencia(identidade.tenantId, competencia);

  const linhas = [...porColaborador.entries()].map(([colaboradorId, faltas]) => {
    const colaborador = cadastros.get(colaboradorId);
    const perdeDSR = colaborador ? REGIMES_CONTRATO[colaborador.tipoContrato].perdeDSR : true;
    const apuracao = apurarFaltas(faltas, competencia, perdeDSR);
    const valorDia = colaborador ? arredondar(colaborador.salarioBase / 30) : 0;

    const porTipo: Partial<Record<TipoFalta, number>> = {};
    for (const falta of faltas) porTipo[falta.tipo] = (porTipo[falta.tipo] ?? 0) + 1;

    return {
      colaboradorId,
      colaboradorNome: colaborador?.nome ?? colaboradorId,
      funcao: colaborador?.funcao ?? '-',
      centroCusto: colaborador?.centroCusto ?? '-',
      dias: apuracao.diasDescontaveis,
      diasJustificados: apuracao.diasJustificados,
      horas: apuracao.horasAtraso,
      diasDSR: apuracao.diasDSR,
      valorEstimado: arredondar(valorDia * (apuracao.diasDescontaveis + apuracao.diasDSR)),
      porTipo,
    };
  });

  linhas.sort((a, b) => b.valorEstimado - a.valorEstimado);
  res.json(linhas);
});

rotasFaltas.post('/', exigirPermissao('faltas:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaFalta, req.body);
  garantirCompetenciaAberta(identidade.tenantId, dados.data);

  if (!repoColaboradores.buscarColaborador(identidade.tenantId, dados.colaboradorId)) {
    throw erroNaoEncontrado('Colaborador');
  }
  if (dados.tipo === 'ATRASO' && !dados.horas) {
    throw erroValidacao('Informe as horas do atraso.', [{ campo: 'horas', mensagem: 'Obrigatório para ATRASO.' }]);
  }

  const falta = repoFaltas.criarFalta(identidade.tenantId, {
    ...dados,
    registradoPor: identidade.usuarioId,
  } as FaltaEntrada);
  registrar(identidade.tenantId, identidade.usuarioId, 'falta:criar', 'falta', falta.id, {
    colaboradorId: falta.colaboradorId,
    data: falta.data,
  });
  res.status(201).json(falta);
});

rotasFaltas.put('/:id', exigirPermissao('faltas:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaFaltaParcial, req.body);

  const atual = repoFaltas.buscarFalta(identidade.tenantId, param(req, 'id'));
  if (!atual) throw erroNaoEncontrado('Falta');

  garantirCompetenciaAberta(identidade.tenantId, atual.data);
  if (dados.data) garantirCompetenciaAberta(identidade.tenantId, dados.data);

  const atualizada = repoFaltas.atualizarFalta(identidade.tenantId, atual.id, dados);
  if (!atualizada) throw erroNaoEncontrado('Falta');
  registrar(identidade.tenantId, identidade.usuarioId, 'falta:atualizar', 'falta', atual.id);
  res.json(atualizada);
});

rotasFaltas.delete('/:id', exigirPermissao('faltas:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const atual = repoFaltas.buscarFalta(identidade.tenantId, param(req, 'id'));
  if (!atual) throw erroNaoEncontrado('Falta');

  garantirCompetenciaAberta(identidade.tenantId, atual.data);
  repoFaltas.removerFalta(identidade.tenantId, atual.id);
  registrar(identidade.tenantId, identidade.usuarioId, 'falta:remover', 'falta', atual.id, {
    colaboradorId: atual.colaboradorId,
  });
  res.status(204).end();
});
