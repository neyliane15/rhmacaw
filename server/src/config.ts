/**
 * Configuracao do servidor lida do ambiente.
 *
 * Os caminhos padrao sao resolvidos a partir da raiz do monorepo (e nao do
 * `cwd`) para que `npm run seed -w @rhmacaw/server` e `node server/dist/index.js`
 * apontem sempre para o mesmo banco, independente de onde o comando foi disparado.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esteArquivo = fileURLToPath(import.meta.url);
/** `server/src` (em dev via tsx) ou `server/dist` (apos build). */
const diretorioAtual = path.dirname(esteArquivo);
export const RAIZ_SERVIDOR = path.resolve(diretorioAtual, '..');
export const RAIZ_PROJETO = path.resolve(RAIZ_SERVIDOR, '..');

function caminho(valor: string | undefined, padrao: string): string {
  const bruto = valor?.trim() ? valor.trim() : padrao;
  return path.isAbsolute(bruto) ? bruto : path.resolve(RAIZ_PROJETO, bruto);
}

function inteiro(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
}

export interface Configuracao {
  porta: number;
  ambiente: string;
  jwtSecret: string;
  /** Validade do token em segundos. */
  jwtExpiraEm: number;
  arquivoBanco: string;
  diretorioExportacao: string;
  diretorioWeb: string;
  seedAdminEmail: string;
  seedAdminSenha: string;
}

export const config: Configuracao = {
  porta: inteiro(process.env['PORT'], 3333),
  ambiente: process.env['NODE_ENV']?.trim() || 'development',
  jwtSecret: process.env['JWT_SECRET']?.trim() || 'troque-esta-chave-em-producao',
  jwtExpiraEm: inteiro(process.env['JWT_EXPIRA_SEGUNDOS'], 60 * 60 * 12),
  arquivoBanco: caminho(process.env['DATABASE_FILE'], './data/rhmacaw.db'),
  diretorioExportacao: caminho(process.env['EXPORT_DIR'], './data/exports'),
  diretorioWeb: caminho(process.env['WEB_DIST'], './web/dist'),
  seedAdminEmail: process.env['SEED_ADMIN_EMAIL']?.trim() || 'admin@rhmacaw.com.br',
  seedAdminSenha: process.env['SEED_ADMIN_PASSWORD']?.trim() || 'Macaw@2025',
};
