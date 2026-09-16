/**
 * REGRESSAO: `REGIMES_CONTRATO.temDecimoTerceiroEFerias` precisa ser APLICADO,
 * nao apenas declarado.
 *
 * A flag existia em `payroll/folha.ts` e ate tinha teste — mas o teste so
 * conferia que a constante dizia o que a constante dizia. Os modulos de 13o,
 * ferias e provisoes nunca a liam. O resultado, com os dados do seed:
 *
 *   - a folha de 13o pagava socio, PJ e estagiario (cerca de 23% do total);
 *   - o relatorio de provisoes lancava passivo de ferias e 13o para eles;
 *   - o saldo de ferias os listava com 30 dias de direito.
 *
 * Pagar 13o a um PJ, alem de indevido, e prova de vinculo empregaticio.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGIMES_CONTRATO, type Colaborador, type TipoContrato } from '@rhmacaw/shared';
import { COMPETENCIA, bearer, encerrarAmbiente, prepararAmbiente, type Ambiente } from './apoio.js';

let api: Ambiente;
let porId: Map<string, Colaborador>;
const auth = () => bearer(api.token);

const SEM_DIREITO: TipoContrato[] = ['SOCIO', 'PJ', 'ESTAGIO'];

const tipoDe = (colaboradorId: string): TipoContrato | undefined => porId.get(colaboradorId)?.tipoContrato;

beforeAll(async () => {
  api = await prepararAmbiente();
  const lista = await request(api.app)
    .get('/api/colaboradores?porPagina=500')
    .set('Authorization', auth())
    .expect(200);
  porId = new Map((lista.body.itens as Colaborador[]).map((c) => [c.id, c]));
  // O seed precisa mesmo conter os contratos sem direito, senao o teste passa a toa.
  expect(SEM_DIREITO.every((t) => [...porId.values()].some((c) => c.tipoContrato === t))).toBe(true);
});

afterAll(encerrarAmbiente);

describe('regime de contrato aplicado ao 13o, ferias e provisoes', () => {
  it('a constante e a unica fonte da verdade sobre quem tem 13o e ferias', () => {
    for (const tipo of SEM_DIREITO) {
      expect(REGIMES_CONTRATO[tipo].temDecimoTerceiroEFerias, tipo).toBe(false);
    }
    expect(REGIMES_CONTRATO.CLT.temDecimoTerceiroEFerias).toBe(true);
    expect(REGIMES_CONTRATO.INTERMITENTE.temDecimoTerceiroEFerias).toBe(true);
  });

  it('a previa de 13o nao lista socio, PJ nem estagiario', async () => {
    const resposta = await request(api.app)
      .get('/api/decimo-terceiro?ano=2025')
      .set('Authorization', auth())
      .expect(200);
    const tipos = (resposta.body as { colaboradorId: string }[]).map((d) => tipoDe(d.colaboradorId));
    expect(tipos.length).toBeGreaterThan(0);
    expect(tipos.filter((t) => t && SEM_DIREITO.includes(t))).toEqual([]);
  });

  it('a folha de 13o nao paga um centavo a quem nao tem direito', async () => {
    const folha = await request(api.app)
      .post('/api/decimo-terceiro/processar')
      .set('Authorization', auth())
      .send({ ano: 2025, parcela: 1, dataPagamento: '2025-11-28' })
      .expect(201);

    const itens = folha.body.itens as { colaboradorId: string; totalProventos: number; fgts: number }[];
    const indevidos = itens.filter((i) => {
      const t = tipoDe(i.colaboradorId);
      return t !== undefined && SEM_DIREITO.includes(t);
    });
    expect(indevidos).toEqual([]);
    // E o total da folha continua sendo a soma exata dos itens que restaram.
    const soma = Number(itens.reduce((a, i) => a + i.totalProventos, 0).toFixed(2));
    expect(soma).toBe(folha.body.totalProventos);
    // FGTS do 13o tambem respeita o regime.
    for (const item of itens) {
      const regime = REGIMES_CONTRATO[tipoDe(item.colaboradorId) ?? 'CLT'];
      if (!regime.temFGTS) expect(item.fgts).toBe(0);
    }
  });

  it('o saldo de ferias nao inventa direito para socio, PJ e estagiario', async () => {
    const resposta = await request(api.app).get('/api/ferias/saldos').set('Authorization', auth()).expect(200);
    const tipos = (resposta.body as { colaboradorId: string }[]).map((s) => tipoDe(s.colaboradorId));
    expect(tipos.length).toBeGreaterThan(0);
    expect(tipos.filter((t) => t && SEM_DIREITO.includes(t))).toEqual([]);
  });

  it('programar ferias para um socio e recusado com 422, e nao gravado', async () => {
    const socio = [...porId.values()].find((c) => c.tipoContrato === 'SOCIO');
    expect(socio).toBeDefined();

    const recusa = await request(api.app)
      .post('/api/ferias')
      .set('Authorization', auth())
      .send({
        colaboradorId: socio?.id,
        periodoAquisitivoInicio: '2024-01-01',
        periodoAquisitivoFim: '2024-12-31',
        inicioGozo: '2025-11-03',
        diasGozo: 30,
        diasAbono: 0,
        adiantarDecimoTerceiro: true,
      })
      .expect(422);
    expect(recusa.body.mensagem).toContain('SOCIO');

    const gravadas = await request(api.app)
      .get(`/api/ferias?colaboradorId=${socio?.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(gravadas.body).toEqual([]);
  });

  it('as provisoes de ferias e 13o cobrem somente quem gera esse passivo', async () => {
    const resposta = await request(api.app)
      .get(`/api/relatorios/provisoes?competencia=${COMPETENCIA}`)
      .set('Authorization', auth())
      .expect(200);

    const linhas = resposta.body.linhas as { colaboradorId: string; total: number }[];
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.filter((l) => SEM_DIREITO.includes(tipoDe(l.colaboradorId) as TipoContrato))).toEqual([]);
    const soma = Number(linhas.reduce((a, l) => a + l.total, 0).toFixed(2));
    expect(soma).toBe(resposta.body.totais.total);
  });
});
