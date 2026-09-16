/**
 * Caminho completo da folha mensal: seed -> processar -> fechar -> remessa ->
 * baixar arquivo -> confirmar no banco.
 *
 * Confere tambem que o arquivo baixado fecha: a soma dos segmentos A tem de
 * bater com o trailer de lote e com o total gravado na remessa.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPETENCIA, bearer, encerrarAmbiente, prepararAmbiente, type Ambiente } from './apoio.js';

let api: Ambiente;
let folhaId: string;
let remessaId: string;
const auth = () => bearer(api.token);

beforeAll(async () => {
  api = await prepararAmbiente();
});

afterAll(encerrarAmbiente);

describe('folha da competencia do seed ate o banco', () => {
  it('processa a competencia em rascunho com todos os colaboradores vinculados', async () => {
    const resposta = await request(api.app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: COMPETENCIA, tipo: 'MENSAL', dataPagamento: '2025-09-05' })
      .expect(201);

    folhaId = resposta.body.id;
    expect(resposta.body.status).toBe('RASCUNHO');
    expect(resposta.body.quantidadeColaboradores).toBe(40);
    expect(resposta.body.itens).toHaveLength(40);
  });

  it('fecha os totais do cabecalho como a soma dos itens', async () => {
    const folha = await request(api.app).get(`/api/folhas/${folhaId}`).set('Authorization', auth()).expect(200);
    const itens = folha.body.itens as { totalProventos: number; valorTransferir: number; salarioLiquido: number }[];
    const soma = (campo: 'totalProventos' | 'valorTransferir' | 'salarioLiquido') =>
      Number(itens.reduce((a, i) => a + i[campo], 0).toFixed(2));

    expect(folha.body.totalProventos).toBe(soma('totalProventos'));
    expect(folha.body.totalLiquido).toBe(soma('salarioLiquido'));
    expect(folha.body.totalTransferir).toBe(soma('valorTransferir'));
  });

  it('fecha a folha do seed sem pendencia, porque nenhum item tem alerta critico', async () => {
    const resposta = await request(api.app)
      .post(`/api/folhas/${folhaId}/fechar`)
      .set('Authorization', auth())
      .send({ reconhecerAlertas: false })
      .expect(200);
    expect(resposta.body.status).toBe('FECHADA');
    expect(resposta.body.itens.every((i: { alertas: string[] }) => i.alertas.length === 0)).toBe(true);
  });

  it('gera a remessa CNAB com um pagamento por colaborador', async () => {
    const resposta = await request(api.app)
      .post(`/api/folhas/${folhaId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-09-05' })
      .expect(201);

    remessaId = resposta.body.id;
    expect(resposta.body.status).toBe('GERADA');
    expect(resposta.body.origem).toBe('FOLHA');
    expect(resposta.body.quantidadePagamentos).toBe(40);
    expect(resposta.body.inconsistencias).toEqual([]);
  });

  it('marca a folha como PAGA ao gerar a remessa', async () => {
    const folha = await request(api.app).get(`/api/folhas/${folhaId}`).set('Authorization', auth()).expect(200);
    expect(folha.body.status).toBe('PAGA');
    expect(folha.body.pagoEm).toBeTruthy();
  });

  it('baixa o arquivo como anexo de texto com o nome da remessa', async () => {
    const remessa = await request(api.app).get(`/api/banco/remessas/${remessaId}`).set('Authorization', auth()).expect(200);
    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessaId}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    expect(arquivo.headers['content-type']).toContain('text/plain');
    expect(arquivo.headers['content-disposition']).toBe(`attachment; filename="${remessa.body.nomeArquivo}"`);
  });

  it('entrega 84 linhas de 240 caracteres para os 40 pagamentos', async () => {
    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessaId}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    const linhas = arquivo.text.split('\r\n').filter((l: string) => l.length > 0);
    // header + header de lote + 40x(A+B) + trailer de lote + trailer de arquivo.
    expect(linhas).toHaveLength(84);
    expect(linhas.every((l: string) => l.length === 240)).toBe(true);
  });

  it('fecha a soma dos segmentos A com o trailer de lote e com o total da remessa', async () => {
    const remessa = await request(api.app).get(`/api/banco/remessas/${remessaId}`).set('Authorization', auth()).expect(200);
    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessaId}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    const { inspecionarCNAB240 } = await import('@rhmacaw/shared');
    const inspecao = inspecionarCNAB240(arquivo.text);

    expect(inspecao.pagamentos).toHaveLength(40);
    expect(inspecao.totalCalculado).toBe(inspecao.totalDeclarado);
    expect(inspecao.totalDeclarado).toBe(remessa.body.valorTotal);
    // O resumo devolvido junto do recurso confere com a leitura do arquivo.
    expect(remessa.body.resumo.consistente).toBe(true);
    expect(remessa.body.resumo.totalCalculado).toBe(inspecao.totalCalculado);
  });

  it('paga apenas o liquido descontando as comissoes ja adiantadas na semana', async () => {
    const folha = await request(api.app).get(`/api/folhas/${folhaId}`).set('Authorization', auth()).expect(200);
    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessaId}/arquivo`)
      .set('Authorization', auth())
      .expect(200);

    const { inspecionarCNAB240 } = await import('@rhmacaw/shared');
    const pagos = inspecionarCNAB240(arquivo.text).pagamentos;
    const positivos = (folha.body.itens as { valorTransferir: number }[]).filter((i) => i.valorTransferir > 0);
    const esperado = Number(positivos.reduce((a, i) => a + i.valorTransferir, 0).toFixed(2));

    expect(Number(pagos.reduce((a, p) => a + p.valor, 0).toFixed(2))).toBe(esperado);
    // A folha e maior que a remessa exatamente pelo que foi adiantado na semana.
    expect(folha.body.totalComissoesAdiantadas).toBeGreaterThan(0);
  });

  it('avanca a remessa de GERADA para ENVIADA e depois CONFIRMADA', async () => {
    const enviada = await request(api.app)
      .post(`/api/banco/remessas/${remessaId}/status`)
      .set('Authorization', auth())
      .send({ status: 'ENVIADA' })
      .expect(200);
    expect(enviada.body.status).toBe('ENVIADA');
    expect(enviada.body.enviadoEm).toBeTruthy();

    const confirmada = await request(api.app)
      .post(`/api/banco/remessas/${remessaId}/status`)
      .set('Authorization', auth())
      .send({ status: 'CONFIRMADA' })
      .expect(200);
    expect(confirmada.body.status).toBe('CONFIRMADA');
    expect(confirmada.body.confirmadoEm).toBeTruthy();
  });

  it('recusa qualquer transicao a partir de CONFIRMADA', async () => {
    const resposta = await request(api.app)
      .post(`/api/banco/remessas/${remessaId}/status`)
      .set('Authorization', auth())
      .send({ status: 'CANCELADA' });
    expect(resposta.status).toBe(409);
    expect(resposta.body.mensagem).toContain('CONFIRMADA -> CANCELADA');
  });

  it('nao aceita pular de GERADA direto para CONFIRMADA', async () => {
    const nova = await request(api.app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-09', tipo: 'MENSAL', dataPagamento: '2025-10-05' })
      .expect(201);
    await request(api.app)
      .post(`/api/folhas/${nova.body.id}/fechar`)
      .set('Authorization', auth())
      .send({ reconhecerAlertas: true })
      .expect(200);
    const remessa = await request(api.app)
      .post(`/api/folhas/${nova.body.id}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-10-05' })
      .expect(201);

    const resposta = await request(api.app)
      .post(`/api/banco/remessas/${remessa.body.id}/status`)
      .set('Authorization', auth())
      .send({ status: 'CONFIRMADA' });
    expect(resposta.status).toBe(409);
  });
});

describe('exportacao da folha', () => {
  it('exporta a folha em JSON com os itens completos', async () => {
    const resposta = await request(api.app)
      .get(`/api/folhas/${folhaId}/exportar?formato=json`)
      .set('Authorization', auth())
      .expect(200);

    expect(resposta.headers['content-type']).toContain('application/json');
    expect(resposta.headers['content-disposition']).toContain(`folha_${COMPETENCIA}_mensal.json`);

    const conteudo = JSON.parse(resposta.text);
    expect(conteudo.competencia).toBe(COMPETENCIA);
    expect(conteudo.itens).toHaveLength(40);
    expect(conteudo.itens[0]).toHaveProperty('verbas');
  });

  it('exporta em CSV quando o formato nao e informado', async () => {
    const resposta = await request(api.app)
      .get(`/api/folhas/${folhaId}/exportar`)
      .set('Authorization', auth())
      .expect(200);

    expect(resposta.headers['content-type']).toContain('text/csv');
    // Cabecalho mais uma linha por colaborador.
    expect(resposta.text.trim().split('\n').length).toBeGreaterThanOrEqual(41);
  });

  it('devolve 404 ao exportar folha inexistente', async () => {
    await request(api.app)
      .get('/api/folhas/flh_nao_existe/exportar?formato=json')
      .set('Authorization', auth())
      .expect(404);
  });
});

describe('item com valor a transferir negativo (regra 5 do contrato)', () => {
  let folhaNegativaId: string;
  let colaboradorId: string;

  it('trava o fechamento quando um adiantamento deixa o liquido negativo', async () => {
    const nova = await request(api.app)
      .post('/api/folhas/processar')
      .set('Authorization', auth())
      .send({ competencia: '2025-10', tipo: 'MENSAL', dataPagamento: '2025-11-05' })
      .expect(201);
    folhaNegativaId = nova.body.id;
    colaboradorId = nova.body.itens[0].colaboradorId;

    // Adiantamento maior que o bruto do mes: o contracheque fecha devendo.
    const item = await request(api.app)
      .put(`/api/folhas/${folhaNegativaId}/itens/${colaboradorId}`)
      .set('Authorization', auth())
      .send({ adiantamento: 99000 })
      .expect(200);

    expect(item.body.salarioLiquido).toBeLessThan(0);
    expect(item.body.valorTransferir).toBeLessThan(0);
    expect(item.body.alertas.length).toBeGreaterThan(0);

    const fechar = await request(api.app)
      .post(`/api/folhas/${folhaNegativaId}/fechar`)
      .set('Authorization', auth())
      .send({ reconhecerAlertas: false });
    expect(fechar.status).toBe(409);
    expect(fechar.body.mensagem).toContain('alerta critico nao reconhecido');
  });

  it('deixa o item negativo fora do arquivo e o registra em inconsistencias', async () => {
    await request(api.app)
      .post(`/api/folhas/${folhaNegativaId}/fechar`)
      .set('Authorization', auth())
      .send({ reconhecerAlertas: true })
      .expect(200);

    const folha = await request(api.app)
      .get(`/api/folhas/${folhaNegativaId}`)
      .set('Authorization', auth())
      .expect(200);
    const aPagar = (folha.body.itens as { valorTransferir: number }[]).filter((i) => i.valorTransferir > 0);
    // Alem do item negativo, o intermitente sem horas lancadas fecha em zero:
    // os dois ficam de fora do arquivo, e nenhum deles vira linha no banco.
    expect(aPagar).toHaveLength(38);

    const remessa = await request(api.app)
      .post(`/api/folhas/${folhaNegativaId}/remessa`)
      .set('Authorization', auth())
      .send({ layout: 'CNAB240', bancoCodigo: '341', dataPagamento: '2025-11-05' })
      .expect(201);

    expect(remessa.body.quantidadePagamentos).toBe(38);
    expect(remessa.body.inconsistencias).toHaveLength(2);
    expect(remessa.body.inconsistencias.every((i: string) => i.includes('fora da remessa'))).toBe(true);

    const arquivo = await request(api.app)
      .get(`/api/banco/remessas/${remessa.body.id}/arquivo`)
      .set('Authorization', auth())
      .expect(200);
    const { inspecionarCNAB240 } = await import('@rhmacaw/shared');
    const inspecao = inspecionarCNAB240(arquivo.text);
    expect(inspecao.pagamentos).toHaveLength(38);
    expect(inspecao.pagamentos.every((p) => p.valor > 0)).toBe(true);
    expect(inspecao.consistente).toBe(true);
  });
});
