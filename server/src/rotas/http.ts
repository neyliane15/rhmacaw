/** Ajudantes de HTTP usados pelos routers. */
import type { Request, Response } from 'express';
import { erroValidacao } from '../erros.js';

/**
 * Le um parametro de rota. Com `noUncheckedIndexedAccess`, `req.params.x` e
 * `string | undefined`; este acessador centraliza a checagem.
 */
export function param(req: Request, nome: string): string {
  const valor = req.params[nome];
  if (typeof valor !== 'string' || valor.length === 0) {
    throw erroValidacao(`Parametro de rota "${nome}" ausente.`);
  }
  return valor;
}

/** Valor simples de query string (ignora arrays e objetos aninhados). */
export function query(req: Request, nome: string): string | undefined {
  const valor = req.query[nome];
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

export function enviarArquivo(res: Response, nomeArquivo: string, conteudo: string, tipoConteudo: string): void {
  res.setHeader('Content-Type', tipoConteudo);
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  res.send(conteudo);
}
