/**
 * Substituto do `jsonwebtoken` para a demonstracao.
 *
 * Assina com HMAC-SHA256 de verdade, via WebCrypto — mas de forma SINCRONA nao
 * da para usar WebCrypto, e o servidor real chama `sign`/`verify` de modo
 * sincrono. Como nesta demonstracao o token nunca sai do navegador de quem
 * esta olhando (nao ha servidor, nao ha outro usuario, os dados sao de
 * exemplo), a assinatura e um resumo simples do conteudo com a chave.
 *
 * Isto NAO substitui o `jsonwebtoken` em producao: no servidor real, que e o
 * que vai para o ar, a biblioteca original continua sendo usada.
 */

function base64url(texto: string): string {
  return btoa(unescape(encodeURIComponent(texto))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64url(texto: string): string {
  const completo = texto.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(completo + '==='.slice((completo.length + 3) % 4))));
}

/** Resumo deterministico do payload com a chave (FNV-1a de 64 bits em duas metades). */
function resumir(texto: string, chave: string): string {
  const entrada = `${chave}.${texto}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < entrada.length; i += 1) {
    a = Math.imul(a ^ entrada.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + entrada.charCodeAt(i) * (i + 7), 0x85ebca6b) >>> 0;
  }
  return (a.toString(36) + b.toString(36)).padStart(13, '0');
}

export interface OpcoesAssinatura {
  expiresIn?: string | number;
}

function segundosDe(expiresIn: string | number | undefined): number {
  if (typeof expiresIn === 'number') return expiresIn;
  if (!expiresIn) return 60 * 60 * 12;
  const casou = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!casou) return 60 * 60 * 12;
  const n = Number(casou[1]);
  const unidade = casou[2] as 's' | 'm' | 'h' | 'd';
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[unidade];
}

export function sign(carga: object, chave: string, opcoes: OpcoesAssinatura = {}): string {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...carga, iat: agora, exp: agora + segundosDe(opcoes.expiresIn) };
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const conteudo = base64url(JSON.stringify(corpo));
  return `${cabecalho}.${conteudo}.${resumir(`${cabecalho}.${conteudo}`, chave)}`;
}

export class JsonWebTokenError extends Error {}
export class TokenExpiredError extends JsonWebTokenError {}

export function verify(token: string, chave: string): Record<string, unknown> {
  const partes = token.split('.');
  if (partes.length !== 3) throw new JsonWebTokenError('Token malformado.');
  const [cabecalho, conteudo, assinatura] = partes as [string, string, string];
  if (resumir(`${cabecalho}.${conteudo}`, chave) !== assinatura) throw new JsonWebTokenError('Assinatura invalida.');
  const carga = JSON.parse(deBase64url(conteudo)) as Record<string, unknown>;
  if (typeof carga['exp'] === 'number' && carga['exp'] * 1000 < Date.now()) {
    throw new TokenExpiredError('Token expirado.');
  }
  return carga;
}

export default { sign, verify, JsonWebTokenError, TokenExpiredError };
