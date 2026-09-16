import { Router } from 'express';
import { competenciaDe, hojeISO } from '@rhmacaw/shared';
import { autenticar, exigirPermissao, sessaoDe } from '../auth/middleware.js';
import { erroValidacao } from '../erros.js';
import { montarDashboard } from '../servicos/dashboardServico.js';
import * as relatorios from '../servicos/relatorioServico.js';
import { query } from './http.js';

/** Competencia da query ou, na ausencia, a do mes corrente. */
function competenciaDaQuery(valor: string | undefined): string {
  const competencia = valor ?? competenciaDe(hojeISO());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    throw erroValidacao('Competencia invalida.', [{ campo: 'competencia', mensagem: 'Use o formato YYYY-MM.' }]);
  }
  return competencia;
}

function anoDaQuery(valor: string | undefined): number {
  const ano = Number(valor ?? new Date().getFullYear());
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    throw erroValidacao('Ano invalido.', [{ campo: 'ano', mensagem: 'Use o formato YYYY.' }]);
  }
  return ano;
}

export const rotasDashboard = Router();
rotasDashboard.use(autenticar);

rotasDashboard.get('/', exigirPermissao('relatorios:ler'), (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(montarDashboard(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});

export const rotasRelatorios = Router();
rotasRelatorios.use(autenticar, exigirPermissao('relatorios:ler'));

rotasRelatorios.get('/folha-analitica', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.folhaAnalitica(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});

rotasRelatorios.get('/custo-centro-custo', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.custoPorCentroCusto(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});

rotasRelatorios.get('/comissoes', (req, res) => {
  const { identidade } = sessaoDe(req);
  const competencia = query(req, 'competencia');
  res.json(relatorios.relatorioComissoes(identidade.tenantId, anoDaQuery(query(req, 'ano')), competencia));
});

rotasRelatorios.get('/absenteismo', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.absenteismo(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});

rotasRelatorios.get('/movimentacao', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.movimentacao(identidade.tenantId, anoDaQuery(query(req, 'ano'))));
});

rotasRelatorios.get('/provisoes', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.provisoes(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});

rotasRelatorios.get('/evolucao-folha', (req, res) => {
  const { identidade } = sessaoDe(req);
  res.json(relatorios.evolucaoFolha(identidade.tenantId, competenciaDaQuery(query(req, 'competencia'))));
});
