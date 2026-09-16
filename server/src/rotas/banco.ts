import { Router } from 'express';
import type { ContaPagadora } from '@rhmacaw/shared';
import { inspecionarCNAB240, listarBancos } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import * as repoConta from '../db/repositorios/contaPagadora.js';
import * as repoRemessas from '../db/repositorios/remessas.js';
import { erroNaoEncontrado } from '../erros.js';
import * as remessaServico from '../servicos/remessaServico.js';
import { enviarArquivo, param, query } from './http.js';
import {
  esquemaContaPagadora,
  esquemaPrevia,
  esquemaStatusRemessa,
  origemRemessa,
  statusRemessa,
  validar,
} from './validacao.js';

export const rotasBanco = Router();
rotasBanco.use(autenticar);

rotasBanco.get('/bancos', exigirPermissao('banco:ler'), (_req, res) => {
  res.json(listarBancos());
});

rotasBanco.get('/conta', exigirPermissao('banco:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const conta = repoConta.buscarContaPagadora(identidade.tenantId);
  if (!conta) throw erroNaoEncontrado('Conta pagadora');
  res.json(conta);
});

rotasBanco.put('/conta', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaContaPagadora, req.body);
  res.json(repoConta.salvarContaPagadora(identidade.tenantId, dados as ContaPagadora));
});

rotasBanco.get('/remessas', exigirPermissao('banco:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const origem = query(req, 'origem');
  const status = query(req, 'status');
  res.json(
    repoRemessas.listarRemessas(identidade.tenantId, {
      origem: origem ? origemRemessa.parse(origem) : undefined,
      status: status ? statusRemessa.parse(status) : undefined,
      origemId: query(req, 'origemId'),
    }),
  );
});

/**
 * Previa conferivel: mostra quem entra no arquivo e quem fica de fora, sem
 * gravar remessa nem reservar numero sequencial junto ao banco.
 */
rotasBanco.post('/previa', exigirPermissao('banco:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaPrevia, req.body);
  res.json(remessaServico.gerarPrevia(identidade.tenantId, dados));
});

rotasBanco.get('/remessas/:id', exigirPermissao('banco:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const remessa = remessaServico.exigirRemessa(identidade.tenantId, param(req, 'id'));
  // Para CNAB o resumo permite conferir o arquivo sem abrir o posicional.
  const resumo = remessa.layout === 'CNAB240' ? inspecionarCNAB240(remessa.conteudo) : null;
  res.json({ ...remessa, resumo });
});

rotasBanco.get('/remessas/:id/arquivo', exigirPermissao('banco:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const remessa = remessaServico.exigirRemessa(identidade.tenantId, param(req, 'id'));
  enviarArquivo(res, remessa.nomeArquivo, remessa.conteudo, 'text/plain; charset=utf-8');
});

rotasBanco.post('/remessas/:id/status', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const { status } = validar(esquemaStatusRemessa, req.body);
  res.json(remessaServico.alterarStatus(identidade.tenantId, param(req, 'id'), status, identidade.usuarioId));
});

/** Geracao generica: util para FERIAS, que nao tem rota propria no contrato. */
rotasBanco.post('/remessas', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaPrevia, req.body);
  res.status(201).json(remessaServico.gerarRemessa(identidade.tenantId, dados, identidade.usuarioId));
});
