/**
 * Adaptador que expoe a API do `better-sqlite3` sobre o sql.js (SQLite
 * compilado para WebAssembly).
 *
 * O servidor real fala `db.prepare(sql).get/all/run`, `db.exec`, `db.pragma` e
 * `db.transaction`. Reproduzindo essa superficie, os 2.000 e poucos linhas de
 * repositorio e as migracoes rodam no navegador sem alteracao: a demonstracao
 * executa o MESMO SQL que o servidor, num SQLite de verdade.
 */

interface EstatisticaSqlJs {
  bind(parametros: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
  reset(): void;
}

interface BancoSqlJs {
  prepare(sql: string): EstatisticaSqlJs;
  run(sql: string, parametros?: unknown[]): void;
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  export(): Uint8Array;
  close(): void;
  getRowsModified(): number;
}

export interface Estatistica {
  get(...parametros: unknown[]): Record<string, unknown> | undefined;
  all(...parametros: unknown[]): Record<string, unknown>[];
  run(...parametros: unknown[]): { changes: number; lastInsertRowid: number };
}

export interface BancoCompativel {
  prepare(sql: string): Estatistica;
  exec(sql: string): void;
  pragma(instrucao: string): unknown;
  transaction<T extends (...args: never[]) => unknown>(operacao: T): T;
  close(): void;
  /** Bytes do banco, para persistir entre recarregamentos da pagina. */
  serializar(): Uint8Array;
}

/**
 * O `better-sqlite3` aceita parametros posicionais soltos ou um objeto nomeado;
 * o sql.js quer um array ou um objeto com `:nome`. Esta funcao traduz.
 */
function normalizarParametros(parametros: unknown[]): unknown[] | Record<string, unknown> {
  if (parametros.length === 1 && parametros[0] !== null && typeof parametros[0] === 'object' && !Array.isArray(parametros[0])) {
    const nomeados: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(parametros[0] as Record<string, unknown>)) {
      nomeados[`:${chave}`] = converterValor(valor);
    }
    return nomeados;
  }
  return parametros.map(converterValor);
}

/** SQLite nao conhece boolean nem undefined. */
function converterValor(valor: unknown): unknown {
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  if (valor === undefined) return null;
  return valor;
}

export function envolver(db: BancoSqlJs): BancoCompativel {
  /** Nivel de aninhamento das transacoes em curso. */
  let profundidade = 0;

  return {
    prepare(sql: string): Estatistica {
      return {
        get(...parametros: unknown[]) {
          const st = db.prepare(sql);
          try {
            st.bind(normalizarParametros(parametros) as unknown[]);
            return st.step() ? st.getAsObject() : undefined;
          } finally {
            st.free();
          }
        },
        all(...parametros: unknown[]) {
          const st = db.prepare(sql);
          const linhas: Record<string, unknown>[] = [];
          try {
            st.bind(normalizarParametros(parametros) as unknown[]);
            while (st.step()) linhas.push(st.getAsObject());
            return linhas;
          } finally {
            st.free();
          }
        },
        run(...parametros: unknown[]) {
          const st = db.prepare(sql);
          try {
            st.bind(normalizarParametros(parametros) as unknown[]);
            // `step` tambem executa INSERT/UPDATE e e o unico caminho quando a
            // instrucao usa RETURNING.
            while (st.step()) { /* consome as linhas devolvidas por RETURNING */ }
            return { changes: db.getRowsModified(), lastInsertRowid: 0 };
          } finally {
            st.free();
          }
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    pragma(instrucao: string): unknown {
      // WAL nao existe em memoria; os demais pragmas passam direto.
      if (instrucao.startsWith('journal_mode')) return 'memory';
      try {
        return db.exec(`PRAGMA ${instrucao};`);
      } catch {
        return null;
      }
    },
    transaction<T extends (...args: never[]) => unknown>(operacao: T): T {
      return ((...args: never[]) => {
        // O SQLite nao aninha BEGIN. O `better-sqlite3` resolve isso usando
        // SAVEPOINT a partir do segundo nivel, e o seed depende disso: ele
        // chama servicos que ja abrem a propria transacao.
        const aninhada = profundidade > 0;
        const marca = `nivel_${profundidade}`;
        db.run(aninhada ? `SAVEPOINT ${marca}` : 'BEGIN');
        profundidade += 1;
        try {
          const resultado = operacao(...args);
          db.run(aninhada ? `RELEASE ${marca}` : 'COMMIT');
          return resultado;
        } catch (erro) {
          db.run(aninhada ? `ROLLBACK TO ${marca}` : 'ROLLBACK');
          throw erro;
        } finally {
          profundidade -= 1;
        }
      }) as T;
    },
    close(): void {
      db.close();
    },
    serializar(): Uint8Array {
      return db.export();
    },
  };
}
