/**
 * 13o salario (Lei 4.090/62): avos por mes com 15 dias ou mais de vinculo,
 * primeira parcela sem encargos e segunda parcela carregando INSS e IRRF do
 * valor integral.
 */
import { describe, expect, it } from 'vitest';
import { calcularAvos, calcularDecimoTerceiro } from '../payroll/decimoTerceiro.js';
import type { Colaborador } from '../domain/tipos.js';

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

describe('avos de 13o', () => {
  it('conta 12 avos para quem trabalhou o ano inteiro', () => {
    expect(calcularAvos(base, 2025)).toBe(12);
  });

  it('conta o mes da admissao quando sobram 15 dias ou mais', () => {
    // 17 a 31 de julho = 15 dias: o avo de julho conta, somando 6 avos no ano.
    expect(calcularAvos({ ...base, admissao: '2025-07-17' }, 2025)).toBe(6);
  });

  it('descarta o mes da admissao quando sobram menos de 15 dias', () => {
    // 20 a 31 de julho = 12 dias: julho nao conta, restam agosto a dezembro.
    expect(calcularAvos({ ...base, admissao: '2025-07-20' }, 2025)).toBe(5);
  });

  it('descarta o mes do desligamento quando ele tem menos de 15 dias', () => {
    // 1 a 10 de junho = 10 dias: junho nao conta, restam janeiro a maio.
    expect(calcularAvos({ ...base, demissao: '2025-06-10' }, 2025)).toBe(5);
  });

  it('conta o mes do desligamento quando ele tem 15 dias ou mais', () => {
    expect(calcularAvos({ ...base, demissao: '2025-06-15' }, 2025)).toBe(6);
  });

  it('derruba o avo do mes em que as faltas injustificadas passam de 15 dias', () => {
    // Marco tem 31 dias; com 20 faltas sobram 11 dias trabalhados.
    expect(calcularAvos(base, 2025, { '2025-03': 20 })).toBe(11);
  });

  it('mantem o avo quando as faltas ainda deixam 15 dias trabalhados', () => {
    expect(calcularAvos(base, 2025, { '2025-03': 16 })).toBe(12);
  });

  it('nao conta nada para quem foi admitido depois do fim do ano apurado', () => {
    expect(calcularAvos({ ...base, admissao: '2026-02-01' }, 2025)).toBe(0);
  });

  it('para a contagem na data de referencia quando ela e anterior a dezembro', () => {
    // Apuracao em 20/08: janeiro a agosto = 8 avos.
    expect(calcularAvos(base, 2025, {}, '2025-08-20')).toBe(8);
  });
});

describe('calculo das parcelas', () => {
  const decimo = (extra: Partial<Parameters<typeof calcularDecimoTerceiro>[0]> = {}) =>
    calcularDecimoTerceiro({ colaborador: base, ano: 2025, mediaVariaveis: 0, ...extra });

  it('divide o 13o em 12 avos sobre a remuneracao', () => {
    const resultado = decimo();
    expect(resultado.avos).toBe(12);
    expect(resultado.valorIntegral).toBe(3000);
  });

  it('inclui a media de variaveis na base (Sumula 45 do TST)', () => {
    const resultado = decimo({ mediaVariaveis: 600 });
    expect(resultado.baseCalculo).toBe(3600);
    expect(resultado.valorIntegral).toBe(3600);
  });

  it('paga metade do integral na primeira parcela, sem nenhum desconto', () => {
    const resultado = decimo();
    expect(resultado.primeiraParcela).toBe(1500);
    // Os encargos aparecem no calculo, mas so saem da segunda parcela.
    expect(resultado.primeiraParcela + resultado.segundaParcelaBruta).toBe(resultado.valorIntegral);
  });

  it('retem na segunda parcela o INSS apurado sobre o 13o integral', () => {
    const resultado = decimo();
    // INSS sobre 3000,00: 113,85 + 114,83 + 24,73 = 253,41.
    expect(resultado.inss).toBe(253.41);
    expect(resultado.segundaParcelaBruta).toBe(1500);
    expect(resultado.segundaParcelaLiquida).toBe(1246.59);
  });

  it('retem IRRF proprio do 13o, separado da folha do mes', () => {
    const resultado = decimo({ colaborador: { ...base, salarioBase: 6000 } });
    // Integral 6000,00; INSS 113,85 + 114,83 + 167,63 + 1809,17 x 14% = 649,59.
    // Como o INSS (649,59) supera o desconto simplificado (607,20), vence a
    // deducao legal: base 6000 - 649,59 = 5350,41 x 27,5% - 908,73 = 562,63.
    expect(resultado.inss).toBe(649.59);
    expect(resultado.irrf).toBe(562.63);
  });

  it('abate o adiantamento realmente pago quando ele nao foi a metade exata', () => {
    const resultado = decimo({ primeiraParcelaPaga: 1000 });
    expect(resultado.primeiraParcela).toBe(1000);
    expect(resultado.segundaParcelaBruta).toBe(2000);
    expect(resultado.segundaParcelaLiquida).toBe(1746.59);
    // O total liquido do ano nao muda com o tamanho do adiantamento.
    expect(resultado.totalLiquido).toBe(decimo().totalLiquido);
  });

  it('proporcionaliza o 13o de quem foi admitido no meio do ano', () => {
    const resultado = decimo({ colaborador: { ...base, admissao: '2025-07-17' } });
    // 6 avos de 3000,00 = 1500,00.
    expect(resultado.avos).toBe(6);
    expect(resultado.valorIntegral).toBe(1500);
    expect(resultado.primeiraParcela).toBe(750);
  });

  it('usa a tabela vigente na data de pagamento informada', () => {
    const emDezembro = decimo({ dataPagamento: '2025-12-20' });
    const emAbril = decimo({ dataPagamento: '2025-04-30' });
    // O INSS nao mudou em maio/2025, mas o IRRF sim: a base de isencao subiu.
    expect(emDezembro.inss).toBe(emAbril.inss);
    expect(emAbril.irrf).toBeGreaterThan(emDezembro.irrf);
  });
});
