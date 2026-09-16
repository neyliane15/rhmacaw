/**
 * Emissao e verificacao do JWT.
 *
 * O `tenantId` viaja dentro do token e nunca no corpo/query: e assim que o
 * isolamento multi-tenant fica fora do alcance do cliente.
 */
import jwt from 'jsonwebtoken';
import { PAPEIS, type Papel } from '@rhmacaw/shared';
import { config } from '../config.js';
import type { Identidade } from '../tipos.js';

export interface ConteudoToken {
  sub: string;
  tenantId: string;
  papel: Papel;
}

export interface TokenEmitido {
  token: string;
  expiraEm: string;
}

export function emitirToken(identidade: Identidade): TokenEmitido {
  const conteudo: ConteudoToken = {
    sub: identidade.usuarioId,
    tenantId: identidade.tenantId,
    papel: identidade.papel,
  };
  const token = jwt.sign(conteudo, config.jwtSecret, { expiresIn: config.jwtExpiraEm });
  return { token, expiraEm: new Date(Date.now() + config.jwtExpiraEm * 1000).toISOString() };
}

const ehPapel = (valor: unknown): valor is Papel => PAPEIS.includes(valor as Papel);

/** Devolve a identidade ou `null` se o token estiver ausente, expirado ou adulterado. */
export function verificarToken(token: string): Identidade | null {
  try {
    const conteudo = jwt.verify(token, config.jwtSecret);
    if (typeof conteudo !== 'object' || conteudo === null) return null;

    const { sub, tenantId, papel } = conteudo as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof tenantId !== 'string' || !ehPapel(papel)) return null;

    return { usuarioId: sub, tenantId, papel };
  } catch {
    return null;
  }
}

/** Extrai o token do cabecalho `Authorization: Bearer <token>`. */
export function extrairToken(cabecalho: string | undefined): string | null {
  if (!cabecalho) return null;
  const [esquema, valor] = cabecalho.split(' ');
  if (!valor || esquema?.toLowerCase() !== 'bearer') return null;
  return valor.trim() || null;
}
