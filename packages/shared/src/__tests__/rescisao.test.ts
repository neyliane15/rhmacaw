/**
 * Rescisao: matriz dos 7 motivos, aviso previo proporcional da Lei
 * 12.506/2011, multa do FGTS e a Sumula 171 do TST.
 */
import { describe, expect, it } from 'vitest';
import { MOTIVOS_RESCISAO } from '../domain/tipos.js';
import type { Colaborador, MotivoRescisao } from '../domain/tipos.js';
import { REGRAS_RESCISAO, avosProporcionais, calcularRescisao, diasAvisoPrevio } from '../payroll/rescisao.js';

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

const trct = (motivo: MotivoRescisao, extra: Partial<Parameters<typeof calcularRescisao>[0]> = {}) =>
  calcularRescisao({
    colaborador: base,
    dataAviso: '2025-09-01',
    dataDesligamento: '2025-09-30',
    motivo,
    tipoAviso: 'INDENIZADO',
    mediaComissoes: 0,
    diasFeriasVencidas: 0,
    saldoFGTS: 10000,
    ...extra,
  });

describe('aviso previo proporcional (Lei 12.506/2011)', () => {
  it('garante 30 dias a quem tem menos de um ano de casa', () => {
    expect(diasAvisoPrevio('2025-03-01', '2025-09-30')).toBe(30);
  });

  it('acrescenta 3 dias por ano completo de servico', () => {
    // 994 dias entre 10/01/2023 e 30/09/2025 = 2 anos completos: 30 + 6.
    expect(diasAvisoPrevio('2023-01-10', '2025-09-30')).toBe(36);
    // 2039 dias entre 01/03/2020 e 30/09/2025 = 5 anos completos: 30 + 15.
    expect(diasAvisoPrevio('2020-03-01', '2025-09-30')).toBe(45);
  });

  it('para no teto de 90 dias por mais tempo de casa que haja', () => {
    // 25 anos completos dariam 105 dias.
    expect(diasAvisoPrevio('2000-01-01', '2025-09-30')).toBe(90);
  });
});

describe('avos proporcionais de 13o e ferias', () => {
  it('conta um avo por mes com 15 dias ou mais dentro do periodo', () => {
    expect(avosProporcionais('2025-01-01', '2025-09-30')).toBe(9);
  });

  it('descarta a fracao final menor que 15 dias', () => {
    // 01/01 a 10/09: o ultimo avo teria so 10 dias.
    expect(avosProporcionais('2025-01-01', '2025-09-10')).toBe(8);
  });

  it('nunca passa de 12 avos', () => {
    expect(avosProporcionais('2023-01-01', '2025-12-31')).toBe(12);
  });

  it('devolve zero quando o fim e anterior ao inicio', () => {
    expect(avosProporcionais('2025-09-30', '2025-01-01')).toBe(0);
  });
});

describe('matriz dos motivos de rescisao', () => {
  it('cobre exatamente os 7 motivos declarados no dominio', () => {
    expect(Object.keys(REGRAS_RESCISAO).sort()).toEqual([...MOTIVOS_RESCISAO].sort());
  });

  it('dispensa sem justa causa paga aviso indenizado, 13o, ferias e multa de 40%', () => {
    const resultado = trct('SEM_JUSTA_CAUSA');
    expect(resultado.avisoPrevioIndenizado).toBeGreaterThan(0);
    expect(resultado.decimoTerceiroProporcional).toBeGreaterThan(0);
    expect(resultado.feriasProporcionais).toBeGreaterThan(0);
    expect(resultado.multaFGTS).toBe(4000); // 40% de 10000,00
    expect(resultado.habilitaSeguroDesemprego).toBe(true);
  });

  it('pedido de demissao desconta o aviso nao cumprido e nao gera multa', () => {
    const resultado = trct('PEDIDO_DEMISSAO');
    expect(resultado.avisoPrevioIndenizado).toBe(0);
    expect(resultado.avisoPrevioDescontado).toBe(3000); // 30 dias a 100,00
    expect(resultado.multaFGTS).toBe(0);
    expect(resultado.habilitaSeguroDesemprego).toBe(false);
    // Continua tendo 13o e ferias proporcionais.
    expect(resultado.feriasProporcionais).toBeGreaterThan(0);
  });

  it('justa causa nao paga ferias proporcionais (Sumula 171 do TST)', () => {
    const resultado = trct('JUSTA_CAUSA');
    expect(resultado.feriasProporcionais).toBe(0);
    expect(resultado.tercoFeriasProporcionais).toBe(0);
    expect(resultado.decimoTerceiroProporcional).toBe(0);
    expect(resultado.avisoPrevioIndenizado).toBe(0);
    expect(resultado.multaFGTS).toBe(0);
  });

  it('justa causa continua pagando ferias vencidas, que ja eram direito adquirido', () => {
    const resultado = trct('JUSTA_CAUSA', { diasFeriasVencidas: 30 });
    expect(resultado.feriasVencidas).toBe(3000);
    expect(resultado.tercoFeriasVencidas).toBe(1000);
  });

  it('acordo do art. 484-A paga metade do aviso e multa de 20%', () => {
    const semAcordo = trct('SEM_JUSTA_CAUSA');
    const acordo = trct('ACORDO_484A');
    expect(acordo.avisoPrevioIndenizado).toBe(Number((semAcordo.avisoPrevioIndenizado / 2).toFixed(2)));
    expect(acordo.multaFGTS).toBe(2000); // 20% de 10000,00
    expect(acordo.habilitaSeguroDesemprego).toBe(false);
  });

  it('termino de contrato nao gera aviso nem multa, mas paga as proporcionais', () => {
    const resultado = trct('TERMINO_CONTRATO');
    expect(resultado.avisoPrevioIndenizado).toBe(0);
    expect(resultado.avisoPrevioDescontado).toBe(0);
    expect(resultado.multaFGTS).toBe(0);
    expect(resultado.decimoTerceiroProporcional).toBeGreaterThan(0);
    expect(resultado.feriasProporcionais).toBeGreaterThan(0);
  });

  it('aposentadoria libera o saque integral do FGTS sem multa', () => {
    expect(REGRAS_RESCISAO.APOSENTADORIA.percentualSaqueFGTS).toBe(1);
    expect(trct('APOSENTADORIA').multaFGTS).toBe(0);
  });

  it('falecimento paga as proporcionais aos herdeiros, sem aviso nem multa', () => {
    const resultado = trct('FALECIMENTO');
    expect(resultado.avisoPrevioIndenizado).toBe(0);
    expect(resultado.multaFGTS).toBe(0);
    expect(resultado.decimoTerceiroProporcional).toBeGreaterThan(0);
    expect(resultado.feriasProporcionais).toBeGreaterThan(0);
  });

  it('so a dispensa sem justa causa habilita o seguro-desemprego', () => {
    const habilitam = MOTIVOS_RESCISAO.filter((m) => REGRAS_RESCISAO[m].seguroDesemprego);
    expect(habilitam).toEqual(['SEM_JUSTA_CAUSA']);
  });
});

describe('verbas do TRCT', () => {
  it('paga o saldo de salario pelos dias trabalhados no mes do desligamento', () => {
    const resultado = trct('SEM_JUSTA_CAUSA', { dataDesligamento: '2025-09-12' });
    expect(resultado.diasTrabalhadosNoMes).toBe(12);
    expect(resultado.saldoSalario).toBe(1200); // 12 x 100,00
  });

  it('calcula o aviso indenizado pelos dias proporcionais ao tempo de casa', () => {
    // 36 dias de aviso x 100,00.
    const resultado = trct('SEM_JUSTA_CAUSA');
    expect(resultado.diasAvisoPrevio).toBe(36);
    expect(resultado.avisoPrevioIndenizado).toBe(3600);
  });

  it('projeta o contrato pelo aviso indenizado e ganha um avo a mais de 13o', () => {
    const indenizado = trct('SEM_JUSTA_CAUSA', { tipoAviso: 'INDENIZADO' });
    const trabalhado = trct('SEM_JUSTA_CAUSA', { tipoAviso: 'TRABALHADO' });
    // Com aviso indenizado o contrato projeta ate 06/11 e alcanca 10 avos;
    // sem projecao, para em 30/09 com 9 avos.
    expect(indenizado.decimoTerceiroProporcional).toBe(2500);
    expect(trabalhado.decimoTerceiroProporcional).toBe(2250);
  });

  it('paga um terco sobre as ferias vencidas e sobre as proporcionais', () => {
    const resultado = trct('SEM_JUSTA_CAUSA', { diasFeriasVencidas: 30 });
    expect(resultado.feriasVencidas).toBe(3000);
    expect(resultado.tercoFeriasVencidas).toBe(1000);
    expect(resultado.tercoFeriasProporcionais).toBe(
      Number((resultado.feriasProporcionais / 3).toFixed(2)),
    );
  });

  it('reduz as ferias proporcionais quando as faltas cortam os dias de direito', () => {
    const semFaltas = trct('SEM_JUSTA_CAUSA');
    const comFaltas = trct('SEM_JUSTA_CAUSA', { faltasInjustificadasNoPeriodo: 20 });
    // Com 20 faltas o direito cai de 30 para 18 dias: 18/30 do valor.
    expect(comFaltas.feriasProporcionais).toBe(Number((semFaltas.feriasProporcionais * 0.6).toFixed(2)));
  });

  it('nao tributa ferias, terco nem aviso indenizado com INSS', () => {
    const resultado = trct('SEM_JUSTA_CAUSA', { diasFeriasVencidas: 30 });
    const naBaseINSS = resultado.verbas.filter((v) => v.baseINSS).map((v) => v.codigo);
    // 001 saldo de salario e 003 13o proporcional; nada de ferias nem aviso.
    expect(naBaseINSS).toEqual(['001', '003']);
  });

  it('inclui a media de comissoes na remuneracao que forma todas as verbas', () => {
    const semMedia = trct('SEM_JUSTA_CAUSA');
    const comMedia = trct('SEM_JUSTA_CAUSA', { mediaComissoes: 600 });
    // Remuneracao 3600 em vez de 3000: saldo de salario sobe 20%.
    expect(comMedia.saldoSalario).toBe(3600);
    expect(comMedia.saldoSalario).toBe(Number((semMedia.saldoSalario * 1.2).toFixed(2)));
  });

  it('marca o prazo legal de pagamento em 10 dias corridos do desligamento', () => {
    expect(trct('SEM_JUSTA_CAUSA').prazoPagamento).toBe('2025-10-10');
  });

  it('alerta quando a multa do FGTS fica zerada por falta de extrato', () => {
    const resultado = trct('SEM_JUSTA_CAUSA', { saldoFGTS: 0 });
    expect(resultado.multaFGTS).toBe(0);
    expect(resultado.alertas.some((a) => a.includes('Saldo do FGTS nao informado'))).toBe(true);
  });

  it('alerta quando o desconto do aviso deixa o TRCT negativo', () => {
    // Recem-admitido que pede demissao no segundo dia: 2 dias de saldo (200,00)
    // contra 30 dias de aviso nao cumprido (3000,00), sem avos a receber.
    const resultado = calcularRescisao({
      colaborador: { ...base, admissao: '2025-09-01' },
      dataAviso: '2025-09-01',
      dataDesligamento: '2025-09-02',
      motivo: 'PEDIDO_DEMISSAO',
      tipoAviso: 'INDENIZADO',
      mediaComissoes: 0,
      diasFeriasVencidas: 0,
      saldoFGTS: 0,
    });
    expect(resultado.saldoSalario).toBe(200);
    expect(resultado.avisoPrevioDescontado).toBe(3000);
    expect(resultado.inss).toBe(15); // 7,5% sobre os 200,00 de saldo
    expect(resultado.liquido).toBe(-2815);
    expect(resultado.alertas.some((a) => a.includes('liquido negativo'))).toBe(true);
  });

  it('fecha o liquido como proventos menos descontos', () => {
    const resultado = trct('SEM_JUSTA_CAUSA', { diasFeriasVencidas: 30, outrosDescontos: 150 });
    expect(resultado.liquido).toBe(Number((resultado.totalProventos - resultado.totalDescontos).toFixed(2)));
    expect(resultado.outrosDescontos).toBe(150);
  });
});
