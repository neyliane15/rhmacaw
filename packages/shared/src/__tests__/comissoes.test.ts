/**
 * Rateio semanal das comissoes: os 4 criterios, a sobra de centavos e o
 * participante que fecha negativo depois do ajuste.
 */
import { describe, expect, it } from 'vitest';
import { CRITERIOS_RATEIO } from '../domain/tipos.js';
import { mediaComissoes, ratearComissoes, type ParticipanteRateio } from '../payroll/comissoes.js';

const p = (id: string, pontos: number, horas: number, extra: Partial<ParticipanteRateio> = {}): ParticipanteRateio => ({
  colaboradorId: id,
  nome: id.toUpperCase(),
  pontos,
  horas,
  ...extra,
});

describe('retencao da casa antes do rateio', () => {
  it('retem o percentual informado e distribui apenas o restante', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 10000,
      percentualRetencao: 10,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0), p('b', 0, 0)],
    });
    expect(resultado.valorRetido).toBe(1000);
    expect(resultado.valorDistribuivel).toBe(9000);
    expect(resultado.totalDistribuido).toBe(9000);
  });

  it('trata retencao fora do intervalo como o limite mais proximo', () => {
    const acima = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 250,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0)],
    });
    const abaixo = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: -50,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0)],
    });
    expect(acima.valorDistribuivel).toBe(0);
    expect(abaixo.valorDistribuivel).toBe(1000);
  });
});

describe('os quatro criterios de rateio', () => {
  it('cobre exatamente os criterios declarados no dominio', () => {
    expect([...CRITERIOS_RATEIO].sort()).toEqual(['HORAS', 'IGUALITARIO', 'MANUAL', 'PONTOS']);
  });

  it('PONTOS distribui na proporcao dos pontos de cada um', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [p('a', 3, 40), p('b', 1, 40)],
    });
    expect(resultado.linhas.map((l) => l.valor)).toEqual([750, 250]);
  });

  /**
   * REGRESSAO: o peso do rateio nao e dinheiro e nao pode passar por
   * `naoNegativo`, que arredonda para centavos. Com pontos de 4 casas
   * (1,6764 virava 1,68) a proporcao saia distorcida e cada pessoa recebia
   * alguns centavos a mais ou a menos por semana, ainda que o total fechasse.
   */
  it('PONTOS respeita as casas decimais do peso, sem arredondar para centavos', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 10000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      // Somam 100,0000 exatos; arredondar cada peso para 2 casas daria 99,99.
      participantes: [p('a', 1.6764, 40), p('b', 39.7234, 40), p('c', 0.6549, 40), p('d', 57.9453, 40)],
    });
    const valores = resultado.linhas.map((l) => l.valorRateado);
    // 10000 x peso / 100 = peso x 100, arredondado ao centavo.
    expect(valores).toEqual([167.64, 3972.34, 65.49, 5794.53]);
    expect(resultado.totalDistribuido).toBe(10000);
  });

  it('PONTOS com peso fracionario nao perde nem cria centavos no total', () => {
    const participantes = [p('a', 1.6764, 55), p('b', 2.302, 55), p('c', 0.6549, 55), p('d', 3.2229, 55)];
    const resultado = ratearComissoes({
      valorArrecadado: 9000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes,
    });
    const pesoTotal = participantes.reduce((a, x) => a + x.pontos, 0);
    // Cada linha bate com a proporcao exata calculada fora do motor.
    const esperado = participantes.map((x) => Math.round((9000 * x.pontos * 100) / pesoTotal) / 100);
    const soma = esperado.reduce((a, v) => a + v, 0);
    expect(resultado.linhas.map((l) => l.valorRateado)).toEqual(
      // a sobra de centavos vai para o maior beneficiario
      esperado.map((v, i) => (i === 3 ? Number((v + Math.round((9000 - soma) * 100) / 100).toFixed(2)) : v)),
    );
    expect(resultado.totalDistribuido).toBe(9000);
  });

  it('HORAS distribui na proporcao das horas trabalhadas na semana', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'HORAS',
      participantes: [p('a', 1, 30), p('b', 9, 20)],
    });
    // Os pontos sao ignorados: 30h e 20h dao 600,00 e 400,00.
    expect(resultado.linhas.map((l) => l.valor)).toEqual([600, 400]);
  });

  it('IGUALITARIO divide em partes iguais, ignorando pontos e horas', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 900,
      percentualRetencao: 0,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 100, 44), p('b', 1, 4), p('c', 0, 0)],
    });
    expect(resultado.linhas.map((l) => l.valor)).toEqual([300, 300, 300]);
  });

  it('MANUAL usa o valor digitado para cada participante', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'MANUAL',
      participantes: [p('a', 0, 0, { valorManual: 700 }), p('b', 0, 0, { valorManual: 300 })],
    });
    expect(resultado.linhas.map((l) => l.valor)).toEqual([700, 300]);
    expect(resultado.alertas).toEqual([]);
  });

  it('MANUAL alerta quando a soma digitada nao fecha com o distribuivel', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'MANUAL',
      participantes: [p('a', 0, 0, { valorManual: 700 }), p('b', 0, 0, { valorManual: 200 })],
    });
    expect(resultado.alertas.some((a) => a.includes('900.00') && a.includes('1000.00'))).toBe(true);
  });

  it('alerta e zera o rateio quando o criterio nao tem peso valido', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [p('a', 0, 44), p('b', 0, 44)],
    });
    expect(resultado.linhas.every((l) => l.valorRateado === 0)).toBe(true);
    expect(resultado.alertas.some((a) => a.includes('sem peso valido'))).toBe(true);
  });

  it('nao entrega a semana inteira ao primeiro participante quando falta peso', () => {
    // Sem peso valido nada foi rateado; a "sobra" seria o distribuivel inteiro,
    // e realoca-la pagaria os 1000,00 da semana a uma pessoa so.
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'HORAS',
      participantes: [p('a', 5, 0), p('b', 5, 0)],
    });
    expect(resultado.diferencaArredondamento).toBe(0);
    expect(resultado.totalDistribuido).toBe(0);
    expect(resultado.linhas.map((l) => l.valor)).toEqual([0, 0]);
  });

  it('nao distribui nada quando nao ha participantes', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [],
    });
    expect(resultado.linhas).toEqual([]);
    expect(resultado.totalDistribuido).toBe(0);
    expect(resultado.alertas).toEqual(['Nenhum participante no período: nada a distribuir.']);
  });
});

describe('sobra de centavos', () => {
  it('joga o centavo que sobra da dizima no maior beneficiario', () => {
    // 1000 / 3 = 333,333...: tres linhas de 333,33 somam 999,99.
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [p('a', 1, 0), p('b', 1, 0), p('c', 1, 0)],
    });
    expect(resultado.diferencaArredondamento).toBe(0.01);
    expect(resultado.totalDistribuido).toBe(1000);
    expect(resultado.linhas.map((l) => l.valor).sort((x, y) => y - x)).toEqual([333.34, 333.33, 333.33]);
  });

  it('devolve o centavo a mais quando o arredondamento estoura o distribuivel', () => {
    // 100 dividido por 3, 3 e 1: 42,857..., 42,857... e 14,285... arredondam para cima.
    const resultado = ratearComissoes({
      valorArrecadado: 100,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [p('a', 3, 0), p('b', 3, 0), p('c', 1, 0)],
    });
    expect(resultado.totalDistribuido).toBe(100);
  });

  it('fecha exatamente o valor distribuivel em sete vias, que e a pior dizima', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1234.57,
      percentualRetencao: 13,
      criterio: 'IGUALITARIO',
      participantes: Array.from({ length: 7 }, (_, i) => p(`c${i}`, 1, 0)),
    });
    expect(resultado.totalDistribuido).toBe(resultado.valorDistribuivel);
  });
});

describe('ajustes e participantes negativos', () => {
  it('soma o ajuste depois do rateio proporcional', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0, { ajuste: 50 }), p('b', 0, 0)],
    });
    expect(resultado.linhas[0]?.valorRateado).toBe(500);
    expect(resultado.linhas[0]?.valor).toBe(550);
    expect(resultado.totalDistribuido).toBe(1050);
  });

  it('alerta quando o ajuste negativo deixa o participante devendo', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 1000,
      percentualRetencao: 0,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0, { ajuste: -800 }), p('b', 0, 0)],
    });
    expect(resultado.linhas[0]?.valor).toBe(-300);
    expect(resultado.alertas.some((a) => a.includes('1 participante(s) com valor negativo'))).toBe(true);
  });

  it('mantem o ajuste negativo visivel em vez de zera-lo', () => {
    const resultado = ratearComissoes({
      valorArrecadado: 100,
      percentualRetencao: 0,
      criterio: 'IGUALITARIO',
      participantes: [p('a', 0, 0, { ajuste: -500 })],
    });
    // O acerto negativo precisa aparecer para o RH lancar na competencia seguinte.
    expect(resultado.linhas[0]?.valor).toBe(-400);
    expect(resultado.totalDistribuido).toBe(-400);
  });
});

describe('media de comissoes para ferias, 13o e rescisao', () => {
  it('divide pelo numero de meses do periodo, e nao pelos meses com pagamento', () => {
    // 1200 pagos em 2 dos 12 meses: a media do periodo e 100,00.
    expect(mediaComissoes([600, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(100);
  });

  it('considera apenas os ultimos 12 meses quando o historico e maior', () => {
    const historico = [9999, ...Array.from({ length: 12 }, () => 120)];
    expect(mediaComissoes(historico)).toBe(120);
  });

  it('devolve zero quando nao ha historico', () => {
    expect(mediaComissoes([])).toBe(0);
  });
});
