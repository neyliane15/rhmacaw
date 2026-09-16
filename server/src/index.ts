/**
 * Ponto de entrada da API.
 *
 * `criarApp()` e exportado para os testes (supertest) e o `listen()` so acontece
 * quando o arquivo e executado diretamente — assim o teste nao abre porta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import { config } from './config.js';
import { obterBanco } from './db/conexao.js';
import { criarRoteador, tratadorDeErros } from './rotas/index.js';

export function criarApp(): Express {
  // Abre o banco (e aplica as migracoes) antes de servir a primeira requisicao.
  obterBanco();

  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', criarRoteador());

  // O front compilado, quando existe, e servido pelo mesmo processo: um unico
  // container serve API e interface, que e o que um micro SaaS precisa.
  if (fs.existsSync(config.diretorioWeb)) {
    app.use(express.static(config.diretorioWeb));
    // Qualquer rota nao-API cai no index.html para o roteador do front assumir.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(config.diretorioWeb, 'index.html'));
    });
  }

  app.use(tratadorDeErros);
  return app;
}

export function iniciar(): void {
  const app = criarApp();
  app.listen(config.porta, () => {
    console.log(`[rhmacaw] API em http://localhost:${config.porta}/api (${config.ambiente})`);
    console.log(`[rhmacaw] banco: ${config.arquivoBanco}`);
    console.log(`[rhmacaw] remessas: ${config.diretorioExportacao}`);
  });
}

const executadoDiretamente = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url ||
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (executadoDiretamente) iniciar();
