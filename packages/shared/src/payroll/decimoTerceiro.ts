/**
 * Decimo terceiro salario (Lei 4.090/62).
 *
 * 1a parcela: 50% da remuneracao, sem descontos, ate 30/11.
 * 2a parcela: valor integral menos a 1a parcela, com INSS e IRRF incidindo
 * sobre o valor integral (tributacao exclusiva na fonte, separada da folha).
 */
import { arredondar, naoNegativo } from '../util/money.js';
import type { DataISO } from '../util/datas.js';
import type { Colaborador, DecimoTerceiro } from '../domain/tipos.js';
import { calcularINSS, calcularIRRF } from './encargos.js';

/**
 * Avos de 13o no ano: conta-se 1/12 por mes em que o colaborador trabalhou ao
 * menos 15 dias (art. 1o, par. 1o). Faltas injustificadas acima de 15 no mes
 * eliminam o avo daquele mes.
 */
export function calcularAvos(
  colaborador: Colaborador,
  ano: number,
  faltasPorMes: Record<string, number> = {},
  referencia?: DataISO,
): number {
  const inicioAno = `${ano}-01-01`;
  const fimAno = referencia && referencia < `${ano}-12-31` ? referencia : `${ano}-12-31`;
  if (colaborador.admissao > fimAno) return 0;

  const inicio = colaborador.admissao > inicioAno ? colaborador.admissao : inicioAno;
  const fim = colaborador.demissao && colaborador.demissao < fimAno ? colaborador.demissao : fimAno;
  if (fim < inicio) return 0;

  let avos = 0;
  for (let mes = 1; mes <= 12; mes += 1) {
    const competencia = `${ano}-${String(mes).padStart(2, '0')}`;
    const primeiroDia = `${competencia}-01`;
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
    if (ultimoDia < inicio || primeiroDia > fim) continue;

    const diaInicial = inicio > primeiroDia ? Number(inicio.slice(8, 10)) : 1;
    const diaFinal = fim < ultimoDia ? Number(fim.slice(8, 10)) : Number(ultimoDia.slice(8, 10));
    const diasNoVinculo = diaFinal - diaInicial + 1;
    const faltas = naoNegativo(faltasPorMes[competencia] ?? 0);

    if (diasNoVinculo - faltas >= 15) avos += 1;
  }
  return Math.min(12, avos);
}

export interface EntradaDecimoTerceiro {
  colaborador: Colaborador;
  ano: number;
  /** Media das comissoes/horas extras do ano — integra a base (Sumula 45 TST). */
  mediaVariaveis: number;
  faltasPorMes?: Record<string, number>;
  /** Primeira parcela ja paga; se ausente, o sistema calcula 50%. */
  primeiraParcelaPaga?: number;
  referencia?: DataISO;
  dataPagamento?: DataISO;
}

/**
 * Calcula 13o integral, 1a e 2a parcela. Quando `primeiraParcelaPaga` e
 * informada, ela e usada como abatimento real (permite adiantamento feito
 * junto com as ferias).
 */
export function calcularDecimoTerceiro(entrada: EntradaDecimoTerceiro): DecimoTerceiro {
  const { colaborador, ano } = entrada;
  const avos = calcularAvos(colaborador, ano, entrada.faltasPorMes ?? {}, entrada.referencia);
  const baseCalculo = arredondar(colaborador.salarioBase + naoNegativo(entrada.mediaVariaveis));
  const valorIntegral = arredondar((baseCalculo / 12) * avos);

  const primeiraParcela =
    entrada.primeiraParcelaPaga !== undefined ? arredondar(entrada.primeiraParcelaPaga) : arredondar(valorIntegral / 2);
  const segundaParcelaBruta = arredondar(valorIntegral - primeiraParcela);

  // INSS e IRRF do 13o incidem uma unica vez, sobre o valor integral, e sao
  // retidos inteiramente na 2a parcela.
  const dataCalculo = entrada.dataPagamento ?? `${ano}-12-20`;
  const resultadoINSS = calcularINSS(valorIntegral, dataCalculo);
  const resultadoIRRF = calcularIRRF(
    { rendimentoBruto: valorIntegral, inss: resultadoINSS.valor, dependentes: colaborador.dependentesIRRF },
    dataCalculo,
  );

  const segundaParcelaLiquida = arredondar(segundaParcelaBruta - resultadoINSS.valor - resultadoIRRF.valor);

  return {
    colaboradorId: colaborador.id,
    colaboradorNome: colaborador.nome,
    ano,
    avos,
    mediaComissoes: arredondar(naoNegativo(entrada.mediaVariaveis)),
    baseCalculo,
    valorIntegral,
    primeiraParcela,
    segundaParcelaBruta,
    inss: resultadoINSS.valor,
    irrf: resultadoIRRF.valor,
    segundaParcelaLiquida,
    totalLiquido: arredondar(primeiraParcela + segundaParcelaLiquida),
  };
}
