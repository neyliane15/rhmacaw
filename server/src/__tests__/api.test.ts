/**
 * Teste de ponta a ponta do caminho critico: login -> folha -> fechamento ->
 * remessa CNAB, mais as regras de estado da secao final do contrato.
 *
 * Usa um banco proprio em diretorio temporario; as variaveis de ambiente
 * precisam estar definidas ANTES do primeiro import do modulo de configuracao,
 * por isso os imports sao dinamicos.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'rhmacaw-teste-'));
process.env['DATABASE_FILE'] = path.join(temporario, 'teste.db');
process.env['EXPORT_DIR'] = path.join(temporario, 'exports');
process.env['JWT_SECRET'] = 'chave-de-teste';
process.env['WEB_DIST'] = path.join(temporario, 'sem-front');

let app: Express;
let token: string;
let folhaId: string;

const auth = (): string => `Bearer ${token}`;

beforeAll(async () => {
  const { executarSeed } = await import('../db/seed.js');
  executarSeed();

  const { criarApp } = await import('../index.js');
  app = criarApp();

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@rhmacaw.com.br', senha: 'Macaw@2025' });
  expect(login.status).toBe(200);
  token = login.body.token;
});

afterAll(async () => {
  const { fecharBanco } = await import('../db/conexao.js');
  fecharBanco();
  fs.rmSync(temporario, { recursive: true, force: true });
});

describe('autenticacao e isolamento', () => {
  it('recusa requisicao sem token', async () => {
    const resposta = await request(app).get('/api/colaboradores');
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro).toBe('NAO_AUTENTICADO');
  });

  it('recusa token adulterado', async () => {
    const resposta = await request(app).get('/api/colaboradores').set('Authorization', 'Bearer a.b.c');
    expect(resposta.status).toBe(401);
  });

  it('nega escrita bancaria a quem nao e FINANCEIRO ou ADMIN', async () => {
    await request(app)
      .post('/api/auth/usuarios')
      .set('Authorization', auth())
      .send({ nome: 'Leitura Teste', email: 'leitura@rhmacaw.com.br', senha: 'Macaw@2025', papel: 'LEITURA' })
      .expect(201);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leitura@rhmacaw.com.br', senha: 'Macaw@2025' });

    const resposta = await request(app)
      .post('/api/banco/remessas')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ origem: 'FOLHA', origemId: 'x', layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-09-05' });
    expect(resposta.status).toBe(403);
  });
});

describe('seed e cadastro', () => {
  it('importa os 40 colaboradores da planilha com CPF valido', async () => {
    const resposta = await request(app)
      .get('/api/colaboradores?porPagina=500')
      .set('Authorization', auth())
      .expect(200);

    expect(resposta.body.total).toBe(40);
    const { cpfValido } = await import('@rhmacaw/shared');
    expect(resposta.body.itens.every((c: { cpf: string }) => cpfValido(c.cpf))).toBe(true);
  });

  it('distribui as comissoes de agosto exatamente como a planilha', async () => {
    const resposta = await request(app)
      .get('/api/comissoes/periodos?competencia=2025-08')
      .set('Authorization', auth())
      .expect(200);

    const total = resposta.body.reduce((a: number, p: { totalDistribuido: number }) => a + p.totalDistribuido, 0);
    expect(Number(total.toFixed(2))).toBe(25174.1);
  });
});

describe('ciclo da folha ate o banco', () => {
  it('processa a competencia em rascunho', async () => {
    const resposta = await request(app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-08', tipo: 'MENSAL', dataPagamento: '2025-09-05' })
      .expect(201);

    folhaId = resposta.body.id;
    expect(resposta.body.status).toBe('RASCUNHO');
    expect(resposta.body.quantidadeColaboradores).toBe(40);
    expect(resposta.body.totalTransferir).toBeGreaterThan(0);
  });

  it('regra 3: nao gera remessa de folha em rascunho', async () => {
    const resposta = await request(app)
      .post(`/api/folhas/${folhaId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-09-05' });
    expect(resposta.status).toBe(409);
  });

  it('fecha a folha e gera o CNAB 240 com linhas de 240 caracteres', async () => {
    await request(app).post(`/api/folhas/${folhaId}/fechar`).set('Authorization', auth()).send({}).expect(200);

    const remessa = await request(app)
      .post(`/api/folhas/${folhaId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-09-05' })
      .expect(201);

    expect(remessa.body.quantidadePagamentos).toBe(37);
    expect(remessa.body.status).toBe('GERADA');

    const arquivo = await request(app)
      .get(`/api/banco/remessas/${remessa.body.id}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    const linhas = arquivo.text.split('\r\n').filter((l: string) => l.length > 0);
    expect(linhas.length).toBe(78); // header + lote + 37x(A+B) + trailers
    expect(linhas.every((l: string) => l.length === 240)).toBe(true);
  });

  it('regra 2: folha PAGA e imutavel', async () => {
    const folha = await request(app).get(`/api/folhas/${folhaId}`).set('Authorization', auth()).expect(200);
    expect(folha.body.status).toBe('PAGA');

    await request(app).post(`/api/folhas/${folhaId}/reabrir`).set('Authorization', auth()).expect(409);
    await request(app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-08', tipo: 'MENSAL', dataPagamento: '2025-09-05' })
      .expect(409);
  });

  it('regra 4: so uma remessa ativa por origem', async () => {
    const resposta = await request(app)
      .post(`/api/folhas/${folhaId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-09-05' });
    expect(resposta.status).toBe(409);
  });

  it('regra 6: competencia com folha paga nao aceita falta', async () => {
    const colaboradores = await request(app)
      .get('/api/colaboradores?porPagina=1')
      .set('Authorization', auth())
      .expect(200);

    const resposta = await request(app)
      .post('/api/faltas')
      .set('Authorization', auth())
      .send({ colaboradorId: colaboradores.body.itens[0].id, data: '2025-08-12', tipo: 'FALTA' });
    expect(resposta.status).toBe(409);
  });
});

describe('seed idempotente', () => {
  it('rodar de novo nao duplica colaboradores', async () => {
    const { executarSeed } = await import('../db/seed.js');
    // A folha ja esta PAGA neste ponto, entao o reprocessamento e recusado —
    // o que importa aqui e que o cadastro nao duplique.
    expect(() => executarSeed()).toThrowError(/PAGA/);

    const resposta = await request(app)
      .get('/api/colaboradores?porPagina=500')
      .set('Authorization', auth())
      .expect(200);
    expect(resposta.body.total).toBe(40);
  });
});
