/** Conversores usados por todos os repositorios (SQLite nao tem boolean nem JSON). */

export const paraBooleano = (valor: number | null | undefined): boolean => valor === 1;
export const deBooleano = (valor: boolean | null | undefined): number => (valor ? 1 : 0);

/** Le uma coluna TEXT com JSON, devolvendo o fallback quando vazia ou corrompida. */
export function lerJSON<T>(texto: string | null | undefined, padrao: T): T {
  if (!texto) return padrao;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return padrao;
  }
}

export const gravarJSON = (valor: unknown): string => JSON.stringify(valor ?? null);

/** Monta `IN (?, ?, ...)` com a aridade certa; devolve null quando a lista e vazia. */
export function listaIn(quantidade: number): string | null {
  return quantidade > 0 ? `(${new Array(quantidade).fill('?').join(', ')})` : null;
}
