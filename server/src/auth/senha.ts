/** Hash de senha com bcrypt. O custo 10 e o equilibrio usual para um SaaS web. */
import bcrypt from 'bcryptjs';

const CUSTO = 10;

export function gerarHash(senha: string): string {
  return bcrypt.hashSync(senha, CUSTO);
}

export function conferirSenha(senha: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(senha, hash);
  } catch {
    // Hash corrompido no banco nao pode virar 500: trata como senha errada.
    return false;
  }
}
