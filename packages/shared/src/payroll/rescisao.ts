/**
 * Rescisao contratual (arts. 477 a 487 da CLT e Lei 12.506/2011).
 *
 * Cada motivo de desligamento liga ou desliga verbas especificas; a matriz
 * `REGRAS_RESCISAO` concentra essa decisao para que o calculo abaixo fique
 * legivel e auditavel.
 */
import { arredondar, naoNegativo } from '../util/money.js';
import { diasEntre, somarDias, somarMeses, type DataISO } from '../util/datas.js';
import type { Colaborador, MotivoRescisao, TipoAviso, Verba } from '../domain/tipos.js';
import { calcularINSS, calcularIRRF } from './encargos.js';
import { DIAS_MES_FOLHA } from './folha.js';
import { MULTA_FGTS_ACORDO, MULTA_FGTS_SEM_JUSTA_CAUSA } from './tabelas.js';
import { diasDeDireito, periodoAquisitivoAtual } from './ferias.js';

interface RegraRescisao {
  /** Empregador deve aviso previo ao empregado. */
  avisoDevidoPeloEmpregador: boolean;
  /** Empregado deve aviso ao empregador (pedido de demissao). */
  avisoDevidoPeloEmpregado: boolean;
  decimoTerceiroProporcional: boolean;
  feriasProporcionais: boolean;
  /** Percentual da multa do FGTS (0 = sem multa). */
  percentualMultaFGTS: number;
  /** Percentual do saldo do FGTS que pode ser sacado. */
  percentualSaqueFGTS: number;
  seguroDesemprego: boolean;
}

export const REGRAS_RESCISAO: Record<MotivoRescisao, RegraRescisao> = {
  SEM_JUSTA_CAUSA: {
    avisoDevidoPeloEmpregador: true,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: MULTA_FGTS_SEM_JUSTA_CAUSA,
    percentualSaqueFGTS: 1,
    seguroDesemprego: true,
  },
  PEDIDO_DEMISSAO: {
    avisoDevidoPeloEmpregador: false,
    avisoDevidoPeloEmpregado: true,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: 0,
    percentualSaqueFGTS: 0,
    seguroDesemprego: false,
  },
  JUSTA_CAUSA: {
    avisoDevidoPeloEmpregador: false,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: false,
    // Sumula 171 do TST: na justa causa nao ha ferias proporcionais.
    feriasProporcionais: false,
    percentualMultaFGTS: 0,
    percentualSaqueFGTS: 0,
    seguroDesemprego: false,
  },
  ACORDO_484A: {
    avisoDevidoPeloEmpregador: true,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: MULTA_FGTS_ACORDO,
    percentualSaqueFGTS: 0.8,
    seguroDesemprego: false,
  },
  TERMINO_CONTRATO: {
    avisoDevidoPeloEmpregador: false,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: 0,
    percentualSaqueFGTS: 1,
    seguroDesemprego: false,
  },
  APOSENTADORIA: {
    avisoDevidoPeloEmpregador: false,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: 0,
    percentualSaqueFGTS: 1,
    seguroDesemprego: false,
  },
  FALECIMENTO: {
    avisoDevidoPeloEmpregador: false,
    avisoDevidoPeloEmpregado: false,
    decimoTerceiroProporcional: true,
    feriasProporcionais: true,
    percentualMultaFGTS: 0,
    percentualSaqueFGTS: 1,
    seguroDesemprego: false,
  },
};

/**
 * Aviso previo proporcional: 30 dias + 3 por ano completo de servico,
 * limitado a 90 dias (Lei 12.506/2011).
 */
export function diasAvisoPrevio(admissao: DataISO, desligamento: DataISO): number {
  const anosCompletos = Math.floor(diasEntre(admissao, desligamento) / 365);
  return Math.min(90, 30 + Math.max(0, anosCompletos) * 3);
}

/** Avos de ferias/13o proporcionais: meses com 15 dias ou mais de trabalho. */
export function avosProporcionais(inicio: DataISO, fim: DataISO): number {
  if (fim < inicio) return 0;
  let avos = 0;
  let cursor = inicio;
  while (cursor <= fim) {
    const proximoAniversario = somarMeses(cursor, 1);
    const fimDoAvo = somarDias(proximoAniversario, -1);
    const fimEfetivo = fimDoAvo < fim ? fimDoAvo : fim;
    if (diasEntre(cursor, fimEfetivo) + 1 >= 15) avos += 1;
    cursor = proximoAniversario;
  }
  return Math.min(12, avos);
}

export interface EntradaRescisao {
  colaborador: Colaborador;
  dataAviso: DataISO;
  dataDesligamento: DataISO;
  motivo: MotivoRescisao;
  tipoAviso: TipoAviso;
  /** Media de comissoes dos ultimos 12 meses, integra todas as bases. */
  mediaComissoes: number;
  /** Dias de ferias vencidas ainda nao gozadas. */
  diasFeriasVencidas: number;
  faltasInjustificadasNoPeriodo?: number;
  /** Saldo do FGTS depositado, base da multa rescisoria. */
  saldoFGTS?: number;
  /** 13o ja adiantado no ano (1a parcela). */
  decimoTerceiroAdiantado?: number;
  saldoComissoes?: number;
  outrosProventos?: number;
  outrosDescontos?: number;
}

export interface ResultadoRescisao {
  diasAvisoPrevio: number;
  diasTrabalhadosNoMes: number;
  saldoSalario: number;
  avisoPrevioIndenizado: number;
  avisoPrevioDescontado: number;
  decimoTerceiroProporcional: number;
  feriasVencidas: number;
  tercoFeriasVencidas: number;
  feriasProporcionais: number;
  tercoFeriasProporcionais: number;
  saldoComissoes: number;
  outrosProventos: number;
  totalProventos: number;
  baseINSS: number;
  inss: number;
  baseIRRF: number;
  irrf: number;
  outrosDescontos: number;
  totalDescontos: number;
  liquido: number;
  saldoFGTS: number;
  multaFGTS: number;
  habilitaSeguroDesemprego: boolean;
  /** Data limite para pagamento: 10 dias corridos do desligamento (art. 477, par. 6o). */
  prazoPagamento: DataISO;
  verbas: Verba[];
  alertas: string[];
}

function v(codigo: string, descricao: string, natureza: Verba['natureza'], referencia: string, valor: number, bases: Partial<Pick<Verba, 'baseINSS' | 'baseIRRF' | 'baseFGTS'>> = {}): Verba {
  return {
    codigo,
    descricao,
    natureza,
    referencia,
    valor: arredondar(valor),
    baseINSS: bases.baseINSS ?? false,
    baseIRRF: bases.baseIRRF ?? false,
    baseFGTS: bases.baseFGTS ?? false,
  };
}

/**
 * Calcula o Termo de Rescisao do Contrato de Trabalho.
 *
 * Ferias (vencidas e proporcionais) e o terco constitucional sao verbas
 * indenizatorias: nao sofrem INSS nem IRRF. O aviso previo indenizado tambem
 * nao integra a base do INSS (art. 28, par. 9o, "e", 5, da Lei 8.212/91).
 */
export function calcularRescisao(entrada: EntradaRescisao): ResultadoRescisao {
  const { colaborador, motivo, tipoAviso, dataDesligamento } = entrada;
  const regra = REGRAS_RESCISAO[motivo];
  const alertas: string[] = [];
  const verbas: Verba[] = [];

  const remuneracao = arredondar(colaborador.salarioBase + naoNegativo(entrada.mediaComissoes));
  const valorDia = arredondar(remuneracao / DIAS_MES_FOLHA);
  const dias = diasAvisoPrevio(colaborador.admissao, dataDesligamento);

  /* ---------- Saldo de salario ---------- */
  const diasTrabalhadosNoMes = Number(dataDesligamento.slice(8, 10));
  const saldoSalario = arredondar(valorDia * diasTrabalhadosNoMes);
  verbas.push(v('001', 'Saldo de salario', 'PROVENTO', `${diasTrabalhadosNoMes} dias`, saldoSalario, { baseINSS: true, baseIRRF: true, baseFGTS: true }));

  /* ---------- Aviso previo ---------- */
  let avisoPrevioIndenizado = 0;
  let avisoPrevioDescontado = 0;
  if (regra.avisoDevidoPeloEmpregador && tipoAviso === 'INDENIZADO') {
    avisoPrevioIndenizado = arredondar(valorDia * dias);
    if (motivo === 'ACORDO_484A') avisoPrevioIndenizado = arredondar(avisoPrevioIndenizado / 2);
    verbas.push(v('002', 'Aviso previo indenizado', 'PROVENTO', `${dias} dias`, avisoPrevioIndenizado, { baseIRRF: false, baseFGTS: true }));
  }
  if (regra.avisoDevidoPeloEmpregado && tipoAviso === 'INDENIZADO') {
    // Empregado pediu demissao e nao cumpriu o aviso: desconto de 30 dias.
    avisoPrevioDescontado = arredondar(valorDia * 30);
    verbas.push(v('201', 'Aviso previo nao cumprido', 'DESCONTO', '30 dias', avisoPrevioDescontado));
  }

  // O aviso indenizado projeta o contrato e gera um avo extra de 13o e ferias.
  const fimProjetado = avisoPrevioIndenizado > 0 ? somarDias(dataDesligamento, dias) : dataDesligamento;

  /* ---------- 13o proporcional ---------- */
  let decimoTerceiroProporcional = 0;
  if (regra.decimoTerceiroProporcional) {
    const inicioAno = `${fimProjetado.slice(0, 4)}-01-01`;
    const inicio = colaborador.admissao > inicioAno ? colaborador.admissao : inicioAno;
    const avos = avosProporcionais(inicio, fimProjetado);
    const bruto = arredondar((remuneracao / 12) * avos);
    decimoTerceiroProporcional = arredondar(bruto - naoNegativo(entrada.decimoTerceiroAdiantado ?? 0));
    if (decimoTerceiroProporcional > 0) {
      verbas.push(v('003', '13o salario proporcional', 'PROVENTO', `${avos}/12`, decimoTerceiroProporcional, { baseINSS: true, baseFGTS: true }));
    }
  }

  /* ---------- Ferias vencidas ---------- */
  const diasVencidas = Math.max(0, Math.round(entrada.diasFeriasVencidas));
  const feriasVencidas = arredondar(valorDia * diasVencidas);
  const tercoFeriasVencidas = arredondar(feriasVencidas / 3);
  if (feriasVencidas > 0) {
    verbas.push(v('004', 'Ferias vencidas', 'PROVENTO', `${diasVencidas} dias`, feriasVencidas));
    verbas.push(v('005', '1/3 sobre ferias vencidas', 'PROVENTO', '1/3', tercoFeriasVencidas));
    alertas.push('Ha ferias vencidas em aberto: conferir se ja estavam em dobro (art. 137 da CLT).');
  }

  /* ---------- Ferias proporcionais ---------- */
  let feriasProporcionais = 0;
  let tercoFeriasProporcionais = 0;
  if (regra.feriasProporcionais) {
    const periodo = periodoAquisitivoAtual(colaborador.admissao, fimProjetado);
    const avos = avosProporcionais(periodo.inicio, fimProjetado);
    const limiteDias = diasDeDireito(entrada.faltasInjustificadasNoPeriodo ?? 0);
    feriasProporcionais = arredondar((valorDia * limiteDias / 12) * avos);
    tercoFeriasProporcionais = arredondar(feriasProporcionais / 3);
    if (feriasProporcionais > 0) {
      verbas.push(v('006', 'Ferias proporcionais', 'PROVENTO', `${avos}/12`, feriasProporcionais));
      verbas.push(v('007', '1/3 sobre ferias proporcionais', 'PROVENTO', '1/3', tercoFeriasProporcionais));
    }
  }

  /* ---------- Comissoes e avulsos ---------- */
  const saldoComissoes = naoNegativo(entrada.saldoComissoes ?? 0);
  if (saldoComissoes > 0) {
    verbas.push(v('010', 'Comissoes a pagar', 'PROVENTO', 'saldo', saldoComissoes, { baseINSS: true, baseIRRF: true, baseFGTS: true }));
  }
  const outrosProventos = naoNegativo(entrada.outrosProventos ?? 0);
  if (outrosProventos > 0) verbas.push(v('019', 'Outros proventos', 'PROVENTO', 'avulso', outrosProventos, { baseINSS: true, baseIRRF: true }));

  /* ---------- Encargos ---------- */
  const baseINSSBruta = arredondar(verbas.filter((x) => x.baseINSS && x.natureza === 'PROVENTO').reduce((a, x) => a + x.valor, 0));
  const resultadoINSS = calcularINSS(baseINSSBruta, dataDesligamento);
  if (resultadoINSS.valor > 0) verbas.push(v('210', 'INSS', 'DESCONTO', `${(resultadoINSS.aliquotaEfetiva * 100).toFixed(2)}%`, resultadoINSS.valor));

  const baseIRRFBruta = arredondar(verbas.filter((x) => x.baseIRRF && x.natureza === 'PROVENTO').reduce((a, x) => a + x.valor, 0));
  const resultadoIRRF = calcularIRRF(
    { rendimentoBruto: baseIRRFBruta, inss: resultadoINSS.valor, dependentes: colaborador.dependentesIRRF },
    dataDesligamento,
  );
  if (resultadoIRRF.valor > 0) verbas.push(v('211', 'IRRF', 'DESCONTO', `${(resultadoIRRF.aliquota * 100).toFixed(1)}%`, resultadoIRRF.valor));

  const outrosDescontos = naoNegativo(entrada.outrosDescontos ?? 0);
  if (outrosDescontos > 0) verbas.push(v('219', 'Outros descontos', 'DESCONTO', 'avulso', outrosDescontos));

  /* ---------- FGTS ---------- */
  const saldoFGTS = naoNegativo(entrada.saldoFGTS ?? 0);
  const multaFGTS = arredondar(saldoFGTS * regra.percentualMultaFGTS);
  if (multaFGTS > 0) {
    verbas.push(v('901', `Multa FGTS ${Math.round(regra.percentualMultaFGTS * 100)}% (recolhida na guia)`, 'INFORMATIVA', 'rescisoria', multaFGTS));
  }
  if (saldoFGTS === 0 && regra.percentualMultaFGTS > 0) {
    alertas.push('Saldo do FGTS nao informado: a multa rescisoria ficou zerada. Informe o extrato antes de homologar.');
  }

  const totalProventos = arredondar(verbas.filter((x) => x.natureza === 'PROVENTO').reduce((a, x) => a + x.valor, 0));
  const totalDescontos = arredondar(verbas.filter((x) => x.natureza === 'DESCONTO').reduce((a, x) => a + x.valor, 0));
  const liquido = arredondar(totalProventos - totalDescontos);
  if (liquido < 0) alertas.push('Rescisao com liquido negativo: o desconto do aviso supera as verbas devidas.');

  return {
    diasAvisoPrevio: dias,
    diasTrabalhadosNoMes,
    saldoSalario,
    avisoPrevioIndenizado,
    avisoPrevioDescontado,
    decimoTerceiroProporcional,
    feriasVencidas,
    tercoFeriasVencidas,
    feriasProporcionais,
    tercoFeriasProporcionais,
    saldoComissoes,
    outrosProventos,
    totalProventos,
    baseINSS: resultadoINSS.base,
    inss: resultadoINSS.valor,
    baseIRRF: resultadoIRRF.base,
    irrf: resultadoIRRF.valor,
    outrosDescontos,
    totalDescontos,
    liquido,
    saldoFGTS,
    multaFGTS,
    habilitaSeguroDesemprego: regra.seguroDesemprego,
    prazoPagamento: somarDias(dataDesligamento, 10),
    verbas,
    alertas,
  };
}
