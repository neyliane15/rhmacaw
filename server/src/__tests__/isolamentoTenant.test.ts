/**
 * Isolamento entre empresas.
 *
 * Este e o teste de seguranca mais importante do sistema: num SaaS
 * multi-empresa, um vazamento aqui expoe salario, CPF e conta bancaria de
 * gente real para outro cliente.
 *
 * A postura de cada caso e a mesma: o segundo tenant recebe o ID de um
 * recurso do primeiro e tenta usa-lo. A resposta correta e 404 (o recurso
 * "nao existe" para quem nao e dono) ou 403 — nunca 200, e nunca um 500 que
 * revele que o ID existe em algum lugar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  COMPETENCIA,
  bearer,
  criarSegundoTenant,
  encerrarAmbiente,
  prepararAmbiente,
  type SegundoTenant,
} from './apoio.js';

let app: Express;
let tokenDono: string;
let intruso: SegundoTenant;

/** IDs que pertencem ao primeiro tenant e que o intruso vai tentar alcancar. */
const alvo = {
  colaboradorId: '',
  folhaId: '',
  faltaId: '',
  periodoId: '',
  remessaId: '',
  feriasId: '',
};

beforeAll(async () => {
  const ambiente = await prepararAmbiente();
  app = ambiente.app;
  tokenDono = ambiente.token;
  intruso = await criarSegundoTenant(app);

  const comoDono = (metodo: 'get' | 'post', rota: string) =>
    request(app)[metodo](rota).set('Authorization', bearer(tokenDono));

  const colaboradores = await comoDono('get', '/api/colaboradores?porPagina=100');
  alvo.colaboradorId = colaboradores.body.itens[0].id;

  const folha = await comoDono('post', '/api/folhas/processar').send({
    competencia: COMPETENCIA,
    tipo: 'MENSAL',
    dataPagamento: '2025-09-05',
  });
  alvo.folhaId = folha.body.id;

  const falta = await comoDono('post', '/api/faltas').send({
    colaboradorId: alvo.colaboradorId,
    data: '2025-08-20',
    tipo: 'FALTA',
  });
  alvo.faltaId = falta.body.id;

  const periodos = await comoDono('get', '/api/comissoes/periodos');
  alvo.periodoId = periodos.body[0].id;

  const ferias = await comoDono('post', '/api/ferias').send({
    colaboradorId: alvo.colaboradorId,
    periodoAquisitivoInicio: '2024-01-01',
    periodoAquisitivoFim: '2024-12-31',
    inicioGozo: '2026-01-05',
    diasGozo: 30,
    diasAbono: 0,
    adiantarDecimoTerceiro: false,
  });
  alvo.feriasId = ferias.body.id;

  await comoDono('post', `/api/folhas/${alvo.folhaId}/fechar`).send({});
  const remessa = await comoDono('post', `/api/folhas/${alvo.folhaId}/remessa`).send({
    layout: 'CNAB240',
    bancoCodigo: '341',
    dataPagamento: '2025-09-05',
  });
  alvo.remessaId = remessa.body.id;
});

afterAll(async () => {
  await encerrarAmbiente();
});

/** Toda requisicao deste bloco usa o token do intruso. */
const comoIntruso = (metodo: 'get' | 'post' | 'put' | 'delete', rota: string) =>
  request(app)[metodo](rota).set('Authorization', bearer(intruso.token));

describe('listagens nao vazam registros de outra empresa', () => {
  it('a lista de colaboradores mostra so o quadro da propria empresa', async () => {
    const r = await comoIntruso('get', '/api/colaboradores?porPagina=100');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.itens[0].id).toBe(intruso.colaboradorId);
    expect(r.body.itens.map((c: { nome: string }) => c.nome)).not.toContain('ALEPH SOUZA CORDOVIL');
  });

  it('a lista de folhas nao traz a folha da outra empresa', async () => {
    const r = await comoIntruso('get', '/api/folhas');
    expect(r.status).toBe(200);
    expect(r.body.map((f: { id: string }) => f.id)).not.toContain(alvo.folhaId);
  });

  it('a lista de remessas nao traz a remessa da outra empresa', async () => {
    const r = await comoIntruso('get', '/api/banco/remessas');
    expect(r.status).toBe(200);
    expect(r.body.map((x: { id: string }) => x.id)).not.toContain(alvo.remessaId);
  });

  it('as listas de faltas, ferias e periodos de comissao vem vazias', async () => {
    for (const rota of ['/api/faltas', '/api/ferias', '/api/comissoes/periodos', '/api/rescisoes']) {
      const r = await comoIntruso('get', rota);
      expect(r.status, rota).toBe(200);
      expect(Array.isArray(r.body) ? r.body : r.body.itens, rota).toHaveLength(0);
    }
  });

  it('o painel conta so os colaboradores da propria empresa', async () => {
    const r = await comoIntruso('get', `/api/dashboard?competencia=${COMPETENCIA}`);
    expect(r.status).toBe(200);
    expect(r.body.colaboradoresAtivos).toBe(1);
    expect(r.body.custoFolha).toBe(0); // o intruso nao processou folha nenhuma
  });

  it('os saldos de ferias listam so o proprio quadro', async () => {
    const r = await comoIntruso('get', '/api/ferias/saldos');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].colaboradorId).toBe(intruso.colaboradorId);
  });
});

describe('leitura direta por ID de outra empresa e negada', () => {
  const casos: [string, string][] = [
    ['colaborador', '/api/colaboradores/:colaboradorId'],
    ['historico do colaborador', '/api/colaboradores/:colaboradorId/historico'],
    ['folha', '/api/folhas/:folhaId'],
    ['contracheque', '/api/folhas/:folhaId/itens/:colaboradorId'],
    ['exportacao da folha', '/api/folhas/:folhaId/exportar?formato=csv'],
    ['periodo de comissao', '/api/comissoes/periodos/:periodoId'],
    ['remessa', '/api/banco/remessas/:remessaId'],
    ['arquivo da remessa', '/api/banco/remessas/:remessaId/arquivo'],
  ];

  it.each(casos)('nao devolve %s de outra empresa', async (_nome, molde) => {
    const rota = molde
      .replace(':colaboradorId', alvo.colaboradorId)
      .replace(':folhaId', alvo.folhaId)
      .replace(':periodoId', alvo.periodoId)
      .replace(':remessaId', alvo.remessaId);
    const r = await comoIntruso('get', rota);
    expect(r.status).toBe(404);
  });
});

describe('escrita sobre registro de outra empresa e negada', () => {
  it('nao altera o cadastro de colaborador alheio', async () => {
    const r = await comoIntruso('put', `/api/colaboradores/${alvo.colaboradorId}`).send({ salarioBase: 99999 });
    expect(r.status).toBe(404);

    // E o dado original continua intacto.
    const conferencia = await request(app)
      .get(`/api/colaboradores/${alvo.colaboradorId}`)
      .set('Authorization', bearer(tokenDono));
    expect(conferencia.body.salarioBase).not.toBe(99999);
  });

  it('nao apaga colaborador alheio', async () => {
    const r = await comoIntruso('delete', `/api/colaboradores/${alvo.colaboradorId}`);
    expect(r.status).toBe(404);
  });

  it('nao apaga falta alheia', async () => {
    const r = await comoIntruso('delete', `/api/faltas/${alvo.faltaId}`);
    expect(r.status).toBe(404);
  });

  it('nao cancela ferias alheias', async () => {
    const r = await comoIntruso('delete', `/api/ferias/${alvo.feriasId}`);
    expect(r.status).toBe(404);
  });

  it('nao reabre a folha da outra empresa', async () => {
    const r = await comoIntruso('post', `/api/folhas/${alvo.folhaId}/reabrir`).send({});
    expect(r.status).toBe(404);

    const conferencia = await request(app)
      .get(`/api/folhas/${alvo.folhaId}`)
      .set('Authorization', bearer(tokenDono));
    expect(conferencia.body.status).toBe('PAGA');
  });

  it('nao gera remessa a partir da folha da outra empresa', async () => {
    const r = await comoIntruso('post', `/api/folhas/${alvo.folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '237',
      dataPagamento: '2025-09-05',
    });
    expect(r.status).toBe(404);
  });

  it('nao muda o status da remessa alheia', async () => {
    const r = await comoIntruso('post', `/api/banco/remessas/${alvo.remessaId}/status`).send({ status: 'CANCELADA' });
    expect(r.status).toBe(404);

    const conferencia = await request(app)
      .get(`/api/banco/remessas/${alvo.remessaId}`)
      .set('Authorization', bearer(tokenDono));
    expect(conferencia.body.status).toBe('GERADA');
  });

  it('nao lanca falta para colaborador de outra empresa', async () => {
    const r = await comoIntruso('post', '/api/faltas').send({
      colaboradorId: alvo.colaboradorId,
      data: '2025-08-21',
      tipo: 'FALTA',
    });
    expect(r.status).toBe(404);
  });

  it('nao simula rescisao de colaborador alheio', async () => {
    const r = await comoIntruso('post', '/api/rescisoes/simular').send({
      colaboradorId: alvo.colaboradorId,
      dataAviso: '2025-09-01',
      dataDesligamento: '2025-09-30',
      motivo: 'SEM_JUSTA_CAUSA',
      tipoAviso: 'INDENIZADO',
    });
    expect(r.status).toBe(404);
  });

  it('nao gera previa bancaria sobre folha alheia', async () => {
    const r = await comoIntruso('post', '/api/banco/previa').send({
      origem: 'FOLHA',
      origemId: alvo.folhaId,
      layout: 'CNAB240',
      bancoCodigo: '237',
      dataPagamento: '2025-09-05',
    });
    expect(r.status).toBe(404);
  });

  it('nao fecha periodo de comissao alheio', async () => {
    const r = await comoIntruso('post', `/api/comissoes/periodos/${alvo.periodoId}/fechar`).send({});
    expect(r.status).toBe(404);
  });
});

describe('a conta bancaria pagadora e propria de cada empresa', () => {
  it('cada empresa enxerga a propria conta', async () => {
    const doIntruso = await comoIntruso('get', '/api/banco/conta');
    const doDono = await request(app).get('/api/banco/conta').set('Authorization', bearer(tokenDono));
    expect(doIntruso.body.conta).not.toBe(doDono.body.conta);
    expect(doIntruso.body.nomeEmpresa).toBe('CONCORRENTE LTDA');
  });

  it('alterar a propria conta nao afeta a da outra empresa', async () => {
    const antes = await request(app).get('/api/banco/conta').set('Authorization', bearer(tokenDono));
    await comoIntruso('put', '/api/banco/conta').send({
      ...antes.body,
      nomeEmpresa: 'INVASOR SA',
      conta: '000000111111',
    });
    const depois = await request(app).get('/api/banco/conta').set('Authorization', bearer(tokenDono));
    expect(depois.body.nomeEmpresa).toBe(antes.body.nomeEmpresa);
    expect(depois.body.conta).toBe(antes.body.conta);
  });
});

describe('o tenant vem do token, nunca do corpo da requisicao', () => {
  it('ignora tenantId forjado no corpo ao criar colaborador', async () => {
    const r = await comoIntruso('post', '/api/colaboradores').send({
      tenantId: 'outro-tenant-qualquer',
      nome: 'PLANTADO NA OUTRA EMPRESA',
      cpf: '39053344705',
      funcao: 'TESTE',
      centroCusto: 'TESTE',
      tipoContrato: 'CLT',
      situacao: 'ATIVO',
      salarioBase: 2000,
      cargaHorariaMensal: 220,
      valeTransporte: false,
      pontosComissao: 1,
      dependentesIRRF: 0,
      dependentesSalarioFamilia: 0,
      periculosidade: false,
      admissao: '2025-01-02',
    });
    expect(r.status).toBe(201);
    expect(r.body.tenantId).toBe(intruso.tenantId);

    // O colaborador plantado nao aparece para a outra empresa.
    const doDono = await request(app)
      .get('/api/colaboradores?busca=PLANTADO&porPagina=100')
      .set('Authorization', bearer(tokenDono));
    expect(doDono.body.total).toBe(0);
  });

  it('recusa requisicao sem token e com token invalido', async () => {
    expect((await request(app).get('/api/colaboradores')).status).toBe(401);
    expect(
      (await request(app).get('/api/colaboradores').set('Authorization', 'Bearer token.invalido.aqui')).status,
    ).toBe(401);
  });
});
