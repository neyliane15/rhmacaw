import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import * as repoRescisoes from '../db/repositorios/rescisoes.js';
import * as rescisaoServico from '../servicos/rescisaoServico.js';
import * as remessaServico from '../servicos/remessaServico.js';
import { param, query } from './http.js';
import { esquemaDemissao, esquemaGerarRemessa, validar } from './validacao.js';

export const rotasRescisoes = Router();
rotasRescisoes.use(autenticar);

const esquemaRescisao = esquemaDemissao.extend({ colaboradorId: z.string().min(1) });

rotasRescisoes.get('/', exigirPermissao('rescisoes:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(repoRescisoes.listarRescisoes(identidade.tenantId, query(req, 'colaboradorId')));
});

rotasRescisoes.post('/simular', exigirPermissao('rescisoes:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaRescisao, req.body);
  res.json(rescisaoServico.simularRescisao(identidade.tenantId, dados));
});

rotasRescisoes.post('/', exigirPermissao('rescisoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaRescisao, req.body);
  res.status(201).json(rescisaoServico.efetivarRescisao(identidade.tenantId, dados, identidade.usuarioId));
});

rotasRescisoes.get('/:id', exigirPermissao('rescisoes:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(rescisaoServico.exigirRescisao(identidade.tenantId, param(req, 'id')));
});

/** Pagamento do TRCT: art. 477, par. 6o da CLT — ate 10 dias do desligamento. */
rotasRescisoes.post('/:id/remessa', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaGerarRemessa, req.body);
  const remessa = remessaServico.gerarRemessa(
    identidade.tenantId,
    { ...dados, origem: 'RESCISAO', origemId: param(req, 'id') },
    identidade.usuarioId,
  );
  res.status(201).json(remessa);
});
