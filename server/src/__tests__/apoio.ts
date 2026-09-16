/**
 * Apoio dos testes de integracao da API.
 *
 * Este modulo NAO importa nada do servidor: ele so define as variaveis de
 * ambiente. E o que garante que `config.ts` — lido uma unica vez, no primeiro
 * import — aponte para o banco temporario deste arquivo de teste, e nao para
 * `data/rhmacaw.db`. Os modulos do servidor entram depois, por import dinamico.
 *
 * Cada arquivo de teste recebe um diretorio proprio: o vitest roda os arquivos
 * em processos separados, entao nao ha banco compartilhado nem ordem a respeitar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type { ColaboradorEntrada, Papel } from '@rhmacaw/shared';

const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'rhmacaw-api-'));
process.env['DATABASE_FILE'] = path.join(temporario, 'teste.db');
process.env['EXPORT_DIR'] = path.join(temporario, 'exports');
process.env['JWT_SECRET'] = 'chave-de-teste';
process.env['WEB_DIST'] = path.join(temporario, 'sem-front');

export const DIRETORIO_TEMPORARIO = temporario;
export const EMAIL_ADMIN = 'admin@rhmacaw.com.br';
export const SENHA_ADMIN = 'Macaw@2025';
/** Competencia que o seed carrega da planilha do cliente. */
export const COMPETENCIA = '2025-08';

export interface Ambiente {
  app: Express;
  token: string;
  tenantId: string;
  usuarioId: string;
}

/** Sobe o banco temporario com o seed aplicado e devolve app + token de ADMIN. */
export async function prepararAmbiente(): Promise<Ambiente> {
  const { executarSeed } = await import('../db/seed.js');
  const resultado = executarSeed();

  const { criarApp } = await import('../index.js');
  const app = criarApp();

  const login = await request(app).post('/api/auth/login').send({ email: EMAIL_ADMIN, senha: SENHA_ADMIN });
  if (login.status !== 200) throw new Error(`Login do seed falhou: ${login.status} ${JSON.stringify(login.body)}`);

  return { app, token: login.body.token, tenantId: resultado.tenantId, usuarioId: login.body.usuario.id };
}

export async function encerrarAmbiente(): Promise<void> {
  const { fecharBanco } = await import('../db/conexao.js');
  fecharBanco();
  fs.rmSync(temporario, { recursive: true, force: true });
}

export const bearer = (token: string): string => `Bearer ${token}`;

/** Cria um usuario com o papel pedido e devolve o token dele. */
export async function tokenDoPapel(app: Express, tokenAdmin: string, papel: Papel): Promise<string> {
  const email = `${papel.toLowerCase()}@rhmacaw.com.br`;
  await request(app)
    .post('/api/auth/usuarios')
    .set('Authorization', bearer(tokenAdmin))
    .send({ nome: `Usuario ${papel}`, email, senha: SENHA_ADMIN, papel });

  const login = await request(app).post('/api/auth/login').send({ email, senha: SENHA_ADMIN });
  if (login.status !== 200) throw new Error(`Login de ${papel} falhou: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

export interface SegundoTenant {
  tenantId: string;
  token: string;
  colaboradorId: string;
}

/**
 * Cria uma segunda empresa completa (tenant, admin, conta pagadora e um
 * colaborador) usando os repositorios reais — nao ha rota publica de cadastro
 * de empresa, e mockar o banco derrotaria o proposito do teste de isolamento.
 */
export async function criarSegundoTenant(app: Express, nome = 'Concorrente Ltda'): Promise<SegundoTenant> {
  const { criarTenant } = await import('../db/repositorios/tenants.js');
  const { criarUsuario } = await import('../db/repositorios/usuarios.js');
  const { salvarContaPagadora } = await import('../db/repositorios/contaPagadora.js');
  const { criarColaborador } = await import('../db/repositorios/colaboradores.js');
  const { gerarHash } = await import('../auth/senha.js');

  const tenant = criarTenant({
    nome,
    cnpj: '11222333000181',
    cnae: '5611201',
    endereco: 'Rua Dois, 200',
    cidade: 'Niteroi',
    uf: 'RJ',
    cep: '24020000',
  });

  const email = 'admin@concorrente.com.br';
  criarUsuario(tenant.id, { nome: 'Admin Concorrente', email, senhaHash: gerarHash(SENHA_ADMIN), papel: 'ADMIN' });

  salvarContaPagadora(tenant.id, {
    bancoCodigo: '237',
    bancoNome: 'BANCO BRADESCO S.A.',
    agencia: '01234',
    agenciaDigito: '5',
    conta: '000000998877',
    contaDigito: '1',
    convenio: '7654321',
    nomeEmpresa: 'CONCORRENTE LTDA',
    cnpj: '11222333000181',
  });

  const entrada: ColaboradorEntrada = {
    nome: 'FUNCIONARIO DO CONCORRENTE',
    cpf: '52998224725',
    funcao: 'COZINHEIRO',
    centroCusto: 'COZINHA CONCORRENTE',
    tipoContrato: 'CLT',
    situacao: 'ATIVO',
    salarioBase: 2500,
    cargaHorariaMensal: 220,
    valeTransporte: false,
    pontosComissao: 1,
    dependentesIRRF: 0,
    dependentesSalarioFamilia: 0,
    periculosidade: false,
    admissao: '2024-03-01',
    bancoCodigo: '237',
    agencia: '01234',
    agenciaDigito: '5',
    conta: '000000112244',
    contaDigito: '3',
    tipoConta: 'CORRENTE',
    tipoPix: 'CPF',
    chavePix: '52998224725',
  };
  const colaborador = criarColaborador(tenant.id, entrada);

  const login = await request(app).post('/api/auth/login').send({ email, senha: SENHA_ADMIN });
  if (login.status !== 200) throw new Error(`Login do segundo tenant falhou: ${JSON.stringify(login.body)}`);

  return { tenantId: tenant.id, token: login.body.token, colaboradorId: colaborador.id };
}
