/**
 * Conexao unica com o SQLite.
 *
 * O banco fica em arquivo (WAL) porque a carga de um micro SaaS de folha e
 * dominada por leitura: o WAL permite relatorios concorrentes enquanto a folha
 * e processada numa transacao.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { aplicarMigracoes } from './migracoes.js';

export type Banco = Database.Database;

let instancia: Banco | null = null;

/**
 * Injeta uma conexao ja pronta, no lugar de abrir um arquivo.
 *
 * Serve a demonstracao que roda no navegador, onde o SQLite e a versao
 * compilada para WebAssembly e nao existe disco. Em producao nunca e chamada:
 * `obterBanco` segue abrindo o arquivo normalmente.
 */
export function __definirBanco(externo: unknown): void {
  instancia = externo as Banco;
}

/** Abre (ou reaproveita) a conexao e garante que o schema esta aplicado. */
export function obterBanco(): Banco {
  if (instancia) return instancia;

  fs.mkdirSync(path.dirname(config.arquivoBanco), { recursive: true });
  const db = new Database(config.arquivoBanco);

  // `foreign_keys` e opt-in no SQLite; sem ele, os ON DELETE CASCADE do schema
  // seriam ignorados e sobrariam itens de folha orfaos.
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  // Sem timeout o processo de seed colide com um servidor aberto no mesmo arquivo.
  db.pragma('busy_timeout = 5000');

  aplicarMigracoes(db);
  instancia = db;
  return db;
}

export function fecharBanco(): void {
  if (instancia) {
    instancia.close();
    instancia = null;
  }
}

/** Executa um bloco dentro de uma transacao (rollback automatico em erro). */
export function emTransacao<T>(operacao: () => T): T {
  const db = obterBanco();
  return db.transaction(operacao)();
}

/** Identificador curto, ordenavel por tempo, legivel em log e URL. */
export function novoId(prefixo: string): string {
  const tempo = Date.now().toString(36);
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `${prefixo}_${tempo}${aleatorio}`;
}

export function agora(): string {
  return new Date().toISOString();
}
