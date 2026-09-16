/**
 * Faltas, DSR, avos de salario e o regime de cada tipo de contrato.
 *
 * Agosto/2025 e o mes de referencia porque o calendario dele exercita os casos
 * dificeis: comeca numa sexta, termina num domingo, e a ultima semana ISO
 * atravessa a virada para setembro.
 */
import { describe, expect, it } from 'vitest';
import { REGIMES_CONTRATO, apurarFaltas, calcularFolhaMensal, diasDeSalario } from '../payroll/folha.js';
import type { Colaborador, Falta, TipoFalta } from '../domain/tipos.js';

const base: Colaborador = {
  id: 'c1',
  tenantId: 't1',
  matricula: '0001',
  nome: 'TESTE DA SILVA',
  cpf: '11144477735',
  funcao: 'GARCOM',
  centroCusto: 'FOLHA TOKITO',
  tipoContrato: 'CLT',
  situacao: 'ATIVO',
  salarioBase: 3000,
  cargaHorariaMensal: 220,
  valeTransporte: false,
  pontosComissao: 1,
  dependentesIRRF: 0,
  dependentesSalarioFamilia: 0,
  periculosidade: false,
  admissao: '2020-01-06',
  criadoEm: '2025-01-01T00:00:00Z',
  atualizadoEm: '2025-01-01T00:00:00Z',
};

const falta = (data: string, tipo: TipoFalta = 'FALTA', horas?: number): Falta => ({
  id: `f-${data}-${tipo}`,
  tenantId: 't1',
  colaboradorId: 'c1',
  data,
  tipo,
  horas: horas ?? null,
  criadoEm: '2025-01-01T00:00:00Z',
});

describe('apuracao de faltas na competencia', () => {
  it('ignora faltas lancadas fora da competencia apurada', () => {
    const apuracao = apurarFaltas([falta('2025-07-31'), falta('2025-08-05'), falta('2025-09-01')], '2025-08');
    expect(apuracao.diasDescontaveis).toBe(1);
  });

  it('separa falta injustificada de falta justificada e atestado', () => {
    const apuracao = apurarFaltas(
      [falta('2025-08-05'), falta('2025-08-06', 'FALTA_JUSTIFICADA'), falta('2025-08-07', 'ATESTADO')],
      '2025-08',
    );
    expect(apuracao.diasDescontaveis).toBe(1);
    expect(apuracao.diasJustificados).toBe(2);
  });

  it('conta suspensao disciplinar como dia descontavel', () => {
    expect(apurarFaltas([falta('2025-08-05', 'SUSPENSAO')], '2025-08').diasDescontaveis).toBe(1);
  });

  it('soma as horas de atraso em vez de contar um dia inteiro', () => {
    const apuracao = apurarFaltas([falta('2025-08-05', 'ATRASO', 1.5), falta('2025-08-06', 'ATRASO', 2.25)], '2025-08');
    expect(apuracao.diasDescontaveis).toBe(0);
    expect(apuracao.horasAtraso).toBe(3.75);
    expect(apuracao.diasDSR).toBe(0); // atraso nao derruba o repouso da semana
  });
});

describe('perda do DSR por semana atingida', () => {
  it('derruba um unico DSR quando as duas faltas caem na mesma semana', () => {
    // 05/08 (terca) e 08/08 (sexta) pertencem a semana de 04/08 a 10/08.
    const apuracao = apurarFaltas([falta('2025-08-05'), falta('2025-08-08')], '2025-08');
    expect(apuracao.diasDescontaveis).toBe(2);
    expect(apuracao.diasDSR).toBe(1);
  });

  it('derruba um DSR por semana quando as faltas se espalham', () => {
    // Semanas de 04/08, 11/08 e 18/08.
    const apuracao = apurarFaltas([falta('2025-08-05'), falta('2025-08-12'), falta('2025-08-19')], '2025-08');
    expect(apuracao.diasDSR).toBe(3);
  });

  it('derruba o DSR da ultima semana cheia, cujo domingo e o dia 31', () => {
    // 29/08 e sexta; a semana vai de 25/08 a 31/08, e o domingo esta no mes.
    expect(apurarFaltas([falta('2025-08-29')], '2025-08').diasDSR).toBe(1);
  });

  it('nao derruba DSR quando o domingo da semana cai no mes seguinte', () => {
    // 30/09 e terca; o domingo dessa semana e 05/10, fora da competencia,
    // entao o repouso perdido pertence a folha de outubro, nao a de setembro.
    const apuracao = apurarFaltas([falta('2025-09-30')], '2025-09');
    expect(apuracao.diasDescontaveis).toBe(1);
    expect(apuracao.diasDSR).toBe(0);
  });

  it('conta o DSR quando a propria falta cai no domingo', () => {
    // 10/08 e domingo: a semana de 04/08 perde o seu repouso, que e o dia faltado.
    const apuracao = apurarFaltas([falta('2025-08-10')], '2025-08');
    expect(apuracao.diasDescontaveis).toBe(1);
    expect(apuracao.diasDSR).toBe(1);
  });

  it('nao derruba DSR nos regimes sem jornada fixa', () => {
    expect(apurarFaltas([falta('2025-08-05')], '2025-08', false).diasDSR).toBe(0);
  });
});

describe('desconto de faltas no contracheque', () => {
  it('desconta um trinta avos por dia faltado mais o DSR da semana', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: base,
      faltas: [falta('2025-08-05')],
      comissoesAdiantadas: 0,
    });
    // 3000 / 30 = 100,00 por dia.
    expect(resultado.descontoFaltas).toBe(100);
    expect(resultado.descontoDSR).toBe(100);
    expect(resultado.totalProventos).toBe(3000); // o salario cheio e o provento; a falta e desconto
  });

  it('desconta o atraso pela hora contratual, nao pelo dia', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: base,
      faltas: [falta('2025-08-05', 'ATRASO', 4)],
      comissoesAdiantadas: 0,
    });
    // 3000 / 220h = 13,64 por hora; 4h = 54,56.
    expect(resultado.descontoFaltas).toBe(54.56);
    expect(resultado.descontoDSR).toBe(0);
  });

  it('reduz a base do INSS e do FGTS junto com o salario', () => {
    const semFalta = calcularFolhaMensal({ competencia: '2025-08', colaborador: base, faltas: [], comissoesAdiantadas: 0 });
    const comFalta = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: base,
      faltas: [falta('2025-08-05')],
      comissoesAdiantadas: 0,
    });
    // 200,00 a menos de base (falta + DSR).
    expect(semFalta.baseINSS - comFalta.baseINSS).toBe(200);
    expect(semFalta.baseFGTS - comFalta.baseFGTS).toBe(200);
  });
});

describe('dias de salario no mes', () => {
  it('paga o mes cheio como 30 avos, mesmo em mes de 31 dias', () => {
    expect(diasDeSalario(base, '2025-08')).toBe(30);
  });

  it('paga fevereiro cheio tambem como 30 avos', () => {
    expect(diasDeSalario(base, '2025-02')).toBe(30);
  });

  it('paga fevereiro bissexto cheio como 30 avos', () => {
    expect(diasDeSalario(base, '2024-02')).toBe(30);
  });

  it('conta da admissao ate o fim do mes quando o vinculo comeca no meio', () => {
    // 11 a 31 de agosto = 21 dias.
    expect(diasDeSalario({ ...base, admissao: '2025-08-11' }, '2025-08')).toBe(21);
  });

  it('conta da admissao ate o fim de fevereiro, que tem 28 dias', () => {
    // 15 a 28 de fevereiro = 14 dias.
    expect(diasDeSalario({ ...base, admissao: '2025-02-15' }, '2025-02')).toBe(14);
  });

  it('conta do inicio do mes ate o desligamento', () => {
    expect(diasDeSalario({ ...base, demissao: '2025-08-20' }, '2025-08')).toBe(20);
  });

  it('conta so o intervalo quando admissao e demissao caem no mesmo mes', () => {
    // 10 a 20 de agosto = 11 dias.
    expect(diasDeSalario({ ...base, admissao: '2025-08-10', demissao: '2025-08-20' }, '2025-08')).toBe(11);
  });

  it('nao paga nada em competencia anterior a admissao', () => {
    expect(diasDeSalario({ ...base, admissao: '2025-09-01' }, '2025-08')).toBe(0);
  });

  it('nao paga nada em competencia posterior ao desligamento', () => {
    expect(diasDeSalario({ ...base, demissao: '2025-07-31' }, '2025-08')).toBe(0);
  });

  it('reduz o salario proporcionalmente aos dias do vinculo parcial', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, admissao: '2025-08-11' },
      faltas: [],
      comissoesAdiantadas: 0,
    });
    // 3000 / 30 x 21 = 2100,00
    expect(resultado.totalProventos).toBe(2100);
    expect(resultado.diasTrabalhados).toBe(21);
  });
});

describe('regime de encargos por tipo de contrato', () => {
  it('declara os cinco tipos de contrato previstos no dominio', () => {
    expect(Object.keys(REGIMES_CONTRATO).sort()).toEqual(['CLT', 'ESTAGIO', 'INTERMITENTE', 'PJ', 'SOCIO']);
  });

  it('so o celetista e o intermitente geram FGTS', () => {
    const comFGTS = Object.entries(REGIMES_CONTRATO)
      .filter(([, regime]) => regime.temFGTS)
      .map(([tipo]) => tipo)
      .sort();
    expect(comFGTS).toEqual(['CLT', 'INTERMITENTE']);
  });

  it('so o PJ fica de fora da retencao de IRRF na folha', () => {
    const semIRRF = Object.entries(REGIMES_CONTRATO)
      .filter(([, regime]) => !regime.retemIRRF)
      .map(([tipo]) => tipo);
    expect(semIRRF).toEqual(['PJ']);
  });

  it('so o celetista perde DSR por falta injustificada', () => {
    const comDSR = Object.entries(REGIMES_CONTRATO)
      .filter(([, regime]) => regime.perdeDSR)
      .map(([tipo]) => tipo);
    expect(comDSR).toEqual(['CLT']);
  });

  it('so o celetista e o intermitente geram 13o e ferias', () => {
    const comDireito = Object.entries(REGIMES_CONTRATO)
      .filter(([, regime]) => regime.temDecimoTerceiroEFerias)
      .map(([tipo]) => tipo)
      .sort();
    expect(comDireito).toEqual(['CLT', 'INTERMITENTE']);
  });

  it('limita o desconto de vale-transporte a 6% do salario do periodo', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, valeTransporte: true, valeTransporteValorDiario: 50 },
      faltas: [],
      comissoesAdiantadas: 0,
    });
    // 50,00 x 30 dias = 1500,00 de custo real, mas o teto legal e 6% de 3000 = 180,00.
    expect(resultado.descontoValeTransporte).toBe(180);
  });

  it('cobra o custo real do vale-transporte quando ele fica abaixo dos 6%', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, valeTransporte: true, valeTransporteValorDiario: 4 },
      faltas: [],
      comissoesAdiantadas: 0,
    });
    // 4,00 x 30 dias = 120,00, menos que os 180,00 do teto.
    expect(resultado.descontoValeTransporte).toBe(120);
  });

  it('nao cobra vale-transporte dos dias em que houve falta', () => {
    const resultado = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, valeTransporte: true, valeTransporteValorDiario: 4 },
      faltas: [falta('2025-08-05')],
      comissoesAdiantadas: 0,
    });
    // 4,00 x (30 - 1) = 116,00
    expect(resultado.descontoValeTransporte).toBe(116);
  });
});
