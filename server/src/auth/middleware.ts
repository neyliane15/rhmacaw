/**
 * Autenticacao e autorizacao das rotas.
 *
 * `autenticar` resolve a sessao (usuario + tenant) a partir do JWT;
 * `exigirPermissao` confronta a acao pedida com o mapa `PERMISSOES` do shared.
 */
import type { NextFunction, Request, Response } from 'express';
import { PERMISSOES } from '@rhmacaw/shared';
import type { Papel } from '@rhmacaw/shared';
import { erroNaoAutenticado, erroSemPermissao } from '../erros.js';
import { buscarTenant } from '../db/repositorios/tenants.js';
import { buscarUsuario, semSenha } from '../db/repositorios/usuarios.js';
import type { Sessao } from '../tipos.js';
import { extrairToken, verificarToken } from './token.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessao?: Sessao;
    }
  }
}

/**
 * Uma permissao concedida cobre a acao quando e `*`, quando e igual a ela ou
 * quando e o curinga do mesmo recurso (`folha:*` cobre `folha:escrever`).
 */
export function temPermissao(papel: Papel, acao: string): boolean {
  const concedidas = PERMISSOES[papel];
  const [recurso] = acao.split(':');
  return concedidas.some((permissao) => permissao === '*' || permissao === acao || permissao === `${recurso}:*`);
}

export function autenticar(req: Request, _res: Response, next: NextFunction): void {
  const token = extrairToken(req.headers.authorization);
  if (!token) {
    next(erroNaoAutenticado('Informe o cabecalho Authorization: Bearer <token>.'));
    return;
  }

  const identidade = verificarToken(token);
  if (!identidade) {
    next(erroNaoAutenticado('Token invalido ou expirado.'));
    return;
  }

  // O papel e relido do banco a cada requisicao: rebaixar um usuario nao pode
  // depender da expiracao do token que ele ja tem em maos.
  const usuario = buscarUsuario(identidade.tenantId, identidade.usuarioId);
  if (!usuario || !usuario.ativo) {
    next(erroNaoAutenticado('Usuario inativo ou inexistente.'));
    return;
  }

  const tenant = buscarTenant(identidade.tenantId);
  if (!tenant) {
    next(erroNaoAutenticado('Empresa do token nao encontrada.'));
    return;
  }

  req.sessao = {
    identidade: { usuarioId: usuario.id, tenantId: tenant.id, papel: usuario.papel },
    usuario: semSenha(usuario),
    tenant,
  };
  next();
}

export function exigirPermissao(acao: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const sessao = req.sessao;
    if (!sessao) {
      next(erroNaoAutenticado());
      return;
    }
    if (!temPermissao(sessao.identidade.papel, acao)) {
      next(erroSemPermissao(`O papel ${sessao.identidade.papel} nao tem a permissao "${acao}".`));
      return;
    }
    next();
  };
}

/** Sessao garantida dentro de um handler que ja passou por `autenticar`. */
export function sessaoDe(req: Request): Sessao {
  const sessao = req.sessao;
  if (!sessao) throw erroNaoAutenticado();
  return sessao;
}
