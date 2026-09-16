/**
 * Motor da folha mensal.
 *
 * Recebe um retrato do colaborador e dos eventos do mes (faltas, comissoes,
 * horas extras) e devolve o contracheque completo com as verbas detalhadas.
 * E uma funcao pura: mesma entrada, mesmo resultado — o que permite
 * reprocessar competencias fechadas sem divergencia.
 */
import { arredondar, naoNegativo, somar } from '../util/money.js';
import {
  competenciaDe,
  diaDaSemana,
  diasNoMes,
  inicioDaSemana,
  primeiroDiaDaCompetencia,
  ultimoDiaDaCompetencia,
  type Competencia,
  type DataISO,
} from '../util/datas.js';
import type { Colaborador, Falta, TipoContrato, Verba } from '../domain/tipos.js';
import { FALTAS_DESCONTAVEIS, SITUACOES_SUSPENSAS } from '../domain/tipos.js';
import { calcularFGTS, calcularINSS, calcularINSSProLabore, calcularIRRF, calcularSalarioFamilia } from './encargos.js';
import { ADICIONAL_HORA_EXTRA, ADICIONAL_NOTURNO, LIMITE_DESCONTO_VT, tabelaVigente } from './tabelas.js';

/** Jornada mensal padrao de 220 horas (44h semanais). */
export const HORAS_MENSAIS_PADRAO = 220;

/** A folha brasileira remunera o mes cheio como 30 dias, qualquer que seja o calendario. */
export const DIAS_MES_FOLHA = 30;

/**
 * Regime de encargos por tipo de contrato.
 *
 * Nem todo vinculo gera os mesmos descontos: so o empregado celetista tem
 * INSS progressivo, FGTS, salario-familia e desconto de vale-transporte. O
 * socio recolhe como contribuinte individual, o estagiario nao gera
 * contribuicao previdenciaria e o PJ emite nota — nada e retido na folha.
 */
export interface RegimeContrato {
  /** Como o INSS do segurado e apurado. */
  inss: 'PROGRESSIVO' | 'PRO_LABORE' | 'NENHUM';
  /** Se ha retencao de IRRF na fonte pela folha. */
  retemIRRF: boolean;
  /** Se o empregador deposita FGTS. */
  temFGTS: boolean;
  /** Se o desconto de vale-transporte de 6% se aplica. */
  descontaValeTransporte: boolean;
  temSalarioFamilia: boolean;
  /** Se falta injustificada derruba o descanso semanal remunerado. */
  perdeDSR: boolean;
  /** Se o vinculo gera 13o salario e ferias. */
  temDecimoTerceiroEFerias: boolean;
  fundamento: string;
}

export const REGIMES_CONTRATO: Record<TipoContrato, RegimeContrato> = {
  CLT: {
    inss: 'PROGRESSIVO',
    retemIRRF: true,
    temFGTS: true,
    descontaValeTransporte: true,
    temSalarioFamilia: true,
    perdeDSR: true,
    temDecimoTerceiroEFerias: true,
    fundamento: 'Empregado celetista: regime integral da CLT.',
  },
  INTERMITENTE: {
    inss: 'PROGRESSIVO',
    retemIRRF: true,
    temFGTS: true,
    descontaValeTransporte: true,
    temSalarioFamilia: true,
    perdeDSR: false, // sem jornada fixa nao ha semana de referencia para o DSR
    temDecimoTerceiroEFerias: true,
    fundamento: 'Art. 452-A da CLT: empregado com todos os direitos, pago por periodo convocado.',
  },
  SOCIO: {
    inss: 'PRO_LABORE',
    retemIRRF: true,
    temFGTS: false,
    descontaValeTransporte: false,
    temSalarioFamilia: false,
    perdeDSR: false,
    temDecimoTerceiroEFerias: false,
    fundamento: 'Pro-labore: contribuinte individual, 11% ate o teto (Lei 10.666/2003). Sem FGTS, 13o ou ferias.',
  },
  ESTAGIO: {
    inss: 'NENHUM',
    retemIRRF: true,
    temFGTS: false,
    descontaValeTransporte: false, // o auxilio-transporte do estagiario nao comporta o desconto de 6%
    temSalarioFamilia: false,
    perdeDSR: false,
    temDecimoTerceiroEFerias: false,
    fundamento: 'Lei 11.788/2008: estagio nao cria vinculo empregaticio. Bolsa sem INSS e sem FGTS; recesso no lugar de ferias.',
  },
  PJ: {
    inss: 'NENHUM',
    retemIRRF: false,
    temFGTS: false,
    descontaValeTransporte: false,
    temSalarioFamilia: false,
    perdeDSR: false,
    temDecimoTerceiroEFerias: false,
    fundamento: 'Prestador pessoa juridica: paga-se contra nota fiscal, sem retencao na folha.',
  },
};

export interface EventoAvulso {
  codigo: string;
  descricao: string;
  natureza: 'PROVENTO' | 'DESCONTO';
  valor: number;
  baseINSS?: boolean;
  baseIRRF?: boolean;
  baseFGTS?: boolean;
}

export interface EntradaFolha {
  competencia: Competencia;
  colaborador: Colaborador;
  /** Faltas do colaborador dentro da competencia. */
  faltas: Falta[];
  /** Comissoes das semanas cuja competencia e esta — ja pagas semanalmente. */
  comissoesAdiantadas: number;
  /** Comissoes ainda nao pagas, que saem junto com a folha. */
  comissoesAPagar?: number;
  horasExtras?: number;
  horasExtrasAdicional?: number;
  horasNoturnas?: number;
  /** Para contrato INTERMITENTE: horas efetivamente trabalhadas no mes. */
  horasTrabalhadas?: number;
  /** Adiantamento quinzenal ja pago. */
  adiantamento?: number;
  pensaoAlimenticia?: number;
  eventos?: EventoAvulso[];
  /** Dias de ferias gozados no mes (reduzem o salario proporcionalmente). */
  diasFerias?: number;
}

export interface ResultadoFolha {
  colaboradorId: string;
  competencia: Competencia;
  salarioBase: number;
  diasTrabalhados: number;
  faltasDias: number;
  faltasHoras: number;
  descontoFaltas: number;
  descontoDSR: number;
  comissoes: number;
  horasExtras: number;
  adicionalNoturno: number;
  outrosProventos: number;
  descontoValeTransporte: number;
  outrosDescontos: number;
  baseINSS: number;
  inss: number;
  baseIRRF: number;
  irrf: number;
  baseFGTS: number;
  fgts: number;
  salarioFamilia: number;
  totalProventos: number;
  totalDescontos: number;
  salarioLiquido: number;
  comissoesAdiantadas: number;
  valorTransferir: number;
  verbas: Verba[];
  /** Avisos que o RH precisa ver antes de fechar (liquido negativo etc.). */
  alertas: string[];
}

/** Quantidade de dias e horas de falta apurados na competencia. */
export interface ApuracaoFaltas {
  diasDescontaveis: number;
  diasJustificados: number;
  horasAtraso: number;
  /** Domingos e feriados perdidos por falta injustificada na semana. */
  diasDSR: number;
}

/**
 * Apura as faltas do mes. Falta injustificada derruba o DSR da semana
 * (art. 6o, par. unico, Lei 605/49): cada semana com ao menos uma falta
 * descontavel perde um dia de repouso remunerado.
 */
export function apurarFaltas(faltas: Falta[], competencia: Competencia, perdeDSR = true): ApuracaoFaltas {
  const inicio = primeiroDiaDaCompetencia(competencia);
  const fim = ultimoDiaDaCompetencia(competencia);
  const doMes = faltas.filter((f) => f.data >= inicio && f.data <= fim);

  let diasDescontaveis = 0;
  let diasJustificados = 0;
  let horasAtraso = 0;
  const semanasComFalta = new Set<DataISO>();

  for (const falta of doMes) {
    if (falta.tipo === 'ATRASO') {
      horasAtraso += naoNegativo(falta.horas ?? 0);
      continue;
    }
    if (FALTAS_DESCONTAVEIS.includes(falta.tipo)) {
      diasDescontaveis += 1;
      semanasComFalta.add(inicioDaSemana(falta.data));
    } else {
      diasJustificados += 1;
    }
  }

  // O DSR so e perdido se houver domingo dentro da competencia naquela semana,
  // e apenas nos regimes com jornada fixa.
  let diasDSR = 0;
  for (const segunda of (perdeDSR ? semanasComFalta : [])) {
    const domingo = new Date(`${segunda}T00:00:00.000Z`);
    domingo.setUTCDate(domingo.getUTCDate() + 6);
    const iso = domingo.toISOString().slice(0, 10);
    if (iso >= inicio && iso <= fim) diasDSR += 1;
  }

  return { diasDescontaveis, diasJustificados, horasAtraso: arredondar(horasAtraso), diasDSR };
}

/**
 * Dias de salario devidos no mes, considerando admissao e desligamento dentro
 * da competencia. A folha conta o mes como 30 dias mesmo em fevereiro.
 */
export function diasDeSalario(colaborador: Colaborador, competencia: Competencia): number {
  const inicio = primeiroDiaDaCompetencia(competencia);
  const fim = ultimoDiaDaCompetencia(competencia);
  if (colaborador.admissao > fim) return 0;
  if (colaborador.demissao && colaborador.demissao < inicio) return 0;

  const totalDoCalendario = diasNoMes(competencia);
  const primeiroDia = colaborador.admissao > inicio ? Number(colaborador.admissao.slice(8, 10)) : 1;
  const ultimoDia =
    colaborador.demissao && colaborador.demissao <= fim ? Number(colaborador.demissao.slice(8, 10)) : totalDoCalendario;

  const diasCorridos = ultimoDia - primeiroDia + 1;
  if (diasCorridos >= totalDoCalendario) return DIAS_MES_FOLHA;
  // Mes parcial: cada dia trabalhado vale 1/30 avos do salario.
  return Math.max(0, Math.min(DIAS_MES_FOLHA, diasCorridos));
}

function verba(
  codigo: string,
  descricao: string,
  natureza: Verba['natureza'],
  referencia: string,
  valor: number,
  bases: { inss?: boolean; irrf?: boolean; fgts?: boolean } = {},
): Verba {
  return {
    codigo,
    descricao,
    natureza,
    referencia,
    valor: arredondar(valor),
    baseINSS: bases.inss ?? false,
    baseIRRF: bases.irrf ?? false,
    baseFGTS: bases.fgts ?? false,
  };
}

/**
 * Calcula a folha mensal de um colaborador.
 *
 * Ordem de apuracao: proventos -> bases -> INSS -> IRRF -> descontos ->
 * liquido -> abatimento das comissoes ja adiantadas na semana.
 */
export function calcularFolhaMensal(entrada: EntradaFolha): ResultadoFolha {
  const { colaborador, competencia } = entrada;
  const dataCalculo = ultimoDiaDaCompetencia(competencia);
  const tabela = tabelaVigente(dataCalculo);
  const verbas: Verba[] = [];
  const alertas: string[] = [];

  const cargaHoraria = colaborador.cargaHorariaMensal > 0 ? colaborador.cargaHorariaMensal : HORAS_MENSAIS_PADRAO;
  const intermitente = colaborador.tipoContrato === 'INTERMITENTE';
  const regime = REGIMES_CONTRATO[colaborador.tipoContrato];

  /* ---------- Salario do periodo ---------- */
  // Contrato suspenso por afastamento nao gera salario: a partir do 16o dia o
  // beneficio e pago pelo INSS (art. 476 da CLT c/c art. 60 da Lei 8.213/91).
  // Os 15 primeiros dias, quando o afastamento comeca na competencia, sao do
  // empregador e devem ser lancados como evento avulso — o alerta abaixo
  // lembra o RH disso, em vez de o sistema adivinhar a data do atestado.
  const contratoSuspenso = SITUACOES_SUSPENSAS.includes(colaborador.situacao);
  if (contratoSuspenso) {
    alertas.push(
      colaborador.situacao === 'AFASTADO'
        ? 'Contrato suspenso por afastamento: nenhum salario foi apurado. Se o afastamento comecou nesta competencia, lance os 15 primeiros dias como evento avulso.'
        : 'Vinculo sub judice ou com desligamento em tramite: pagamento sobrestado. Libere a situacao para ATIVO ou processe a rescisao quando houver definicao.',
    );
  }

  const diasSalario = contratoSuspenso ? 0 : diasDeSalario(colaborador, competencia);
  const diasFerias = Math.min(naoNegativo(entrada.diasFerias ?? 0), diasSalario);
  const diasRemunerados = naoNegativo(diasSalario - diasFerias);

  let salarioPeriodo: number;
  let referenciaSalario: string;
  if (intermitente) {
    const horas = naoNegativo(entrada.horasTrabalhadas ?? 0);
    salarioPeriodo = arredondar(horas * naoNegativo(colaborador.salarioHora ?? 0));
    referenciaSalario = `${horas.toFixed(2)}h`;
  } else {
    salarioPeriodo = arredondar((colaborador.salarioBase / DIAS_MES_FOLHA) * diasRemunerados);
    referenciaSalario = `${diasRemunerados} dias`;
  }
  if (salarioPeriodo > 0) {
    verbas.push(verba('001', 'Salario base', 'PROVENTO', referenciaSalario, salarioPeriodo, { inss: true, irrf: true, fgts: true }));
  }

  /* ---------- Faltas e DSR ---------- */
  const apuracao = apurarFaltas(entrada.faltas, competencia, regime.perdeDSR);
  const valorDia = intermitente ? 0 : arredondar(colaborador.salarioBase / DIAS_MES_FOLHA);
  const valorHora = intermitente
    ? naoNegativo(colaborador.salarioHora ?? 0)
    : arredondar(colaborador.salarioBase / cargaHoraria);

  const descontoFaltas = arredondar(valorDia * apuracao.diasDescontaveis + valorHora * apuracao.horasAtraso);
  const descontoDSR = arredondar(valorDia * apuracao.diasDSR);
  if (descontoFaltas > 0) {
    const ref = apuracao.horasAtraso > 0 ? `${apuracao.diasDescontaveis} dias + ${apuracao.horasAtraso}h` : `${apuracao.diasDescontaveis} dias`;
    verbas.push(verba('101', 'Faltas', 'DESCONTO', ref, descontoFaltas, { inss: true, irrf: true, fgts: true }));
  }
  if (descontoDSR > 0) {
    verbas.push(verba('102', 'DSR sobre faltas', 'DESCONTO', `${apuracao.diasDSR} dias`, descontoDSR, { inss: true, irrf: true, fgts: true }));
  }

  /* ---------- Comissoes ---------- */
  const comissoesAdiantadas = naoNegativo(entrada.comissoesAdiantadas);
  const comissoesAPagar = naoNegativo(entrada.comissoesAPagar ?? 0);
  const comissoes = arredondar(comissoesAdiantadas + comissoesAPagar);
  if (comissoes > 0) {
    verbas.push(verba('010', 'Comissoes', 'PROVENTO', 'semanal', comissoes, { inss: true, irrf: true, fgts: true }));
  }

  /* ---------- Horas extras e adicional noturno ---------- */
  const horasExtrasQtd = naoNegativo(entrada.horasExtras ?? 0);
  const adicionalHE = entrada.horasExtrasAdicional ?? ADICIONAL_HORA_EXTRA;
  const horasExtras = arredondar(horasExtrasQtd * valorHora * (1 + adicionalHE));
  if (horasExtras > 0) {
    verbas.push(
      verba('020', `Horas extras ${Math.round(adicionalHE * 100)}%`, 'PROVENTO', `${horasExtrasQtd}h`, horasExtras, {
        inss: true,
        irrf: true,
        fgts: true,
      }),
    );
  }

  const horasNoturnasQtd = naoNegativo(entrada.horasNoturnas ?? 0);
  const adicionalNoturno = arredondar(horasNoturnasQtd * valorHora * ADICIONAL_NOTURNO);
  if (adicionalNoturno > 0) {
    verbas.push(verba('021', 'Adicional noturno', 'PROVENTO', `${horasNoturnasQtd}h`, adicionalNoturno, { inss: true, irrf: true, fgts: true }));
  }

  /* ---------- Insalubridade e periculosidade ---------- */
  if (colaborador.insalubridadePercentual && colaborador.insalubridadePercentual > 0) {
    const valor = arredondar(tabela.salarioMinimo * (colaborador.insalubridadePercentual / 100));
    verbas.push(
      verba('030', `Insalubridade ${colaborador.insalubridadePercentual}%`, 'PROVENTO', 'mensal', valor, {
        inss: true,
        irrf: true,
        fgts: true,
      }),
    );
  }
  if (colaborador.periculosidade) {
    const valor = arredondar(salarioPeriodo * 0.3);
    verbas.push(verba('031', 'Periculosidade 30%', 'PROVENTO', 'mensal', valor, { inss: true, irrf: true, fgts: true }));
  }

  /* ---------- Eventos avulsos ---------- */
  for (const evento of entrada.eventos ?? []) {
    if (!Number.isFinite(evento.valor) || evento.valor === 0) continue;
    verbas.push(
      verba(evento.codigo, evento.descricao, evento.natureza, 'avulso', Math.abs(evento.valor), {
        inss: evento.baseINSS ?? false,
        irrf: evento.baseIRRF ?? false,
        fgts: evento.baseFGTS ?? false,
      }),
    );
  }

  /* ---------- Bases de incidencia ---------- */
  const somarBase = (campo: 'baseINSS' | 'baseIRRF' | 'baseFGTS'): number =>
    arredondar(
      verbas
        .filter((v) => v[campo])
        .reduce((acc, v) => acc + (v.natureza === 'DESCONTO' ? -v.valor : v.valor), 0),
    );

  const baseINSS = naoNegativo(somarBase('baseINSS'));
  const baseFGTS = naoNegativo(somarBase('baseFGTS'));
  const baseTributavel = naoNegativo(somarBase('baseIRRF'));

  // Cada regime apura o INSS de um jeito; PJ e estagio nao tem retencao.
  const resultadoINSS =
    regime.inss === 'PROGRESSIVO'
      ? calcularINSS(baseINSS, dataCalculo, tabela)
      : regime.inss === 'PRO_LABORE'
        ? calcularINSSProLabore(baseINSS, dataCalculo, tabela)
        : { base: 0, valor: 0, aliquotaEfetiva: 0, faixas: [] };
  if (resultadoINSS.valor > 0) {
    const rotulo = regime.inss === 'PRO_LABORE' ? 'INSS pro-labore' : 'INSS';
    verbas.push(verba('110', rotulo, 'DESCONTO', `${(resultadoINSS.aliquotaEfetiva * 100).toFixed(2)}%`, resultadoINSS.valor));
  }

  const pensao = naoNegativo(entrada.pensaoAlimenticia ?? 0);
  const resultadoIRRF = regime.retemIRRF
    ? calcularIRRF(
        { rendimentoBruto: baseTributavel, inss: resultadoINSS.valor, dependentes: colaborador.dependentesIRRF, pensaoAlimenticia: pensao },
        dataCalculo,
        tabela,
      )
    : { base: 0, valor: 0, aliquota: 0, deducao: 0, usouDescontoSimplificado: false, deducoesAplicadas: 0 };
  if (resultadoIRRF.valor > 0) {
    verbas.push(verba('111', 'IRRF', 'DESCONTO', `${(resultadoIRRF.aliquota * 100).toFixed(1)}%`, resultadoIRRF.valor));
  }

  /* ---------- Vale transporte ---------- */
  // O desconto e o menor entre o custo real do beneficio e 6% do salario base.
  let descontoVT = 0;
  if (regime.descontaValeTransporte && colaborador.valeTransporte && salarioPeriodo > 0) {
    const tetoLegal = arredondar(salarioPeriodo * LIMITE_DESCONTO_VT);
    const custoReal = colaborador.valeTransporteValorDiario
      ? arredondar(colaborador.valeTransporteValorDiario * Math.max(0, diasRemunerados - apuracao.diasDescontaveis))
      : tetoLegal;
    descontoVT = Math.min(tetoLegal, custoReal);
    if (descontoVT > 0) verbas.push(verba('120', 'Vale transporte', 'DESCONTO', '6%', descontoVT));
  }

  /* ---------- Salario-familia ---------- */
  const salarioFamilia = regime.temSalarioFamilia
    ? calcularSalarioFamilia(baseINSS, colaborador.dependentesSalarioFamilia, dataCalculo, tabela)
    : 0;
  if (salarioFamilia > 0) {
    verbas.push(verba('040', 'Salario-familia', 'PROVENTO', `${colaborador.dependentesSalarioFamilia} dep.`, salarioFamilia));
  }

  /* ---------- Adiantamento e pensao ---------- */
  const adiantamento = naoNegativo(entrada.adiantamento ?? 0);
  if (adiantamento > 0) verbas.push(verba('130', 'Adiantamento quinzenal', 'DESCONTO', 'mensal', adiantamento));
  if (pensao > 0) verbas.push(verba('131', 'Pensao alimenticia', 'DESCONTO', 'judicial', pensao));

  /* ---------- Totais ---------- */
  const totalProventos = arredondar(verbas.filter((v) => v.natureza === 'PROVENTO').reduce((a, v) => a + v.valor, 0));
  const totalDescontos = arredondar(verbas.filter((v) => v.natureza === 'DESCONTO').reduce((a, v) => a + v.valor, 0));
  const salarioLiquido = arredondar(totalProventos - totalDescontos);

  // As comissoes ja foram pagas semanalmente: o banco so transfere a diferenca.
  const valorTransferir = arredondar(salarioLiquido - comissoesAdiantadas);

  const fgts = regime.temFGTS ? calcularFGTS(baseFGTS) : 0;
  if (regime.temFGTS) verbas.push(verba('900', 'FGTS do mes (informativo)', 'INFORMATIVA', '8%', fgts));

  if (valorTransferir < 0) {
    alertas.push(
      `Liquido a transferir negativo (${valorTransferir.toFixed(2)}): as comissoes adiantadas superam o liquido da folha. Gerar acerto no proximo mes.`,
    );
  }
  if (salarioLiquido < 0) {
    alertas.push('Descontos maiores que os proventos: conferir faltas e descontos lancados.');
  }
  if (!intermitente && colaborador.salarioBase < tabela.salarioMinimo && colaborador.tipoContrato === 'CLT') {
    alertas.push(`Salario base abaixo do minimo vigente (${tabela.salarioMinimo.toFixed(2)}).`);
  }

  return {
    colaboradorId: colaborador.id,
    competencia,
    salarioBase: colaborador.salarioBase,
    diasTrabalhados: diasRemunerados,
    faltasDias: apuracao.diasDescontaveis,
    faltasHoras: apuracao.horasAtraso,
    descontoFaltas,
    descontoDSR,
    comissoes,
    horasExtras,
    adicionalNoturno,
    outrosProventos: arredondar(
      totalProventos - salarioPeriodo - comissoes - horasExtras - adicionalNoturno - salarioFamilia,
    ),
    descontoValeTransporte: descontoVT,
    outrosDescontos: arredondar(totalDescontos - descontoFaltas - descontoDSR - resultadoINSS.valor - resultadoIRRF.valor - descontoVT),
    baseINSS: resultadoINSS.base,
    inss: resultadoINSS.valor,
    baseIRRF: resultadoIRRF.base,
    irrf: resultadoIRRF.valor,
    baseFGTS,
    fgts,
    salarioFamilia,
    totalProventos,
    totalDescontos,
    salarioLiquido,
    comissoesAdiantadas,
    valorTransferir,
    verbas,
    alertas,
  };
}

/** Consolida uma lista de contracheques nos totais da folha. */
export function consolidarFolha(itens: ResultadoFolha[]): {
  totalProventos: number;
  totalDescontos: number;
  totalLiquido: number;
  totalComissoesAdiantadas: number;
  totalTransferir: number;
  totalFGTS: number;
  quantidade: number;
} {
  return {
    totalProventos: somar(...itens.map((i) => i.totalProventos)),
    totalDescontos: somar(...itens.map((i) => i.totalDescontos)),
    totalLiquido: somar(...itens.map((i) => i.salarioLiquido)),
    totalComissoesAdiantadas: somar(...itens.map((i) => i.comissoesAdiantadas)),
    totalTransferir: somar(...itens.map((i) => i.valorTransferir)),
    totalFGTS: somar(...itens.map((i) => i.fgts)),
    quantidade: itens.length,
  };
}

/** Competencia a que pertence o pagamento de uma semana de comissao. */
export function competenciaDaSemana(dataFimSemana: DataISO): Competencia {
  return competenciaDe(dataFimSemana);
}

/** Quantidade de domingos na competencia — usada no rateio de DSR sobre comissoes. */
export function domingosNaCompetencia(competencia: Competencia): number {
  const total = diasNoMes(competencia);
  let domingos = 0;
  for (let dia = 1; dia <= total; dia += 1) {
    const iso = `${competencia}-${String(dia).padStart(2, '0')}`;
    if (diaDaSemana(iso) === 0) domingos += 1;
  }
  return domingos;
}
