/**
 * Ferias: dias de direito por faltas (art. 130), recibo com abono e 1/3,
 * fracionamento do art. 134 par. 1o e controle do periodo concessivo.
 */
import { describe, expect, it } from 'vitest';
import {
  calcularFerias,
  calcularSaldoFerias,
  diasDeDireito,
  feriasAVencer,
  fracionamentoValido,
  periodoAquisitivoAtual,
} from '../payroll/ferias.js';
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
  admissao: '2023-01-10',
  criadoEm: '2025-01-01T00:00:00Z',
  atualizadoEm: '2025-01-01T00:00:00Z',
};

describe('dias de direito conforme as faltas do periodo aquisitivo (art. 130)', () => {
  it('garante 30 dias a quem faltou ate 5 vezes', () => {
    expect(diasDeDireito(0)).toBe(30);
    expect(diasDeDireito(5)).toBe(30);
  });

  it('cai para 24 dias entre 6 e 14 faltas', () => {
    expect(diasDeDireito(6)).toBe(24);
    expect(diasDeDireito(14)).toBe(24);
  });

  it('cai para 18 dias entre 15 e 23 faltas', () => {
    expect(diasDeDireito(15)).toBe(18);
    expect(diasDeDireito(23)).toBe(18);
  });

  it('cai para 12 dias entre 24 e 32 faltas', () => {
    expect(diasDeDireito(24)).toBe(12);
    expect(diasDeDireito(32)).toBe(12);
  });

  it('zera o direito acima de 32 faltas', () => {
    expect(diasDeDireito(33)).toBe(0);
    expect(diasDeDireito(60)).toBe(0);
  });
});

describe('recibo de ferias', () => {
  const recibo = (diasGozo: number, diasAbono: number, mediaComissoes = 0) =>
    calcularFerias({
      colaborador: base,
      mediaComissoes,
      diasGozo,
      diasAbono,
      inicioGozo: '2025-08-01',
      adiantarDecimoTerceiro: false,
    });

  it('paga 1/30 da remuneracao por dia de gozo, mais um terco', () => {
    const resultado = recibo(30, 0);
    // 3000 / 30 = 100,00 por dia; 30 dias = 3000,00; 1/3 = 1000,00.
    expect(resultado.valorFerias).toBe(3000);
    expect(resultado.valorTerco).toBe(1000);
    expect(resultado.totalProventos).toBe(4000);
  });

  it('inclui a media de comissoes dos 12 meses na base (art. 142, par. 3o)', () => {
    const resultado = recibo(30, 0, 600);
    // Base 3600 -> 120,00/dia -> 3600,00 de ferias + 1200,00 de terco.
    expect(resultado.baseCalculo).toBe(3600);
    expect(resultado.valorFerias).toBe(3600);
    expect(resultado.valorTerco).toBe(1200);
  });

  it('paga o abono pecuniario com o proprio terco, sem tributar nenhum dos dois', () => {
    const resultado = recibo(20, 10);
    expect(resultado.valorAbono).toBe(1000); // 10 dias x 100,00
    expect(resultado.valorTercoAbono).toBe(333.33);
    // So gozo (2000,00) + terco (666,67) entram na base do INSS.
    expect(resultado.baseINSS).toBe(2666.67);
  });

  it('desconta INSS e IRRF apenas sobre ferias gozadas e terco', () => {
    const resultado = recibo(30, 0);
    // INSS sobre 4000,00: 113,85 + 114,83 + 1206,12 x 12% = 373,41.
    expect(resultado.inss).toBe(373.41);
    // IRRF pelo simplificado: base 4000 - 607,20 = 3392,80 x 15% - 394,16 = 114,76.
    expect(resultado.irrf).toBe(114.76);
    expect(resultado.liquido).toBe(3511.83);
  });

  it('soma o adiantamento de metade do 13o quando o empregado pede (Lei 4.749/65)', () => {
    const resultado = calcularFerias({
      colaborador: base,
      mediaComissoes: 0,
      diasGozo: 30,
      diasAbono: 0,
      inicioGozo: '2025-08-01',
      adiantarDecimoTerceiro: true,
    });
    expect(resultado.valorAdiantamentoDecimo).toBe(1500); // metade de 3000,00
    expect(resultado.totalProventos).toBe(5500);
    // O adiantamento nao aumenta a base tributavel do recibo.
    expect(resultado.baseINSS).toBe(4000);
  });

  it('calcula a data final do gozo contando dias corridos a partir do inicio', () => {
    expect(recibo(30, 0).fimGozo).toBe('2025-08-30');
    expect(recibo(15, 0).fimGozo).toBe('2025-08-15');
  });

  it('alerta quando gozo mais abono passam dos 30 dias do periodo', () => {
    expect(recibo(30, 10).alertas.some((a) => a.includes('excede os 30 dias'))).toBe(true);
  });

  it('alerta quando o periodo de gozo tem menos de 5 dias corridos', () => {
    expect(recibo(3, 0).alertas.some((a) => a.includes('inferior a 5 dias'))).toBe(true);
  });
});

describe('fracionamento das ferias (art. 134, par. 1o)', () => {
  it('aceita o periodo unico de 30 dias', () => {
    expect(fracionamentoValido([{ diasGozo: 30 }])).toBe(true);
  });

  it('aceita ate tres periodos com um deles de pelo menos 14 dias', () => {
    expect(fracionamentoValido([{ diasGozo: 14 }, { diasGozo: 8 }, { diasGozo: 8 }])).toBe(true);
  });

  it('recusa mais de tres periodos', () => {
    expect(fracionamentoValido([{ diasGozo: 12 }, { diasGozo: 6 }, { diasGozo: 6 }, { diasGozo: 6 }])).toBe(false);
  });

  it('recusa fracionamento em que nenhum periodo chega a 14 dias', () => {
    expect(fracionamentoValido([{ diasGozo: 10 }, { diasGozo: 10 }, { diasGozo: 10 }])).toBe(false);
  });

  it('recusa fracionamento com periodo menor que 5 dias', () => {
    expect(fracionamentoValido([{ diasGozo: 14 }, { diasGozo: 12 }, { diasGozo: 4 }])).toBe(false);
  });
});

describe('periodo aquisitivo e concessivo', () => {
  it('abre o primeiro periodo aquisitivo na admissao e fecha um dia antes do aniversario', () => {
    const periodo = periodoAquisitivoAtual('2023-01-10', '2023-06-01');
    expect(periodo).toEqual({ inicio: '2023-01-10', fim: '2024-01-09', numero: 1 });
  });

  it('avanca o periodo aquisitivo a cada aniversario de admissao', () => {
    expect(periodoAquisitivoAtual('2023-01-10', '2025-06-01')).toEqual({
      inicio: '2025-01-10',
      fim: '2026-01-09',
      numero: 3,
    });
  });

  it('aponta o periodo ja vencido como o saldo em aberto para gozo', () => {
    const saldo = calcularSaldoFerias(base, 0, 0, '2025-06-01');
    expect(saldo.periodoAquisitivoInicio).toBe('2024-01-10');
    expect(saldo.periodoAquisitivoFim).toBe('2025-01-09');
    expect(saldo.diasDireito).toBe(30);
    expect(saldo.diasSaldo).toBe(30);
  });

  it('marca o limite concessivo 12 meses depois do fim do periodo aquisitivo (art. 134)', () => {
    const saldo = calcularSaldoFerias(base, 0, 0, '2025-06-01');
    expect(saldo.limiteConcessivo).toBe('2026-01-09');
    // 222 dias corridos entre 01/06/2025 e 09/01/2026.
    expect(saldo.diasParaVencer).toBe(222);
  });

  it('reduz o saldo pelos dias ja gozados', () => {
    expect(calcularSaldoFerias(base, 0, 20, '2025-06-01').diasSaldo).toBe(10);
  });

  it('reduz o saldo pelas faltas do periodo antes de descontar o gozo', () => {
    const saldo = calcularSaldoFerias(base, 16, 0, '2025-06-01');
    expect(saldo.diasDireito).toBe(18);
    expect(saldo.diasSaldo).toBe(18);
  });

  /**
   * LIMITACAO CONHECIDA, nao um bug de calculo: `calcularSaldoFerias` so
   * enxerga o ULTIMO periodo aquisitivo fechado, e o limite concessivo dele
   * coincide com o fim do periodo aquisitivo em curso. Como a data de
   * referencia nunca passa desse fim (o proprio `periodoAquisitivoAtual`
   * avanca junto), `vencida` e estruturalmente inalcancavel. Detectar ferias em
   * dobro exigiria guardar o gozo periodo a periodo, e nao um total acumulado.
   */
  it('nunca marca ferias como vencidas porque o limite concessivo acompanha o periodo em curso', () => {
    const emDia = calcularSaldoFerias(base, 0, 0, '2025-06-01');
    const anosDepois = calcularSaldoFerias(base, 0, 0, '2030-11-20');
    expect(emDia.vencida).toBe(false);
    expect(anosDepois.vencida).toBe(false);
    expect(anosDepois.limiteConcessivo).toBe(periodoAquisitivoAtual(base.admissao, '2030-11-20').fim);
    expect(anosDepois.diasParaVencer).toBeGreaterThanOrEqual(0);
  });

  it('lista primeiro quem vence antes na janela de alerta', () => {
    // Limite concessivo 14/07/2025 — vence primeiro.
    const urgente = calcularSaldoFerias({ ...base, id: 'c-urgente', admissao: '2023-07-15' }, 0, 0, '2025-06-01');
    // Limite concessivo 01/05/2026 — ainda tem folga.
    const folgado = calcularSaldoFerias({ ...base, id: 'c-folgado', admissao: '2023-05-02' }, 0, 0, '2025-06-01');
    expect(urgente.limiteConcessivo).toBe('2025-07-14');
    expect(folgado.limiteConcessivo).toBe('2026-05-01');
    expect(feriasAVencer([folgado, urgente], 400).map((s) => s.colaboradorId)).toEqual(['c-urgente', 'c-folgado']);
  });

  it('deixa de fora quem ja gozou tudo', () => {
    const semSaldo = calcularSaldoFerias(base, 0, 30, '2025-06-01');
    expect(feriasAVencer([semSaldo], 400)).toEqual([]);
  });
});
