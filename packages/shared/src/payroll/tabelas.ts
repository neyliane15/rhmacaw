/**
 * Tabelas legais da folha brasileira.
 *
 * Cada tabela e versionada por data de vigencia: o calculo sempre escolhe a
 * versao vigente na competencia processada, para que reprocessar uma folha
 * antiga continue devolvendo o mesmo valor.
 */
import type { DataISO } from '../util/datas.js';

export interface FaixaINSS {
  /** Limite superior da faixa. `Infinity` nunca e usado: o teto encerra a tabela. */
  ate: number;
  aliquota: number;
}

export interface FaixaIRRF {
  ate: number;
  aliquota: number;
  deducao: number;
}

export interface TabelaVigente {
  vigenciaInicio: DataISO;
  inss: FaixaINSS[];
  /** Teto do salario de contribuicao. */
  tetoINSS: number;
  irrf: FaixaIRRF[];
  deducaoDependente: number;
  /** Desconto simplificado do IRRF (Lei 14.848/24); usa-se o que for maior. */
  descontoSimplificado: number;
  salarioMinimo: number;
  /** Faixas do salario-familia: limite de remuneracao -> valor por filho. */
  salarioFamilia: { limiteRemuneracao: number; valorPorDependente: number }[];
}

/** Ordenadas da mais antiga para a mais nova. */
export const TABELAS: TabelaVigente[] = [
  {
    vigenciaInicio: '2024-01-01',
    inss: [
      { ate: 1412.0, aliquota: 0.075 },
      { ate: 2666.68, aliquota: 0.09 },
      { ate: 4000.03, aliquota: 0.12 },
      { ate: 7786.02, aliquota: 0.14 },
    ],
    tetoINSS: 7786.02,
    irrf: [
      { ate: 2259.2, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { ate: Number.POSITIVE_INFINITY, aliquota: 0.275, deducao: 896.0 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 564.8,
    salarioMinimo: 1412.0,
    salarioFamilia: [{ limiteRemuneracao: 1819.26, valorPorDependente: 62.04 }],
  },
  {
    vigenciaInicio: '2025-01-01',
    inss: [
      { ate: 1518.0, aliquota: 0.075 },
      { ate: 2793.88, aliquota: 0.09 },
      { ate: 4190.83, aliquota: 0.12 },
      { ate: 8157.41, aliquota: 0.14 },
    ],
    tetoINSS: 8157.41,
    irrf: [
      { ate: 2259.2, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { ate: Number.POSITIVE_INFINITY, aliquota: 0.275, deducao: 896.0 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 564.8,
    salarioMinimo: 1518.0,
    salarioFamilia: [{ limiteRemuneracao: 1906.04, valorPorDependente: 65.0 }],
  },
  {
    // MP 1.294/2025 — isencao ampliada para dois salarios minimos.
    vigenciaInicio: '2025-05-01',
    inss: [
      { ate: 1518.0, aliquota: 0.075 },
      { ate: 2793.88, aliquota: 0.09 },
      { ate: 4190.83, aliquota: 0.12 },
      { ate: 8157.41, aliquota: 0.14 },
    ],
    tetoINSS: 8157.41,
    irrf: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Number.POSITIVE_INFINITY, aliquota: 0.275, deducao: 908.73 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 607.2,
    salarioMinimo: 1518.0,
    salarioFamilia: [{ limiteRemuneracao: 1906.04, valorPorDependente: 65.0 }],
  },
];

/**
 * Devolve a tabela vigente na data informada. Datas anteriores a primeira
 * vigencia caem na tabela mais antiga conhecida.
 */
export function tabelaVigente(data: DataISO): TabelaVigente {
  let escolhida = TABELAS[0] as TabelaVigente;
  for (const tabela of TABELAS) {
    if (tabela.vigenciaInicio <= data) escolhida = tabela;
    else break;
  }
  return escolhida;
}

/** Percentual maximo do salario que pode ser descontado a titulo de VT. */
export const LIMITE_DESCONTO_VT = 0.06;

/** Aliquota do FGTS depositado pelo empregador. */
export const ALIQUOTA_FGTS = 0.08;

/** Multa rescisoria sobre o saldo do FGTS na dispensa sem justa causa. */
export const MULTA_FGTS_SEM_JUSTA_CAUSA = 0.4;

/** Multa no acordo do art. 484-A da CLT. */
export const MULTA_FGTS_ACORDO = 0.2;

/** Adicional de horas extras nos dias uteis (50%) e domingos/feriados (100%). */
export const ADICIONAL_HORA_EXTRA = 0.5;
export const ADICIONAL_HORA_EXTRA_DOMINGO = 1.0;

/** Adicional noturno urbano (art. 73 CLT). */
export const ADICIONAL_NOTURNO = 0.2;
