/** Testes de fundacao: garantem que o nucleo compartilhado esta correto antes
 * de API e front serem construidos sobre ele. */
import { describe, expect, it } from 'vitest';
import { calcularINSS, calcularIRRF } from '../payroll/encargos.js';
import { calcularFolhaMensal } from '../payroll/folha.js';
import { ratearComissoes } from '../payroll/comissoes.js';
import { gerarCNAB240, inspecionarCNAB240 } from '../bank/cnab.js';
import type { Colaborador } from '../domain/tipos.js';

const base: Colaborador = {
  id: 'c1',
  tenantId: 't1',
  matricula: '0001',
  nome: 'ALEPH SOUZA CORDOVIL',
  cpf: '11144477735',
  funcao: 'GARCOM',
  centroCusto: 'FOLHA TOKITO',
  tipoContrato: 'CLT',
  situacao: 'ATIVO',
  salarioBase: 2035,
  cargaHorariaMensal: 220,
  valeTransporte: true,
  pontosComissao: 1,
  dependentesIRRF: 0,
  dependentesSalarioFamilia: 0,
  periculosidade: false,
  admissao: '2023-01-10',
  criadoEm: '2025-01-01T00:00:00Z',
  atualizadoEm: '2025-01-01T00:00:00Z',
};

describe('INSS progressivo', () => {
  it('cobra por faixa, nao pela aliquota unica', () => {
    // 1518 * 7,5% + (2000 - 1518) * 9% = 113,85 + 43,38
    expect(calcularINSS(2000, '2025-08-31').valor).toBe(157.23);
  });

  it('para no teto do salario de contribuicao', () => {
    const teto = calcularINSS(50000, '2025-08-31');
    expect(teto.base).toBe(8157.41);
    expect(teto.valor).toBe(951.63);
  });
});

describe('IRRF', () => {
  it('isenta quem fica abaixo da primeira faixa', () => {
    expect(calcularIRRF({ rendimentoBruto: 2400, inss: 180, dependentes: 0 }, '2025-08-31').valor).toBe(0);
  });

  it('aplica o desconto simplificado quando e mais vantajoso', () => {
    const r = calcularIRRF({ rendimentoBruto: 3000, inss: 250, dependentes: 0 }, '2025-08-31');
    expect(r.usouDescontoSimplificado).toBe(true);
  });
});

describe('folha mensal', () => {
  it('abate as comissoes ja adiantadas do valor a transferir', () => {
    const r = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: base,
      faltas: [{ id: 'f1', tenantId: 't1', colaboradorId: 'c1', data: '2025-08-12', tipo: 'FALTA', criadoEm: '' }],
      comissoesAdiantadas: 422.01,
    });
    // A relacao da planilha de origem: transferir = liquido - comissoes.
    expect(r.valorTransferir).toBe(Number((r.salarioLiquido - 422.01).toFixed(2)));
    expect(r.faltasDias).toBe(1);
    expect(r.descontoDSR).toBeGreaterThan(0); // falta injustificada derruba o DSR
  });

  it('alerta quando as comissoes adiantadas superam o liquido', () => {
    const r = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, salarioBase: 0 },
      faltas: [],
      comissoesAdiantadas: 205.78,
    });
    expect(r.valorTransferir).toBeLessThan(0);
    expect(r.alertas.some((a) => a.includes('negativo'))).toBe(true);
  });
});

describe('rateio semanal de comissoes', () => {
  it('distribui o valor integral sem sobra de centavos', () => {
    const r = ratearComissoes({
      valorArrecadado: 10000,
      percentualRetencao: 0,
      criterio: 'PONTOS',
      participantes: [
        { colaboradorId: 'a', nome: 'A', pontos: 1, horas: 0 },
        { colaboradorId: 'b', nome: 'B', pontos: 1, horas: 0 },
        { colaboradorId: 'c', nome: 'C', pontos: 1, horas: 0 },
      ],
    });
    expect(r.totalDistribuido).toBe(10000);
  });
});

describe('remessa CNAB 240', () => {
  const pagador = {
    bancoCodigo: '341',
    bancoNome: 'ITAU',
    agencia: '1234',
    agenciaDigito: '',
    conta: '567890',
    contaDigito: '1',
    convenio: '123456',
    nomeEmpresa: 'MACAW RESTAURANTE LTDA',
    cnpj: '11222333000181',
  };

  it('gera linhas de exatamente 240 caracteres e fecha o total', () => {
    const r = gerarCNAB240({
      pagador,
      dataPagamento: '2025-09-05',
      numeroRemessa: 1,
      geradoEm: new Date('2025-09-01T10:00:00Z'),
      favorecidos: [
        {
          colaboradorId: 'c1',
          nome: 'ALEPH SOUZA CORDOVIL',
          cpf: '11144477735',
          bancoCodigo: '341',
          agencia: '4321',
          agenciaDigito: '',
          conta: '112233',
          contaDigito: '4',
          tipoConta: 'CORRENTE',
          valor: 1219.26,
          referencia: 'FOLHA 2025-08',
        },
      ],
    });
    expect(r.linhas.every((l) => l.length === 240)).toBe(true);
    const inspecao = inspecionarCNAB240(r.conteudo);
    expect(inspecao.consistente).toBe(true);
    expect(inspecao.pagamentos[0]?.valor).toBe(1219.26);
  });

  it('exclui favorecido invalido em vez de derrubar o lote inteiro', () => {
    const r = gerarCNAB240({
      pagador,
      dataPagamento: '2025-09-05',
      numeroRemessa: 2,
      favorecidos: [
        { colaboradorId: 'ok', nome: 'VALIDO', cpf: '11144477735', bancoCodigo: '341', agencia: '1', agenciaDigito: '', conta: '1', contaDigito: '1', tipoConta: 'CORRENTE', valor: 100, referencia: 'X' },
        { colaboradorId: 'bad', nome: 'SEM CONTA', cpf: '11144477735', bancoCodigo: '341', agencia: '', agenciaDigito: '', conta: '', contaDigito: '', tipoConta: 'CORRENTE', valor: 50, referencia: 'Y' },
      ],
    });
    expect(r.quantidadePagamentos).toBe(1);
    expect(r.inconsistencias).toHaveLength(1);
  });
});

describe('regime por tipo de contrato', () => {
  const folhaDe = (tipo: Colaborador['tipoContrato'], salario: number) =>
    calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, tipoContrato: tipo, salarioBase: salario, valeTransporte: true },
      faltas: [],
      comissoesAdiantadas: 0,
    });

  it('CLT sofre INSS progressivo, FGTS e desconto de VT', () => {
    const r = folhaDe('CLT', 5000);
    expect(r.inss).toBe(calcularINSS(5000, '2025-08-31').valor);
    expect(r.fgts).toBe(400);
    expect(r.descontoValeTransporte).toBe(300); // 6% de 5000
  });

  it('socio recolhe pro-labore de 11% e nao gera FGTS nem VT', () => {
    const r = folhaDe('SOCIO', 10000);
    expect(r.inss).toBe(897.32); // 11% do teto de 8157,41
    expect(r.fgts).toBe(0);
    expect(r.descontoValeTransporte).toBe(0);
  });

  it('PJ e pago bruto, sem retencao na folha', () => {
    const r = folhaDe('PJ', 5000);
    expect(r.inss).toBe(0);
    expect(r.irrf).toBe(0);
    expect(r.fgts).toBe(0);
    expect(r.valorTransferir).toBe(5000);
  });

  it('estagiario nao tem INSS nem FGTS, mas o IRRF continua aplicavel', () => {
    const r = folhaDe('ESTAGIO', 938);
    expect(r.inss).toBe(0);
    expect(r.fgts).toBe(0);
    expect(r.irrf).toBe(0); // abaixo da faixa de isencao
    expect(r.valorTransferir).toBe(938);
  });

  it('intermitente nao perde DSR por nao ter jornada fixa', () => {
    const r = calcularFolhaMensal({
      competencia: '2025-08',
      colaborador: { ...base, tipoContrato: 'INTERMITENTE', salarioBase: 0, salarioHora: 8.94 },
      faltas: [{ id: 'f1', tenantId: 't1', colaboradorId: 'c1', data: '2025-08-12', tipo: 'FALTA', criadoEm: '' }],
      comissoesAdiantadas: 0,
      horasTrabalhadas: 105.5,
    });
    expect(r.descontoDSR).toBe(0);
    expect(r.totalProventos).toBeCloseTo(943.17, 2); // 105,5h x 8,94
  });
});
