/**
 * REGRESSAO: o saldo de ferias e apurado POR periodo aquisitivo.
 *
 * O bug corrigido aqui somava `dias_gozo + dias_abono` de todos os registros do
 * colaborador, sem olhar a qual periodo aquisitivo cada um pertencia. Bastava o
 * empregado ter tirado ferias uma vez na vida para o saldo do periodo corrente
 * aparecer como zero — e, pior, para a rescisao deixar de pagar as ferias
 * vencidas e o terco constitucional, verbas legalmente devidas.
 *
 * Os dois testes de dinheiro abaixo comparam o TRCT antes e depois de lancar
 * umas ferias ANTIGAS: o valor do TRCT nao pode mudar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, encerrarAmbiente, prepararAmbiente, type Ambiente } from './apoio.js';

let api: Ambiente;
let colaboradorId: string;
const auth = () => bearer(api.token);

/** Admitido ha varios anos: tem periodos aquisitivos fechados de sobra. */
const ADMISSAO = '2019-06-12';
const DESLIGAMENTO = '2025-10-15';

const pedidoRescisao = () => ({
  colaboradorId,
  dataAviso: '2025-09-15',
  dataDesligamento: DESLIGAMENTO,
  motivo: 'SEM_JUSTA_CAUSA',
  tipoAviso: 'INDENIZADO',
  saldoFGTS: 5000,
});

const simular = async () =>
  (await request(api.app).post('/api/rescisoes/simular').set('Authorization', auth()).send(pedidoRescisao()).expect(200))
    .body as { feriasVencidas: number; tercoFeriasVencidas: number; liquido: number };

const saldoDo = async () => {
  const resposta = await request(api.app).get('/api/ferias/saldos').set('Authorization', auth()).expect(200);
  return (resposta.body as { colaboradorId: string; diasGozados: number; diasSaldo: number }[]).find(
    (s) => s.colaboradorId === colaboradorId,
  );
};

beforeAll(async () => {
  api = await prepararAmbiente();
  const criado = await request(api.app)
    .post('/api/colaboradores')
    .set('Authorization', auth())
    .send({
      nome: 'VETERANO DA CASA',
      cpf: '52998224725',
      funcao: 'GARCOM',
      centroCusto: 'FOLHA TOKITO',
      tipoContrato: 'CLT',
      situacao: 'ATIVO',
      salarioBase: 2035,
      cargaHorariaMensal: 220,
      valeTransporte: false,
      pontosComissao: 1,
      dependentesIRRF: 0,
      dependentesSalarioFamilia: 0,
      periculosidade: false,
      admissao: ADMISSAO,
    })
    .expect(201);
  colaboradorId = criado.body.id;
});

afterAll(encerrarAmbiente);

describe('saldo de ferias por periodo aquisitivo', () => {
  let antes: Awaited<ReturnType<typeof simular>>;

  it('parte de 30 dias de saldo e paga ferias vencidas na rescisao', async () => {
    const saldo = await saldoDo();
    expect(saldo?.diasGozados).toBe(0);
    expect(saldo?.diasSaldo).toBe(30);

    antes = await simular();
    expect(antes.feriasVencidas).toBeGreaterThan(0);
    expect(antes.tercoFeriasVencidas).toBeGreaterThan(0);
  });

  it('ferias de um periodo aquisitivo ANTIGO nao abatem o saldo do periodo em aberto', async () => {
    await request(api.app)
      .post('/api/ferias')
      .set('Authorization', auth())
      .send({
        colaboradorId,
        // Periodo aquisitivo 2023/2024 — ja encerrado e distinto do apurado hoje.
        periodoAquisitivoInicio: '2023-06-12',
        periodoAquisitivoFim: '2024-06-11',
        inicioGozo: '2024-07-01',
        diasGozo: 30,
        diasAbono: 0,
        adiantarDecimoTerceiro: false,
        status: 'CONCLUIDA',
      })
      .expect(201);

    const saldo = await saldoDo();
    expect(saldo?.diasGozados).toBe(0);
    expect(saldo?.diasSaldo).toBe(30);
  });

  it('o TRCT continua pagando ferias vencidas depois do lancamento antigo', async () => {
    const depois = await simular();
    expect(depois.feriasVencidas).toBe(antes.feriasVencidas);
    expect(depois.tercoFeriasVencidas).toBe(antes.tercoFeriasVencidas);
    expect(depois.liquido).toBe(antes.liquido);
  });

  it('ferias lancadas no periodo apurado, essas sim, abatem o saldo', async () => {
    const vencido = { inicio: '2024-06-12', fim: '2025-06-11' };
    await request(api.app)
      .post('/api/ferias')
      .set('Authorization', auth())
      .send({
        colaboradorId,
        periodoAquisitivoInicio: vencido.inicio,
        periodoAquisitivoFim: vencido.fim,
        inicioGozo: '2025-07-01',
        diasGozo: 20,
        diasAbono: 10,
        adiantarDecimoTerceiro: false,
        status: 'CONCLUIDA',
      })
      .expect(201);

    const depois = await simular();
    expect(depois.feriasVencidas).toBe(0);
    expect(depois.liquido).toBeLessThan(antes.liquido);
  });
});
