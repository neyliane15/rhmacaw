/** Montagem do roteador `/api` e o tratamento central de erros. */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { RespostaErro } from '@rhmacaw/shared';
import { config } from '../config.js';
import { ErroDominio } from '../erros.js';
import { rotasAuth } from './auth.js';
import { rotasBanco } from './banco.js';
import { rotasColaboradores } from './colaboradores.js';
import { rotasComissoes } from './comissoes.js';
import { rotasDecimoTerceiro } from './decimoTerceiro.js';
import { rotasFaltas } from './faltas.js';
import { rotasFerias } from './ferias.js';
import { rotasFolhas } from './folhas.js';
import { rotasDashboard, rotasRelatorios } from './relatorios.js';
import { rotasRescisoes } from './rescisoes.js';

export function criarRoteador(): Router {
  const api = Router();

  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', ambiente: config.ambiente, horario: new Date().toISOString() });
  });

  api.use('/auth', rotasAuth);
  api.use('/colaboradores', rotasColaboradores);
  api.use('/faltas', rotasFaltas);
  api.use('/ferias', rotasFerias);
  api.use('/comissoes', rotasComissoes);
  api.use('/folhas', rotasFolhas);
  api.use('/decimo-terceiro', rotasDecimoTerceiro);
  api.use('/rescisoes', rotasRescisoes);
  api.use('/banco', rotasBanco);
  api.use('/dashboard', rotasDashboard);
  api.use('/relatorios', rotasRelatorios);

  api.use((req, res) => {
    const corpo: RespostaErro = {
      erro: 'ROTA_NAO_ENCONTRADA',
      mensagem: `${req.method} ${req.originalUrl} não existe nesta API.`,
    };
    res.status(404).json(corpo);
  });

  return api;
}

/** Violacoes de indice unico do SQLite viram 409, e nao 500. */
function ehConflitoDeBanco(erro: unknown): boolean {
  return erro instanceof Error && 'code' in erro && String(erro.code).startsWith('SQLITE_CONSTRAINT');
}

export function tratadorDeErros(erro: unknown, _req: Request, res: Response, proximo: NextFunction): void {
  if (res.headersSent) {
    proximo(erro);
    return;
  }

  if (erro instanceof ErroDominio) {
    res.status(erro.status).json(erro.paraResposta());
    return;
  }

  if (ehConflitoDeBanco(erro)) {
    const corpo: RespostaErro = {
      erro: 'CONFLITO',
      mensagem: 'A operacao viola uma restricao de unicidade ou integridade do banco.',
    };
    res.status(409).json(corpo);
    return;
  }

  // JSON malformado no corpo: o body-parser do Express marca `type`.
  if (erro instanceof SyntaxError && 'body' in erro) {
    res.status(400).json({ erro: 'VALIDACAO', mensagem: 'Corpo da requisicao não e um JSON válido.' } satisfies RespostaErro);
    return;
  }

  const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado.';
  // Erro nao previsto: registra no console para investigacao e devolve 500.
  console.error('[rhmacaw] erro não tratado:', erro);
  const corpo: RespostaErro = {
    erro: 'ERRO_INTERNO',
    mensagem: config.ambiente === 'production' ? 'Erro interno no servidor.' : mensagem,
  };
  res.status(500).json(corpo);
}
