/**
 * Utilitarios monetarios.
 *
 * Toda a folha trabalha com Reais em `number`, mas nenhum valor persistido ou
 * transferido pode carregar residuo de ponto flutuante: `arredondar` e a unica
 * porta de saida de qualquer calculo financeiro do sistema.
 */

/** Arredonda para centavos usando half-away-from-zero (regra usada na folha). */
export function arredondar(valor: number, casas = 2): number {
  if (!Number.isFinite(valor)) return 0;
  const fator = 10 ** casas;
  const escalado = valor * fator;
  // Corrige a representacao binaria antes de arredondar (ex.: 1.005 * 100 = 100.49999...)
  const corrigido = Number(escalado.toPrecision(12));
  return (corrigido < 0 ? -1 : 1) * Math.round(Math.abs(corrigido)) / fator;
}

/** Soma uma lista de valores arredondando o resultado final. */
export function somar(...valores: number[]): number {
  return arredondar(valores.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0));
}

/** Converte Reais para centavos inteiros (formato exigido pelo CNAB). */
export function paraCentavos(valor: number): number {
  return Math.round(arredondar(Math.abs(valor)) * 100);
}

/** Formata um valor em Reais no padrao brasileiro. */
export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(arredondar(valor));
}

/** Nunca deixa um valor ficar negativo (usado em descontos e bases de calculo). */
export function naoNegativo(valor: number): number {
  return valor > 0 ? arredondar(valor) : 0;
}
