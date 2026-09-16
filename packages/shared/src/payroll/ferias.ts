/**
 * Ferias: direito, calculo do recibo e controle do periodo concessivo.
 * Base legal: arts. 129 a 145 da CLT.
 */
import { arredondar, naoNegativo } from '../util/money.js';
import { diasEntre, hojeISO, somarDias, somarMeses, type DataISO } from '../util/datas.js';
import type { Colaborador, Ferias, SaldoFerias } from '../domain/tipos.js';
import { calcularINSS, calcularIRRF } from './encargos.js';
import { DIAS_MES_FOLHA } from './folha.js';

/**
 * Dias de ferias devidos conforme as faltas injustificadas do periodo
 * aquisitivo (art. 130 da CLT).
 */
export function diasDeDireito(faltasInjustificadas: number): number {
  if (faltasInjustificadas <= 5) return 30;
  if (faltasInjustificadas <= 14) return 24;
  if (faltasInjustificadas <= 23) return 18;
  if (faltasInjustificadas <= 32) return 12;
  return 0; // acima de 32 faltas o empregado perde o direito
}

/**
 * Periodo aquisitivo em aberto na data de referencia: 12 meses contados da
 * admissao, renovando a cada aniversario.
 */
export function periodoAquisitivoAtual(admissao: DataISO, referencia: DataISO = hojeISO()): { inicio: DataISO; fim: DataISO; numero: number } {
  let inicio = admissao;
  let numero = 1;
  let fim = somarDias(somarMeses(inicio, 12), -1);
  while (fim < referencia) {
    inicio = somarMeses(inicio, 12);
    fim = somarDias(somarMeses(inicio, 12), -1);
    numero += 1;
  }
  return { inicio, fim, numero };
}

/**
 * Periodo aquisitivo ja fechado cuja fruicao esta em aberto na data de
 * referencia — e sobre ele que o saldo de ferias e apurado.
 *
 * Exportado porque quem consulta o banco precisa saber de QUAL periodo somar
 * os dias ja gozados: somar o gozo da vida inteira zera o saldo de quem tirou
 * ferias uma vez, e isso derruba a verba de ferias vencidas da rescisao.
 */
export function periodoAquisitivoVencido(
  admissao: DataISO,
  referencia: DataISO = hojeISO(),
): { inicio: DataISO; fim: DataISO } {
  const periodo = periodoAquisitivoAtual(admissao, referencia);
  // O saldo em aberto e o do periodo anterior enquanto o atual ainda corre.
  return periodo.numero > 1
    ? { inicio: somarMeses(periodo.inicio, -12), fim: somarDias(periodo.inicio, -1) }
    : { inicio: periodo.inicio, fim: periodo.fim };
}

/**
 * Saldo de ferias do colaborador. O periodo concessivo termina 12 meses apos
 * o fim do aquisitivo; passado esse prazo as ferias sao devidas em dobro.
 *
 * `diasJaGozados` deve ser o gozo DAQUELE periodo aquisitivo, nao o acumulado
 * do vinculo — use `periodoAquisitivoVencido` para filtrar.
 */
export function calcularSaldoFerias(
  colaborador: Colaborador,
  faltasInjustificadasNoPeriodo: number,
  diasJaGozados: number,
  referencia: DataISO = hojeISO(),
): SaldoFerias {
  const periodoVencido = periodoAquisitivoVencido(colaborador.admissao, referencia);
  const limiteConcessivo = somarDias(somarMeses(periodoVencido.fim, 12), 0);
  const diasDireito = diasDeDireito(faltasInjustificadasNoPeriodo);
  const diasSaldo = Math.max(0, diasDireito - diasJaGozados);

  return {
    colaboradorId: colaborador.id,
    colaboradorNome: colaborador.nome,
    periodoAquisitivoInicio: periodoVencido.inicio,
    periodoAquisitivoFim: periodoVencido.fim,
    limiteConcessivo,
    diasDireito,
    diasGozados: diasJaGozados,
    diasSaldo,
    faltasNoPeriodo: faltasInjustificadasNoPeriodo,
    vencida: referencia > limiteConcessivo && diasSaldo > 0,
    diasParaVencer: diasEntre(referencia, limiteConcessivo),
  };
}

export interface EntradaRecibiFerias {
  colaborador: Colaborador;
  /** Media de comissoes dos ultimos 12 meses — integra a base das ferias. */
  mediaComissoes: number;
  diasGozo: number;
  diasAbono: number;
  inicioGozo: DataISO;
  adiantarDecimoTerceiro: boolean;
  dependentesIRRF?: number;
}

export interface ResultadoFerias {
  baseCalculo: number;
  valorFerias: number;
  valorTerco: number;
  valorAbono: number;
  valorTercoAbono: number;
  valorAdiantamentoDecimo: number;
  baseINSS: number;
  inss: number;
  baseIRRF: number;
  irrf: number;
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  fimGozo: DataISO;
  alertas: string[];
}

/**
 * Recibo de ferias.
 *
 * O abono pecuniario e o terco sobre ele sao indenizatorios: nao sofrem INSS
 * nem IRRF (Sumula 386 STJ / Solucao de Consulta Cosit 188/2015). O
 * adiantamento do 13o tambem nao e tributado aqui — ele e acertado na 2a parcela.
 */
export function calcularFerias(entrada: EntradaRecibiFerias): ResultadoFerias {
  const { colaborador } = entrada;
  const alertas: string[] = [];
  const diasGozo = Math.max(0, Math.round(entrada.diasGozo));
  const diasAbono = Math.max(0, Math.round(entrada.diasAbono));

  if (diasGozo + diasAbono > 30) alertas.push('Total de dias (gozo + abono) excede os 30 dias do período aquisitivo.');
  if (diasAbono > 10) alertas.push('Abono pecuniário limitado a 1/3 do período (10 dias) — art. 143 da CLT.');
  if (diasGozo > 0 && diasGozo < 5) alertas.push('Nenhum período de férias pode ser inferior a 5 dias corridos — art. 134, par. 1o.');

  const baseCalculo = arredondar(colaborador.salarioBase + naoNegativo(entrada.mediaComissoes));
  const valorDia = arredondar(baseCalculo / DIAS_MES_FOLHA);

  const valorFerias = arredondar(valorDia * diasGozo);
  const valorTerco = arredondar(valorFerias / 3);
  const valorAbono = arredondar(valorDia * diasAbono);
  const valorTercoAbono = arredondar(valorAbono / 3);
  const valorAdiantamentoDecimo = entrada.adiantarDecimoTerceiro ? arredondar(colaborador.salarioBase / 2) : 0;

  // Tributacao incide apenas sobre ferias gozadas + terco.
  const baseTributavel = arredondar(valorFerias + valorTerco);
  const dataCalculo = entrada.inicioGozo;
  const resultadoINSS = calcularINSS(baseTributavel, dataCalculo);
  const resultadoIRRF = calcularIRRF(
    {
      rendimentoBruto: baseTributavel,
      inss: resultadoINSS.valor,
      dependentes: entrada.dependentesIRRF ?? colaborador.dependentesIRRF,
    },
    dataCalculo,
  );

  const totalProventos = arredondar(valorFerias + valorTerco + valorAbono + valorTercoAbono + valorAdiantamentoDecimo);
  const totalDescontos = arredondar(resultadoINSS.valor + resultadoIRRF.valor);

  return {
    baseCalculo,
    valorFerias,
    valorTerco,
    valorAbono,
    valorTercoAbono,
    valorAdiantamentoDecimo,
    baseINSS: resultadoINSS.base,
    inss: resultadoINSS.valor,
    baseIRRF: resultadoIRRF.base,
    irrf: resultadoIRRF.valor,
    totalProventos,
    totalDescontos,
    liquido: arredondar(totalProventos - totalDescontos),
    fimGozo: diasGozo > 0 ? somarDias(entrada.inicioGozo, diasGozo - 1) : entrada.inicioGozo,
    alertas,
  };
}

/** Ferias que vencem (periodo concessivo) dentro da janela informada. */
export function feriasAVencer(saldos: SaldoFerias[], diasJanela = 90): SaldoFerias[] {
  return saldos
    .filter((s) => s.diasSaldo > 0 && s.diasParaVencer <= diasJanela)
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

/** Verifica se o periodo de gozo respeita o fracionamento do art. 134, par. 1o. */
export function fracionamentoValido(periodos: Pick<Ferias, 'diasGozo'>[]): boolean {
  if (periodos.length === 0) return true;
  if (periodos.length > 3) return false;
  if (!periodos.some((p) => p.diasGozo >= 14)) return false;
  return periodos.every((p) => p.diasGozo >= 5);
}
