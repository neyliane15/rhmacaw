/**
 * Ciclo semanal da comissao: criar periodo -> ratear -> fechar -> remessa PIX
 * -> periodo PAGO, e a relacao entre comissao paga na semana e folha do mes.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, encerrarAmbiente, prepararAmbiente, type Ambiente } from './apoio.js';

let api: Ambiente;
let periodoId: string;
let remessaId: string;
const auth = () => bearer(api.token);

beforeAll(async () => {
  api = await prepararAmbiente();
});

afterAll(encerrarAmbiente);

describe('semana de comissao ate o pagamento', () => {
  it('cria o periodo derivando as datas da semana ISO, e nao do corpo', async () => {
    const resposta = await request(api.app)
      .post('/api/comissoes/periodos')
      .set('Authorization', auth())
      .send({ ano: 2025, semana: 41, valorArrecadado: 8000, percentualRetencao: 10, criterioRateio: 'IGUALITARIO' })
      .expect(201);

    periodoId = resposta.body.id;
    expect(resposta.body.status).toBe('ABERTO');
    expect(resposta.body.dataInicio).toBe('2025-10-06');
    expect(resposta.body.dataFim).toBe('2025-10-12');
    // A comissao entra na folha do mes em que a semana termina.
    expect(resposta.body.competencia).toBe('2025-10');
    expect(resposta.body.lancamentos).toEqual([]);
  });

  it('recusa fechar o periodo antes de haver lancamento', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/fechar`)
      .set('Authorization', auth())
      .send({});
    expect(resposta.status).toBe(422);
    expect(resposta.body.mensagem).toContain('rateie antes de fechar');
  });

  it('rateia entre os colaboradores ATIVOS e fecha o valor distribuivel', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/ratear`)
      .set('Authorization', auth())
      .send({})
      .expect(200);

    // 8000 menos 10% de retencao = 7200 distribuiveis.
    expect(resposta.body.totalDistribuido).toBe(7200);
    const soma = resposta.body.lancamentos.reduce((a: number, l: { valor: number }) => a + l.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(7200);
    // Afastados, em processo e demitidos nao participam do rateio da semana.
    expect(resposta.body.lancamentos.length).toBeLessThan(40);
    expect(resposta.body.lancamentos.length).toBeGreaterThan(0);
  });

  it('permite corrigir a arrecadacao pelo PUT do periodo, sem recriar a semana', async () => {
    const resposta = await request(api.app)
      .put(`/api/comissoes/periodos/${periodoId}`)
      .set('Authorization', auth())
      .send({ valorArrecadado: 10000, percentualRetencao: 0 })
      .expect(200);

    expect(resposta.body.valorArrecadado).toBe(10000);
    expect(resposta.body.percentualRetencao).toBe(0);
    // O PUT nao redistribui sozinho: quem decide quando recalcular e o usuario.
    expect(resposta.body.totalDistribuido).toBe(7200);
  });

  it('redistribui os 10000 quando o usuario manda ratear de novo', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/ratear`)
      .set('Authorization', auth())
      .send({})
      .expect(200);
    expect(resposta.body.totalDistribuido).toBe(10000);
  });

  it('fecha o periodo e recalcula o total pelos lancamentos gravados', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/fechar`)
      .set('Authorization', auth())
      .send({})
      .expect(200);

    expect(resposta.body.status).toBe('FECHADO');
    expect(resposta.body.fechadoEm).toBeTruthy();
    expect(resposta.body.totalDistribuido).toBe(10000);
  });

  it('recusa alterar lancamentos de periodo FECHADO', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/ratear`)
      .set('Authorization', auth())
      .send({});
    expect(resposta.status).toBe(409);
    expect(resposta.body.mensagem).toContain('FECHADO');
  });

  it('gera a remessa PIX da semana e marca o periodo como PAGO', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-10-13', usarPix: true })
      .expect(201);

    remessaId = resposta.body.id;
    expect(resposta.body.origem).toBe('COMISSAO_SEMANAL');
    expect(resposta.body.nomeArquivo).toContain('_PIX.REM');
    expect(resposta.body.valorTotal).toBe(10000);

    const periodo = await request(api.app)
      .get(`/api/comissoes/periodos/${periodoId}`)
      .set('Authorization', auth())
      .expect(200);
    expect(periodo.body.status).toBe('PAGO');
    expect(periodo.body.pagoEm).toBeTruthy();
    expect(periodo.body.dataPagamento).toBe('2025-10-13');
  });

  it('grava o lote como PIX, com a chave de cada favorecido no segmento B', async () => {
    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessaId}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    const linhas = arquivo.text.split('\r\n').filter((l: string) => l.length > 0);
    expect(linhas.every((l: string) => l.length === 240)).toBe(true);
    // Forma de lancamento 45 = PIX no header de lote.
    expect((linhas[1] as string).slice(11, 13)).toBe('45');
    // O seed cadastra todo mundo com chave PIX do tipo CPF (codigo 03).
    const segmentosB = linhas.filter((l: string) => l[7] === '3' && l[13] === 'B');
    expect(segmentosB.every((l: string) => l.slice(14, 16) === '03')).toBe(true);

    const { inspecionarCNAB240 } = await import('@rhmacaw/shared');
    expect(inspecionarCNAB240(arquivo.text).consistente).toBe(true);
  });

  it('recusa reabrir periodo PAGO enquanto a remessa estiver ativa', async () => {
    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/reabrir`)
      .set('Authorization', auth())
      .send({});
    expect(resposta.status).toBe(409);
    expect(resposta.body.mensagem).toContain('Cancele a remessa');
  });

  it('libera a reabertura do periodo PAGO depois da remessa cancelada', async () => {
    await request(api.app)
      .post(`/api/banco/remessas/${remessaId}/status`)
      .set('Authorization', auth())
      .send({ status: 'CANCELADA' })
      .expect(200);

    const resposta = await request(api.app)
      .post(`/api/comissoes/periodos/${periodoId}/reabrir`)
      .set('Authorization', auth())
      .send({})
      .expect(200);

    expect(resposta.body.status).toBe('ABERTO');
    expect(resposta.body.pagoEm).toBeNull();
  });
});

describe('comissao paga na semana e a folha do mes', () => {
  it('entra como adiantamento e sai do liquido a transferir da competencia', async () => {
    const semana = await request(api.app)
      .post('/api/comissoes/periodos')
      .set('Authorization', auth())
      .send({ ano: 2025, semana: 46, valorArrecadado: 4000, percentualRetencao: 0, criterioRateio: 'IGUALITARIO' })
      .expect(201);
    await request(api.app).post(`/api/comissoes/periodos/${semana.body.id}/ratear`).set('Authorization', auth()).send({}).expect(200);
    await request(api.app).post(`/api/comissoes/periodos/${semana.body.id}/fechar`).set('Authorization', auth()).send({}).expect(200);
    await request(api.app)
      .post(`/api/comissoes/periodos/${semana.body.id}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-11-17' })
      .expect(201);
    expect(semana.body.competencia).toBe('2025-11');

    const folha = await request(api.app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-11', tipo: 'MENSAL', dataPagamento: '2025-12-05' })
      .expect(201);

    expect(folha.body.totalComissoesAdiantadas).toBe(4000);
    // Transferir = liquido - comissoes ja pagas na semana, item a item.
    for (const item of folha.body.itens as { salarioLiquido: number; comissoesAdiantadas: number; valorTransferir: number }[]) {
      expect(item.valorTransferir).toBe(Number((item.salarioLiquido - item.comissoesAdiantadas).toFixed(2)));
    }
  });

  it('soma no bruto e permanece no liquido quando a semana ainda nao foi paga', async () => {
    const semana = await request(api.app)
      .post('/api/comissoes/periodos')
      .set('Authorization', auth())
      .send({ ano: 2025, semana: 50, valorArrecadado: 3000, percentualRetencao: 0, criterioRateio: 'IGUALITARIO' })
      .expect(201);
    await request(api.app).post(`/api/comissoes/periodos/${semana.body.id}/ratear`).set('Authorization', auth()).send({}).expect(200);
    expect(semana.body.competencia).toBe('2025-12');

    const folha = await request(api.app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-12', tipo: 'MENSAL', dataPagamento: '2026-01-05' })
      .expect(201);

    // Nada foi adiantado: o valor sai junto com a folha.
    expect(folha.body.totalComissoesAdiantadas).toBe(0);
    const comComissao = (folha.body.itens as { comissoes: number; valorTransferir: number; salarioLiquido: number }[]).filter(
      (i) => i.comissoes > 0,
    );
    expect(comComissao.length).toBeGreaterThan(0);
    expect(comComissao.every((i) => i.valorTransferir === i.salarioLiquido)).toBe(true);
  });
});
