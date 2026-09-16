import { Router } from 'express';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import { buscarRemessaAtiva } from '../db/repositorios/remessas.js';
import * as comissaoServico from '../servicos/comissaoServico.js';
import * as remessaServico from '../servicos/remessaServico.js';
import { param, query } from './http.js';
import {
  criterioRateio,
  esquemaGerarRemessa,
  esquemaLancamentosComissao,
  esquemaPeriodoComissao,
  statusPeriodo,
  validar,
} from './validacao.js';

export const rotasComissoes = Router();
rotasComissoes.use(autenticar);

rotasComissoes.get('/periodos', exigirPermissao('comissoes:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const ano = query(req, 'ano');
  const status = query(req, 'status');
  res.json(
    repoComissoes.listarPeriodos(identidade.tenantId, {
      ano: ano ? Number(ano) : undefined,
      status: status ? statusPeriodo.parse(status) : undefined,
      competencia: query(req, 'competencia'),
    }),
  );
});

rotasComissoes.post('/periodos', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaPeriodoComissao, req.body);
  res.status(201).json(comissaoServico.criarPeriodo(identidade.tenantId, dados, identidade.usuarioId));
});

rotasComissoes.get('/periodos/:id', exigirPermissao('comissoes:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(comissaoServico.detalharPeriodo(identidade.tenantId, param(req, 'id')));
});

/** Recalcula o rateio do zero a partir dos colaboradores ativos. */
rotasComissoes.post('/periodos/:id/ratear', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(comissaoServico.ratearPeriodo(identidade.tenantId, param(req, 'id'), identidade.usuarioId));
});

rotasComissoes.put('/periodos/:id/lancamentos', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const { lancamentos } = validar(esquemaLancamentosComissao, req.body);
  res.json(comissaoServico.lancarManualmente(identidade.tenantId, param(req, 'id'), lancamentos, identidade.usuarioId));
});

/** Permite trocar valor arrecadado/retencao/criterio enquanto o periodo esta ABERTO. */
rotasComissoes.put('/periodos/:id', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(
    esquemaPeriodoComissao.pick({ valorArrecadado: true, percentualRetencao: true, observacoes: true }).extend({
      criterioRateio: criterioRateio.optional(),
    }),
    req.body,
  );
  res.json(comissaoServico.atualizarDadosPeriodo(identidade.tenantId, param(req, 'id'), dados, identidade.usuarioId));
});

rotasComissoes.post('/periodos/:id/fechar', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(comissaoServico.fecharPeriodo(identidade.tenantId, param(req, 'id'), identidade.usuarioId));
});

rotasComissoes.post('/periodos/:id/reabrir', exigirPermissao('comissoes:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const periodoId = param(req, 'id');
  // A remessa ativa (nao cancelada) e o que trava a reabertura de um periodo PAGO.
  const remessaAtiva = Boolean(buscarRemessaAtiva(identidade.tenantId, 'COMISSAO_SEMANAL', periodoId));
  res.json(
    comissaoServico.reabrirPeriodo(
      identidade.tenantId,
      periodoId,
      identidade.papel === 'ADMIN',
      remessaAtiva,
      identidade.usuarioId,
    ),
  );
});

/** Pagamento da semana: gera a remessa e marca o periodo como PAGO. */
rotasComissoes.post('/periodos/:id/remessa', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaGerarRemessa, req.body);
  const remessa = remessaServico.gerarRemessa(
    identidade.tenantId,
    { ...dados, origem: 'COMISSAO_SEMANAL', origemId: param(req, 'id') },
    identidade.usuarioId,
  );
  res.status(201).json(remessa);
});
