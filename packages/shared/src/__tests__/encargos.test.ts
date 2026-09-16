/**
 * INSS e IRRF conferidos contra a conta feita a mao, faixa por faixa.
 *
 * Todos os valores esperados abaixo foram calculados fora do codigo, a partir
 * das tabelas de `payroll/tabelas.ts`: se o motor mudar, o teste acusa.
 * A data de referencia e sempre 2025-08-31, na vigencia da MP 1.294/2025.
 */
import { describe, expect, it } from 'vitest';
import { calcularINSS, calcularINSSProLabore, calcularIRRF, calcularSalarioFamilia } from '../payroll/encargos.js';

const COMPETENCIA = '2025-08-31';

describe('INSS progressivo do empregado', () => {
  it('cobra 7,5% quando a remuneracao inteira cabe na primeira faixa', () => {
    // 1000,00 x 7,5% = 75,00
    expect(calcularINSS(1000, COMPETENCIA).valor).toBe(75);
  });

  it('cobra exatamente o limite da primeira faixa quando a base bate nele', () => {
    // 1518,00 x 7,5% = 113,85
    expect(calcularINSS(1518, COMPETENCIA).valor).toBe(113.85);
  });

  it('soma as duas primeiras faixas na segunda faixa', () => {
    // 113,85 + (2000 - 1518) x 9% = 113,85 + 43,38
    expect(calcularINSS(2000, COMPETENCIA).valor).toBe(157.23);
  });

  it('soma as tres primeiras faixas na terceira faixa', () => {
    // 113,85 + 1275,88 x 9% + (3000 - 2793,88) x 12% = 113,85 + 114,83 + 24,73
    expect(calcularINSS(3000, COMPETENCIA).valor).toBe(253.41);
  });

  it('soma as quatro faixas na ultima faixa antes do teto', () => {
    // 113,85 + 114,83 + 1396,95 x 12% + (5000 - 4190,83) x 14% = 113,85 + 114,83 + 167,63 + 113,28
    expect(calcularINSS(5000, COMPETENCIA).valor).toBe(509.59);
  });

  it('para no teto do salario de contribuicao por maior que seja a remuneracao', () => {
    const teto = calcularINSS(8157.41, COMPETENCIA);
    const acimaDoTeto = calcularINSS(90000, COMPETENCIA);
    // 113,85 + 114,83 + 167,63 + 3966,58 x 14% = 951,63
    expect(teto.valor).toBe(951.63);
    expect(acimaDoTeto.valor).toBe(951.63);
    expect(acimaDoTeto.base).toBe(8157.41);
  });

  it('detalha a parcela tributada em cada faixa para o demonstrativo', () => {
    const resultado = calcularINSS(3000, COMPETENCIA);
    expect(resultado.faixas.map((f) => f.parcela)).toEqual([1518, 1275.88, 206.12]);
    expect(resultado.faixas.map((f) => f.valor)).toEqual([113.85, 114.83, 24.73]);
  });

  it('nao desconta nada de base zero ou negativa', () => {
    expect(calcularINSS(0, COMPETENCIA).valor).toBe(0);
    expect(calcularINSS(-500, COMPETENCIA).valor).toBe(0);
  });

  it('devolve a aliquota efetiva, que e menor que a nominal da ultima faixa', () => {
    const resultado = calcularINSS(5000, COMPETENCIA);
    // 509,59 / 5000 = 10,19% — bem abaixo dos 14% da faixa em que a base caiu.
    expect(resultado.aliquotaEfetiva).toBe(0.1019);
  });
});

describe('INSS do pro-labore (contribuinte individual)', () => {
  it('aplica 11% direto, sem as faixas do empregado', () => {
    expect(calcularINSSProLabore(5000, COMPETENCIA).valor).toBe(550);
  });

  it('limita a contribuicao ao teto do salario de contribuicao', () => {
    // 8157,41 x 11% = 897,3151 -> 897,32
    const resultado = calcularINSSProLabore(20000, COMPETENCIA);
    expect(resultado.base).toBe(8157.41);
    expect(resultado.valor).toBe(897.32);
  });

  it('cobra mais que o regime progressivo na mesma base', () => {
    expect(calcularINSSProLabore(5000, COMPETENCIA).valor).toBeGreaterThan(calcularINSS(5000, COMPETENCIA).valor);
  });
});

describe('IRRF por faixa', () => {
  const semDeducoes = (bruto: number) => calcularIRRF({ rendimentoBruto: bruto, inss: 0, dependentes: 0 }, COMPETENCIA);

  it('isenta quem fica na faixa de aliquota zero', () => {
    // 3000 - 607,20 (simplificado) = 2392,80, abaixo dos 2428,80 de isencao.
    const resultado = semDeducoes(3000);
    expect(resultado.valor).toBe(0);
    expect(resultado.aliquota).toBe(0);
  });

  it('aplica 7,5% com a parcela a deduzir da segunda faixa', () => {
    // base 2592,80 x 7,5% - 182,16 = 12,30
    const resultado = semDeducoes(3200);
    expect(resultado.aliquota).toBe(0.075);
    expect(resultado.valor).toBe(12.3);
  });

  it('aplica 15% com a parcela a deduzir da terceira faixa', () => {
    // base 3392,80 x 15% - 394,16 = 114,76
    const resultado = semDeducoes(4000);
    expect(resultado.aliquota).toBe(0.15);
    expect(resultado.valor).toBe(114.76);
  });

  it('aplica 22,5% com a parcela a deduzir da quarta faixa', () => {
    // base 4392,80 x 22,5% - 675,49 = 312,89
    const resultado = semDeducoes(5000);
    expect(resultado.aliquota).toBe(0.225);
    expect(resultado.valor).toBe(312.89);
  });

  it('aplica 27,5% com a parcela a deduzir da quinta faixa', () => {
    // base 5392,80 x 27,5% - 908,73 = 574,29
    const resultado = semDeducoes(6000);
    expect(resultado.aliquota).toBe(0.275);
    expect(resultado.valor).toBe(574.29);
  });
});

describe('IRRF: escolha entre deducao legal e desconto simplificado', () => {
  it('usa o desconto simplificado quando o INSS sozinho nao supera os 607,20', () => {
    const resultado = calcularIRRF({ rendimentoBruto: 3000, inss: 253.41, dependentes: 0 }, COMPETENCIA);
    expect(resultado.usouDescontoSimplificado).toBe(true);
    expect(resultado.deducoesAplicadas).toBe(607.2);
    expect(resultado.valor).toBe(0);
  });

  it('usa as deducoes legais quando os dependentes as tornam maiores', () => {
    // 660,00 de INSS + 3 x 189,59 = 1228,77 de deducao contra 607,20 do simplificado.
    // base 4771,23 x 27,5% - 908,73 = 403,36
    const resultado = calcularIRRF({ rendimentoBruto: 6000, inss: 660, dependentes: 3 }, COMPETENCIA);
    expect(resultado.usouDescontoSimplificado).toBe(false);
    expect(resultado.deducoesAplicadas).toBe(1228.77);
    expect(resultado.base).toBe(4771.23);
    expect(resultado.valor).toBe(403.36);
  });

  it('cada dependente reduz o imposto em ate 27,5% de 189,59', () => {
    const entrada = { rendimentoBruto: 9000, inss: 951.63 };
    const semDependente = calcularIRRF({ ...entrada, dependentes: 0 }, COMPETENCIA);
    const comDependente = calcularIRRF({ ...entrada, dependentes: 1 }, COMPETENCIA);
    // 189,59 x 27,5% = 52,14
    expect(Number((semDependente.valor - comDependente.valor).toFixed(2))).toBe(52.14);
  });

  it('deduz a pensao alimenticia integralmente, dentro dos dois modelos', () => {
    // Legal: base 5000 x 27,5% - 908,73 = 466,27.
    // Simplificado: deducao 607,20 + 1000 de pensao -> base 4392,80 x 22,5% - 675,49 = 312,89.
    const resultado = calcularIRRF(
      { rendimentoBruto: 6000, inss: 0, dependentes: 0, pensaoAlimenticia: 1000 },
      COMPETENCIA,
    );
    expect(resultado.usouDescontoSimplificado).toBe(true);
    expect(resultado.deducoesAplicadas).toBe(1607.2);
    expect(resultado.valor).toBe(312.89);
  });

  it('nunca devolve imposto negativo quando as deducoes zeram a base', () => {
    const resultado = calcularIRRF({ rendimentoBruto: 800, inss: 60, dependentes: 4 }, COMPETENCIA);
    expect(resultado.base).toBe(0);
    expect(resultado.valor).toBe(0);
  });

  it('usa a tabela anterior a MP 1.294 para competencias anteriores a maio de 2025', () => {
    // Em 2025-04-30 o limite de isencao ainda era 2259,20 e o simplificado 564,80:
    // base 3000 - 564,80 = 2435,20 x 7,5% - 169,44 = 13,20.
    const abril = calcularIRRF({ rendimentoBruto: 3000, inss: 0, dependentes: 0 }, '2025-04-30');
    expect(abril.valor).toBe(13.2);
    // Na mesma base, ja sob a MP, o contribuinte fica isento.
    expect(calcularIRRF({ rendimentoBruto: 3000, inss: 0, dependentes: 0 }, '2025-05-01').valor).toBe(0);
  });
});

describe('salario-familia', () => {
  it('paga a cota por dependente de quem esta dentro do limite de remuneracao', () => {
    expect(calcularSalarioFamilia(1800, 2, COMPETENCIA)).toBe(130); // 2 x 65,00
  });

  it('nao paga nada acima do limite de remuneracao', () => {
    expect(calcularSalarioFamilia(1906.05, 2, COMPETENCIA)).toBe(0);
  });

  it('nao paga nada a quem nao declarou dependente', () => {
    expect(calcularSalarioFamilia(1500, 0, COMPETENCIA)).toBe(0);
  });
});
