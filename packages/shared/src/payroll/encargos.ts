/**
 * Calculo dos encargos incidentes sobre a remuneracao: INSS progressivo,
 * IRRF, FGTS e salario-familia.
 */
import { arredondar, naoNegativo } from '../util/money.js';
import type { DataISO } from '../util/datas.js';
import { ALIQUOTA_FGTS, tabelaVigente, type TabelaVigente } from './tabelas.js';

export interface ResultadoINSS {
  base: number;
  valor: number;
  aliquotaEfetiva: number;
  /** Detalhamento por faixa, usado no demonstrativo. */
  faixas: { ate: number; aliquota: number; parcela: number; valor: number }[];
}

/**
 * INSS do segurado empregado, progressivo por faixas (art. 28 Lei 8.212/91 com
 * a redacao da EC 103/2019): cada faixa incide apenas sobre a parcela da
 * remuneracao que cai dentro dela, e o desconto para no teto.
 */
export function calcularINSS(base: number, competenciaData: DataISO, tabela?: TabelaVigente): ResultadoINSS {
  const tab = tabela ?? tabelaVigente(competenciaData);
  const baseLimitada = Math.min(naoNegativo(base), tab.tetoINSS);
  const faixas: ResultadoINSS['faixas'] = [];
  let anterior = 0;
  let total = 0;

  for (const faixa of tab.inss) {
    if (baseLimitada <= anterior) break;
    const parcela = Math.min(baseLimitada, faixa.ate) - anterior;
    const valor = arredondar(parcela * faixa.aliquota);
    faixas.push({ ate: faixa.ate, aliquota: faixa.aliquota, parcela: arredondar(parcela), valor });
    total += valor;
    anterior = faixa.ate;
  }

  const valor = arredondar(total);
  return {
    base: arredondar(baseLimitada),
    valor,
    aliquotaEfetiva: baseLimitada > 0 ? arredondar(valor / baseLimitada, 4) : 0,
    faixas,
  };
}

export interface ResultadoIRRF {
  base: number;
  valor: number;
  aliquota: number;
  deducao: number;
  /** `true` quando o desconto simplificado foi mais vantajoso que as deducoes legais. */
  usouDescontoSimplificado: boolean;
  deducoesAplicadas: number;
}

export interface EntradaIRRF {
  /** Remuneracao tributavel bruta (ja sem verbas isentas). */
  rendimentoBruto: number;
  /** INSS retido no mes, dedutivel da base. */
  inss: number;
  dependentes: number;
  /** Pensao alimenticia judicial, dedutivel integralmente. */
  pensaoAlimenticia?: number;
  /** Outras deducoes legais (previdencia privada etc.). */
  outrasDeducoes?: number;
}

/**
 * IRRF retido na fonte. Compara o modelo de deducoes legais com o desconto
 * simplificado (Lei 14.848/2024) e aplica o que resultar em menor imposto.
 */
export function calcularIRRF(entrada: EntradaIRRF, competenciaData: DataISO, tabela?: TabelaVigente): ResultadoIRRF {
  const tab = tabela ?? tabelaVigente(competenciaData);
  const bruto = naoNegativo(entrada.rendimentoBruto);
  const pensao = naoNegativo(entrada.pensaoAlimenticia ?? 0);

  const deducoesLegais = arredondar(
    naoNegativo(entrada.inss) + entrada.dependentes * tab.deducaoDependente + pensao + naoNegativo(entrada.outrasDeducoes ?? 0),
  );
  // O desconto simplificado substitui todas as deducoes, exceto a pensao.
  const deducaoSimplificada = arredondar(tab.descontoSimplificado + pensao);

  const aplicar = (deducoes: number): { imposto: number; base: number; aliquota: number; deducao: number } => {
    const base = naoNegativo(bruto - deducoes);
    const faixa = tab.irrf.find((f) => base <= f.ate) ?? (tab.irrf[tab.irrf.length - 1] as (typeof tab.irrf)[number]);
    return { imposto: naoNegativo(base * faixa.aliquota - faixa.deducao), base, aliquota: faixa.aliquota, deducao: faixa.deducao };
  };

  const porDeducoes = aplicar(deducoesLegais);
  const porSimplificado = aplicar(deducaoSimplificada);
  const usouSimplificado = porSimplificado.imposto < porDeducoes.imposto;
  const escolhido = usouSimplificado ? porSimplificado : porDeducoes;

  return {
    base: escolhido.base,
    valor: arredondar(escolhido.imposto),
    aliquota: escolhido.aliquota,
    deducao: escolhido.deducao,
    usouDescontoSimplificado: usouSimplificado,
    deducoesAplicadas: usouSimplificado ? deducaoSimplificada : deducoesLegais,
  };
}

/** FGTS depositado pelo empregador (8% da remuneracao, sem teto). */
export function calcularFGTS(base: number): number {
  return arredondar(naoNegativo(base) * ALIQUOTA_FGTS);
}

/**
 * Salario-familia por dependente de ate 14 anos, devido apenas a quem recebe
 * remuneracao dentro do limite legal. E cota patronal: soma como provento e
 * nao integra base de INSS/IRRF/FGTS.
 */
export function calcularSalarioFamilia(remuneracao: number, dependentes: number, competenciaData: DataISO, tabela?: TabelaVigente): number {
  const tab = tabela ?? tabelaVigente(competenciaData);
  if (dependentes <= 0) return 0;
  const faixa = tab.salarioFamilia.find((f) => remuneracao <= f.limiteRemuneracao);
  return faixa ? arredondar(faixa.valorPorDependente * dependentes) : 0;
}

/**
 * INSS do 13o salario. E tributado em separado da folha mensal, com a mesma
 * tabela progressiva mas base propria.
 */
export function calcularINSSDecimoTerceiro(baseDecimo: number, competenciaData: DataISO): ResultadoINSS {
  return calcularINSS(baseDecimo, competenciaData);
}

/**
 * INSS do contribuinte individual (pro-labore de socio/administrador):
 * aliquota unica de 11% sobre o valor declarado, limitada ao teto
 * (art. 4o da Lei 10.666/2003). Nao usa as faixas progressivas do empregado.
 */
export function calcularINSSProLabore(base: number, competenciaData: DataISO, tabela?: TabelaVigente): ResultadoINSS {
  const tab = tabela ?? tabelaVigente(competenciaData);
  const baseLimitada = Math.min(naoNegativo(base), tab.tetoINSS);
  const valor = arredondar(baseLimitada * 0.11);
  return {
    base: arredondar(baseLimitada),
    valor,
    aliquotaEfetiva: baseLimitada > 0 ? arredondar(valor / baseLimitada, 4) : 0,
    faixas: [{ ate: tab.tetoINSS, aliquota: 0.11, parcela: arredondar(baseLimitada), valor }],
  };
}
