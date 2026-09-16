import { Router } from 'express';
import type { ColaboradorEntrada } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import * as repoRescisoes from '../db/repositorios/rescisoes.js';
import { erroConflito, erroNaoEncontrado } from '../erros.js';
import { param } from './http.js';
import * as rescisaoServico from '../servicos/rescisaoServico.js';
import {
  esquemaColaborador,
  esquemaColaboradorParcial,
  esquemaDemissao,
  esquemaFiltroColaboradores,
  validar,
} from './validacao.js';

export const rotasColaboradores = Router();
rotasColaboradores.use(autenticar);

rotasColaboradores.get('/', exigirPermissao('colaboradores:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const filtro = validar(esquemaFiltroColaboradores, req.query);
  res.json(repoColaboradores.listarColaboradores(identidade.tenantId, filtro));
});

rotasColaboradores.get('/centros-custo', exigirPermissao('colaboradores:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(repoColaboradores.listarCentrosDeCusto(identidade.tenantId));
});

rotasColaboradores.get('/:id', exigirPermissao('colaboradores:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const colaborador = repoColaboradores.buscarColaborador(identidade.tenantId, param(req, 'id'));
  if (!colaborador) throw erroNaoEncontrado('Colaborador');
  res.json(colaborador);
});

/** Linha do tempo do colaborador: admissao, faltas, ferias, folhas e rescisao. */
rotasColaboradores.get('/:id/historico', exigirPermissao('colaboradores:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const tenantId = identidade.tenantId;
  const colaborador = repoColaboradores.buscarColaborador(tenantId, param(req, 'id'));
  if (!colaborador) throw erroNaoEncontrado('Colaborador');

  interface Evento {
    data: string;
    tipo: string;
    titulo: string;
    detalhe: string;
    referenciaId?: string;
  }
  const eventos: Evento[] = [
    {
      data: colaborador.admissao,
      tipo: 'ADMISSAO',
      titulo: 'Admissao',
      detalhe: `${colaborador.funcao} - ${colaborador.centroCusto}`,
    },
  ];

  for (const falta of repoFaltas.listarFaltas(tenantId, { colaboradorId: colaborador.id })) {
    eventos.push({
      data: falta.data,
      tipo: 'FALTA',
      titulo: falta.tipo,
      detalhe: falta.justificativa ?? (falta.horas ? `${falta.horas}h` : 'sem justificativa'),
      referenciaId: falta.id,
    });
  }
  for (const ferias of repoFerias.listarFerias(tenantId, { colaboradorId: colaborador.id })) {
    eventos.push({
      data: ferias.inicioGozo,
      tipo: 'FERIAS',
      titulo: `Ferias (${ferias.status})`,
      detalhe: `${ferias.diasGozo} dias de gozo ate ${ferias.fimGozo}`,
      referenciaId: ferias.id,
    });
  }
  for (const item of repoFolhas.itensDoColaborador(tenantId, colaborador.id)) {
    eventos.push({
      data: `${item.competencia}-01`,
      tipo: 'FOLHA',
      titulo: `Folha ${item.tipo} (${item.status})`,
      detalhe: `Liquido ${item.salarioLiquido.toFixed(2)} / transferir ${item.valorTransferir.toFixed(2)}`,
      referenciaId: item.folhaId,
    });
  }
  for (const rescisao of repoRescisoes.listarRescisoes(tenantId, colaborador.id)) {
    eventos.push({
      data: rescisao.dataDesligamento,
      tipo: 'RESCISAO',
      titulo: `Rescisao - ${rescisao.motivo}`,
      detalhe: `Liquido ${rescisao.liquido.toFixed(2)}`,
      referenciaId: rescisao.id,
    });
  }

  eventos.sort((a, b) => b.data.localeCompare(a.data));
  res.json({ colaborador, eventos });
});

rotasColaboradores.post('/', exigirPermissao('colaboradores:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaColaborador, req.body);

  const duplicado = repoColaboradores.buscarPorCpf(identidade.tenantId, dados.cpf);
  if (duplicado) throw erroConflito(`CPF ja cadastrado para ${duplicado.nome} (matricula ${duplicado.matricula}).`);

  const colaborador = repoColaboradores.criarColaborador(identidade.tenantId, dados as ColaboradorEntrada);
  registrar(identidade.tenantId, identidade.usuarioId, 'colaborador:criar', 'colaborador', colaborador.id, {
    nome: colaborador.nome,
  });
  res.status(201).json(colaborador);
});

rotasColaboradores.put('/:id', exigirPermissao('colaboradores:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaColaboradorParcial, req.body);

  const atual = repoColaboradores.buscarColaborador(identidade.tenantId, param(req, 'id'));
  if (!atual) throw erroNaoEncontrado('Colaborador');

  if (dados.cpf && dados.cpf !== atual.cpf) {
    const duplicado = repoColaboradores.buscarPorCpf(identidade.tenantId, dados.cpf);
    if (duplicado) throw erroConflito(`CPF ja cadastrado para ${duplicado.nome}.`);
  }

  const atualizado = repoColaboradores.atualizarColaborador(
    identidade.tenantId,
    param(req, 'id'),
    dados as Partial<ColaboradorEntrada>,
  );
  if (!atualizado) throw erroNaoEncontrado('Colaborador');
  registrar(identidade.tenantId, identidade.usuarioId, 'colaborador:atualizar', 'colaborador', atualizado.id);
  res.json(atualizado);
});

/**
 * Previa do TRCT. Nao grava nada: o desligamento so acontece em
 * `POST /rescisoes`, depois de o RH conferir os numeros.
 */
rotasColaboradores.post('/:id/demitir', exigirPermissao('rescisoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaDemissao, req.body);
  const resultado = rescisaoServico.simularRescisao(identidade.tenantId, {
    ...dados,
    colaboradorId: param(req, 'id'),
  });
  res.json({ colaboradorId: param(req, 'id'), ...dados, simulacao: resultado });
});

rotasColaboradores.delete('/:id', exigirPermissao('colaboradores:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const colaborador = repoColaboradores.buscarColaborador(identidade.tenantId, param(req, 'id'));
  if (!colaborador) throw erroNaoEncontrado('Colaborador');

  const vinculos = repoColaboradores.contarItensDeFolha(identidade.tenantId, colaborador.id);
  if (vinculos > 0) {
    throw erroConflito(
      `${colaborador.nome} tem ${vinculos} lancamento(s) em folha e nao pode ser excluido. Registre a rescisao em vez de excluir.`,
    );
  }

  repoColaboradores.removerColaborador(identidade.tenantId, colaborador.id);
  registrar(identidade.tenantId, identidade.usuarioId, 'colaborador:remover', 'colaborador', colaborador.id, {
    nome: colaborador.nome,
  });
  res.status(204).end();
});
