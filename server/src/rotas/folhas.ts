import { Router } from 'express';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import { erroNaoEncontrado } from '../erros.js';
import * as folhaServico from '../servicos/folhaServico.js';
import * as remessaServico from '../servicos/remessaServico.js';
import { enviarArquivo, param, query } from './http.js';
import {
  esquemaAjusteItem,
  esquemaFecharFolha,
  esquemaGerarRemessa,
  esquemaProcessarFolha,
  statusFolha,
  tipoFolha,
  validar,
} from './validacao.js';

export const rotasFolhas = Router();
rotasFolhas.use(autenticar);

rotasFolhas.get('/', exigirPermissao('folha:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const tipo = query(req, 'tipo');
  const status = query(req, 'status');
  res.json(
    repoFolhas.listarFolhas(identidade.tenantId, {
      competencia: query(req, 'competencia'),
      tipo: tipo ? tipoFolha.parse(tipo) : undefined,
      status: status ? statusFolha.parse(status) : undefined,
    }),
  );
});

/**
 * Processa a competencia. Reprocessar uma folha que ja esta em RASCUNHO
 * substitui os itens, preservando os ajustes manuais de cada contracheque.
 */
rotasFolhas.post('/processar', exigirPermissao('folha:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaProcessarFolha, req.body);
  const folha = folhaServico.processarFolha(
    identidade.tenantId,
    {
      competencia: dados.competencia,
      tipo: dados.tipo,
      dataPagamento: dados.dataPagamento ?? folhaServico.dataPagamentoPadrao(dados.competencia),
      centroCusto: dados.centroCusto,
    },
    identidade.usuarioId,
  );
  res.status(201).json(folha);
});

rotasFolhas.get('/:id', exigirPermissao('folha:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const folha = repoFolhas.detalharFolha(identidade.tenantId, param(req, 'id'));
  if (!folha) throw erroNaoEncontrado('Folha');
  res.json(folha);
});

rotasFolhas.get('/:id/exportar', exigirPermissao('folha:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const formato = query(req, 'formato') === 'json' ? 'json' : 'csv';
  const arquivo = folhaServico.exportarFolha(identidade.tenantId, param(req, 'id'), formato);
  enviarArquivo(res, arquivo.nomeArquivo, arquivo.conteudo, arquivo.tipoConteudo);
});

rotasFolhas.get('/:id/itens/:colaboradorId', exigirPermissao('folha:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const item = repoFolhas.buscarItem(identidade.tenantId, param(req, 'id'), param(req, 'colaboradorId'));
  if (!item) throw erroNaoEncontrado('Item da folha');
  res.json(item);
});

rotasFolhas.put('/:id/itens/:colaboradorId', exigirPermissao('folha:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const { reconhecerAlertas, ...ajustes } = validar(esquemaAjusteItem, req.body);
  res.json(
    folhaServico.ajustarItem(
      identidade.tenantId,
      param(req, 'id'),
      param(req, 'colaboradorId'),
      ajustes,
      reconhecerAlertas ?? false,
      identidade.usuarioId,
    ),
  );
});

rotasFolhas.post('/:id/fechar', exigirPermissao('folha:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const { reconhecerAlertas } = validar(esquemaFecharFolha, req.body ?? {});
  res.json(folhaServico.fecharFolha(identidade.tenantId, param(req, 'id'), reconhecerAlertas, identidade.usuarioId));
});

rotasFolhas.post('/:id/reabrir', exigirPermissao('folha:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(folhaServico.reabrirFolha(identidade.tenantId, param(req, 'id'), identidade.usuarioId));
});

/** O caminho relatorio -> banco: gera o arquivo e marca a folha como PAGA. */
rotasFolhas.post('/:id/remessa', exigirPermissao('banco:escrever'), (req, res) => {
  const { identidade } = sessaoDe(req);
  const dados = validar(esquemaGerarRemessa, req.body);
  const remessa = remessaServico.gerarRemessa(
    identidade.tenantId,
    { ...dados, origem: 'FOLHA', origemId: param(req, 'id') },
    identidade.usuarioId,
  );
  res.status(201).json(remessa);
});
