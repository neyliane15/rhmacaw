/** Modulo vazio: o `better-sqlite3` e o `cors` nao existem no navegador. */
export default function naoDisponivel(): never {
  throw new Error('Modulo indisponivel na demonstracao que roda no navegador.');
}
