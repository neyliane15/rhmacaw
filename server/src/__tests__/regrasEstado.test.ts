/**
 * As seis regras de estado da secao final do contrato, autorizacao por papel e
 * validacao de entrada.
 *
 * O que estas regras protegem e simples: dinheiro que ja saiu da conta de
 * alguem nao pode ser reescrito. Um sistema de folha que deixa reabrir uma
 * competencia paga perde a trilha de auditoria.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { COMPETENCIA, bearer, encerrarAmbiente, prepararAmbiente, tokenDoPapel } from './apoio.js';

let app: Express;
let token: string;
let colaboradorId: string;

const comoAdmin = (metodo: 'get' | 'post' | 'put' | 'delete', rota: string) =>
  request(app)[metodo](rota).set('Authorization', bearer(token));

/** Processa e fecha uma folha, devolvendo o id. */
async function folhaFechada(competencia: string): Promise<string> {
  const folha = await comoAdmin('post', '/api/folhas/processar').send({
    competencia,
    tipo: 'MENSAL',
    dataPagamento: '2025-09-05',
  });
  await comoAdmin('post', `/api/folhas/${folha.body.id}/fechar`).send({ reconhecerAlertas: true });
  return folha.body.id;
}

beforeAll(async () => {
  const ambiente = await prepararAmbiente();
  app = ambiente.app;
  token = ambiente.token;
  const lista = await comoAdmin('get', '/api/colaboradores?porPagina=100');
  colaboradorId = lista.body.itens[0].id;
});

afterAll(async () => {
  await encerrarAmbiente();
});

describe('regra 2 — folha PAGA e imutavel', () => {
  it('recusa reabrir uma folha que ja virou pagamento', async () => {
    const folhaId = await folhaFechada(COMPETENCIA);
    await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-09-05',
    });

    const r = await comoAdmin('post', `/api/folhas/${folhaId}/reabrir`).send({});
    expect(r.status).toBe(409);
    expect(r.body.mensagem.toLowerCase()).toContain('paga');
  });

  it('recusa ajustar contracheque de folha paga', async () => {
    const folhas = await comoAdmin('get', `/api/folhas?competencia=${COMPETENCIA}`);
    const paga = folhas.body.find((f: { status: string }) => f.status === 'PAGA');
    const r = await comoAdmin('put', `/api/folhas/${paga.id}/itens/${colaboradorId}`).send({
      eventos: [{ codigo: '099', descricao: 'Bonus', natureza: 'PROVENTO', valor: 500 }],
    });
    expect(r.status).toBe(409);
  });
});

describe('regra 3 — remessa exige origem fechada', () => {
  it('recusa gerar remessa de folha em RASCUNHO', async () => {
    const folha = await comoAdmin('post', '/api/folhas/processar').send({
      competencia: '2025-07',
      tipo: 'MENSAL',
      dataPagamento: '2025-08-05',
    });
    const r = await comoAdmin('post', `/api/folhas/${folha.body.id}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-08-05',
    });
    expect(r.status).toBe(409);
    expect(r.body.mensagem.toUpperCase()).toContain('FECHADA');
  });
});

describe('regra 4 — uma remessa ativa por origem', () => {
  it('recusa gerar a segunda remessa da mesma folha', async () => {
    const folhaId = await folhaFechada('2025-06');
    const primeira = await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-07-05',
    });
    expect(primeira.status).toBe(201);

    const segunda = await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-07-05',
    });
    expect(segunda.status).toBe(409);
  });

  it('libera nova remessa depois que a anterior e cancelada', async () => {
    const folhaId = await folhaFechada('2025-05');
    const primeira = await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-06-05',
    });
    await comoAdmin('post', `/api/banco/remessas/${primeira.body.id}/status`).send({ status: 'CANCELADA' });

    const segunda = await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-06-05',
    });
    expect(segunda.status).toBe(201);
    expect(segunda.body.numeroRemessa).toBeGreaterThan(primeira.body.numeroRemessa);
  });

  it('cancelar a remessa devolve a folha para FECHADA', async () => {
    const folhaId = await folhaFechada('2025-02');
    const remessa = await comoAdmin('post', `/api/folhas/${folhaId}/remessa`).send({
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-03-05',
    });
    expect((await comoAdmin('get', `/api/folhas/${folhaId}`)).body.status).toBe('PAGA');

    await comoAdmin('post', `/api/banco/remessas/${remessa.body.id}/status`).send({ status: 'CANCELADA' });
    const depois = await comoAdmin('get', `/api/folhas/${folhaId}`);
    expect(depois.body.status).toBe('FECHADA');
    expect(depois.body.pagoEm).toBeFalsy();
  });
});

describe('regra 5 — valor a transferir nao positivo fica fora do arquivo', () => {
  it('isola o colaborador sem valor liquido nas inconsistencias da previa', async () => {
    // Colaborador afastado: entra na folha zerado e nao pode gerar pagamento.
    const afastado = await comoAdmin('post', '/api/colaboradores').send({
      nome: 'COLABORADOR SEM LIQUIDO',
      cpf: '39053344705',
      funcao: 'GARCOM',
      centroCusto: 'FOLHA TOKITO',
      tipoContrato: 'CLT',
      situacao: 'AFASTADO',
      salarioBase: 2035,
      cargaHorariaMensal: 220,
      valeTransporte: false,
      pontosComissao: 0,
      dependentesIRRF: 0,
      dependentesSalarioFamilia: 0,
      periculosidade: false,
      admissao: '2025-04-01',
    });
    expect(afastado.status).toBe(201);

    const folhaId = await folhaFechada('2025-04');
    const previa = await comoAdmin('post', '/api/banco/previa').send({
      origem: 'FOLHA',
      origemId: folhaId,
      layout: 'CNAB240',
      bancoCodigo: '341',
      dataPagamento: '2025-05-05',
    });
    expect(previa.status).toBe(200);

    const semLiquido = previa.body.favorecidos.find(
      (f: { nome: string }) => f.nome === 'COLABORADOR SEM LIQUIDO',
    );
    // Ou ficou de fora da lista, ou esta la marcado como invalido — nunca valido.
    expect(semLiquido?.valido ?? false).toBe(false);
  });
});

describe('regra 6 — competencia fechada nao aceita lancamento', () => {
  it('recusa lancar falta em competencia com folha ja paga', async () => {
    const r = await comoAdmin('post', '/api/faltas').send({
      colaboradorId,
      data: `${COMPETENCIA}-25`,
      tipo: 'FALTA',
    });
    expect(r.status).toBe(409);
  });
});

describe('autorizacao por papel', () => {
  it('LEITURA nao processa folha nem gera remessa', async () => {
    const leitura = await tokenDoPapel(app, token, 'LEITURA');
    const processar = await request(app)
      .post('/api/folhas/processar')
      .set('Authorization', bearer(leitura))
      .send({ competencia: '2025-03', tipo: 'MENSAL', dataPagamento: '2025-04-05' });
    expect(processar.status).toBe(403);

    const conta = await request(app).put('/api/banco/conta').set('Authorization', bearer(leitura)).send({});
    expect(conta.status).toBe(403);
  });

  it('LEITURA continua enxergando os relatorios', async () => {
    const leitura = await tokenDoPapel(app, token, 'LEITURA');
    const r = await request(app)
      .get(`/api/relatorios/folha-analitica?competencia=${COMPETENCIA}`)
      .set('Authorization', bearer(leitura));
    expect(r.status).toBe(200);
  });

  it('RH cuida de pessoas mas nao mexe na conta bancaria', async () => {
    const rh = await tokenDoPapel(app, token, 'RH');
    const falta = await request(app)
      .post('/api/faltas')
      .set('Authorization', bearer(rh))
      .send({ colaboradorId, data: '2025-03-10', tipo: 'ATESTADO' });
    expect(falta.status).toBe(201);

    const conta = await request(app).put('/api/banco/conta').set('Authorization', bearer(rh)).send({});
    expect(conta.status).toBe(403);
  });

  it('FINANCEIRO gera remessa mas nao cadastra colaborador', async () => {
    const financeiro = await tokenDoPapel(app, token, 'FINANCEIRO');
    const cadastro = await request(app)
      .post('/api/colaboradores')
      .set('Authorization', bearer(financeiro))
      .send({ nome: 'X', cpf: '11144477735', funcao: 'Y' });
    expect(cadastro.status).toBe(403);

    const remessas = await request(app).get('/api/banco/remessas').set('Authorization', bearer(financeiro));
    expect(remessas.status).toBe(200);
  });

  it('so ADMIN cria usuario', async () => {
    const rh = await tokenDoPapel(app, token, 'RH');
    const r = await request(app)
      .post('/api/auth/usuarios')
      .set('Authorization', bearer(rh))
      .send({ nome: 'Novo', email: 'novo@rhmacaw.com.br', senha: 'Macaw@2025', papel: 'LEITURA' });
    expect(r.status).toBe(403);
  });
});

describe('entrada invalida vira 400 ou 404, nunca 500', () => {
  const casos: [string, 'get' | 'post' | 'put', string, object | undefined, number][] = [
    ['competencia fora do formato', 'post', '/api/folhas/processar', { competencia: '08-2025', tipo: 'MENSAL', dataPagamento: '2025-09-05' }, 400],
    ['mes 13 na competencia', 'post', '/api/folhas/processar', { competencia: '2025-13', tipo: 'MENSAL', dataPagamento: '2025-09-05' }, 400],
    ['tipo de folha inexistente', 'post', '/api/folhas/processar', { competencia: '2025-02', tipo: 'INVENTADO', dataPagamento: '2025-03-05' }, 400],
    ['CPF com digito verificador errado', 'post', '/api/colaboradores', { nome: 'T', cpf: '11111111111', funcao: 'F', centroCusto: 'C', tipoContrato: 'CLT', situacao: 'ATIVO', salarioBase: 2000, cargaHorariaMensal: 220, valeTransporte: false, pontosComissao: 0, dependentesIRRF: 0, dependentesSalarioFamilia: 0, periculosidade: false, admissao: '2025-01-02' }, 400],
    ['corpo vazio no cadastro', 'post', '/api/colaboradores', {}, 400],
    ['data de falta invalida', 'post', '/api/faltas', { colaboradorId: 'x', data: '31/08/2025', tipo: 'FALTA' }, 400],
    ['folha inexistente', 'get', '/api/folhas/flh_nao_existe', undefined, 404],
    ['colaborador inexistente', 'get', '/api/colaboradores/col_nao_existe', undefined, 404],
    ['remessa inexistente', 'get', '/api/banco/remessas/rem_nao_existe', undefined, 404],
    ['banco fora do catalogo', 'post', '/api/banco/previa', { origem: 'FOLHA', origemId: 'x', layout: 'CNAB240', bancoCodigo: '999', dataPagamento: '2025-09-05' }, 404],
  ];

  // No caso do banco fora do catalogo a origem inexistente e checada primeiro:
  // 404 e a resposta correta, e nao revela se o banco 999 existiria.
  it.each(casos)('%s', async (_nome, metodo, rota, corpo, esperado) => {
    const req = request(app)[metodo](rota).set('Authorization', bearer(token));
    const r = corpo === undefined ? await req : await req.send(corpo);
    expect(r.status).toBe(esperado);
    expect(r.body).toHaveProperty('mensagem');
  });

  it('nenhuma entrada malformada produz erro 500', async () => {
    for (const [, metodo, rota, corpo] of casos) {
      const req = request(app)[metodo](rota).set('Authorization', bearer(token));
      const r = corpo === undefined ? await req : await req.send(corpo);
      expect(r.status, `${metodo} ${rota}`).toBeLessThan(500);
    }
  });
});
