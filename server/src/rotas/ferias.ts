import { Router } from 'express';
import type { FeriasEntrada } from '@rhmacaw/shared';
import { hojeISO } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import { erroNaoEncontrado } from '../erros.js';
import * as feriasServico from '../servicos/feriasServico.js';
import { param, query } from './http.js';
import { esquemaFerias, esquemaFeriasParcial, statusFerias, validar } from './validacao.js';

export const rotasFerias = Router();
rotasFerias.use(autenticar);

rotasFerias.get('/', exigirPermissao('ferias:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const status = query(req, 'status');
  const ano = query(req, 'ano');
  res.json(
    repoFerias.listarFerias(identidade.tenantId, {
      colaboradorId: query(req, 'colaboradorId'),
      status: status ? statusFerias.parse(status) : undefined,
      ano: ano ? Number(ano) : undefined,
    }),
  );
});

rotasFerias.get('/saldos', exigirPermissao('ferias:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(feriasServico.listarSaldos(identidade.tenantId, query(req, 'referencia') ?? hojeISO()));
});

rotasFerias.get('/periodo-aquisitivo/:colaboradorId', exigirPermissao('ferias:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(feriasServico.sugerirPeriodoAquisitivo(identidade.tenantId, param(req, 'colaboradorId')));
});

rotasFerias.post('/simular', exigirPermissao('ferias:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const entrada = validar(esquemaFerias, req.body);
  res.json(feriasServico.simularFerias(identidade.tenantId, entrada as FeriasEntrada));
});

rotasFerias.post('/', exigirPermissao('ferias:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const entrada = validar(esquemaFerias, req.body);
  res.status(201).json(feriasServico.programarFerias(identidade.tenantId, entrada as FeriasEntrada, identidade.usuarioId));
});

rotasFerias.get('/:id', exigirPermissao('ferias:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const ferias = repoFerias.buscarFerias(identidade.tenantId, param(req, 'id'));
  if (!ferias) throw erroNaoEncontrado('Período de férias');
  res.json(ferias);
});

rotasFerias.put('/:id', exigirPermissao('ferias:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const entrada = validar(esquemaFeriasParcial, req.body);
  res.json(
    feriasServico.atualizarFerias(identidade.tenantId, param(req, 'id'), entrada as Partial<FeriasEntrada>, identidade.usuarioId),
  );
});

rotasFerias.delete('/:id', exigirPermissao('ferias:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  feriasServico.removerFerias(identidade.tenantId, param(req, 'id'), identidade.usuarioId);
  res.status(204).end();
});
