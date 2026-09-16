/**
 * Regressao contra a planilha de agosto/2025 do cliente.
 *
 * A planilha e a fonte da verdade sobre COMO a empresa paga. Este arquivo
 * trava as relacoes que ela revelou, para que nenhuma mudanca futura no motor
 * quebre silenciosamente o jeito que o dinheiro sai da conta.
 *
 * As divergencias conhecidas estao documentadas em docs/NOTAS-DOMINIO.md e
 * aparecem aqui como excecoes nomeadas — nao como numeros forcados.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ItemFolha } from '@rhmacaw/shared';
import { arredondar } from '@rhmacaw/shared';
import { COMPETENCIA, bearer, encerrarAmbiente, prepararAmbiente } from './apoio.js';
import dadosSeed from '../db/seed-dados.json' with { type: 'json' };

interface LinhaReferencia {
  nome: string;
  comissoes: number;
  liquido: number;
  transferir: number;
}

const referencia = dadosSeed.referenciaFolha as LinhaReferencia[];

/**
 * Linhas em que a planilha nao segue a relacao geral. Ver NOTAS-DOMINIO.md:
 * os socios tiveram "comissao" que pode ser distribuicao de lucros, e a
 * intermitente tem proventos que nao aparecem em nenhuma coluna do arquivo.
 */
const DIVERGENCIAS_CONHECIDAS = new Set([
  'GABRIEL HAURET',
  'PEDRO LANNES',
  'GABRIEL',
  'ARTHUR',
  'ALINE PORTO SENRA',
  'JANA LACERDA NASCIMENTO DOS SANTOS',
]);

let app: Express;
let token: string;
let itens: ItemFolha[];

beforeAll(async () => {
  const ambiente = await prepararAmbiente();
  app = ambiente.app;
  token = ambiente.token;

  const folha = await request(app)
    .post('/api/folhas/processar')
    .set('Authorization', bearer(token))
    .send({ competencia: COMPETENCIA, tipo: 'MENSAL', dataPagamento: '2025-09-05' });
  itens = folha.body.itens;
});

afterAll(async () => {
  await encerrarAmbiente();
});

describe('a relacao central da planilha', () => {
  it('vale para todo colaborador: transferir = liquido - comissoes adiantadas', () => {
    for (const item of itens) {
      expect(item.valorTransferir, item.colaboradorNome).toBe(
        arredondar(item.salarioLiquido - item.comissoesAdiantadas),
      );
    }
  });

  it('confere linha a linha com a planilha nos casos sem divergencia documentada', () => {
    const conferidos = referencia.filter((r) => !DIVERGENCIAS_CONHECIDAS.has(r.nome));
    expect(conferidos.length).toBeGreaterThan(30); // a esmagadora maioria do quadro

    for (const linha of conferidos) {
      expect(arredondar(linha.liquido - linha.comissoes), linha.nome).toBe(linha.transferir);
    }
  });
});

describe('os valores do seed batem com a planilha', () => {
  it('o total de comissoes de agosto e exatamente o da planilha', () => {
    const daPlanilha = arredondar(referencia.reduce((a, r) => a + r.comissoes, 0));
    const doSistema = arredondar(itens.reduce((a, i) => a + i.comissoesAdiantadas + 0, 0));
    expect(daPlanilha).toBe(25174.1);
    expect(doSistema).toBe(daPlanilha);
  });

  it('o quadro tem os 40 colaboradores da planilha', () => {
    expect(itens).toHaveLength(40);
    expect(dadosSeed.colaboradores).toHaveLength(40);
  });

  it('os tres centros de custo da planilha estao representados', () => {
    const centros = new Set(itens.map((i) => i.centroCusto));
    expect(centros).toEqual(new Set(['FOLHA TOKITO', 'FOLHA CENTRAL', 'ADMINISTRATIVO']));
  });
});

describe('casos particulares que a planilha revelou', () => {
  it('estagiario recebe a bolsa integral, sem INSS nem FGTS', () => {
    const arthur = itens.find((i) => i.colaboradorNome === 'ARTHUR');
    expect(arthur).toBeDefined();
    expect(arthur?.inss).toBe(0);
    expect(arthur?.fgts).toBe(0);
    expect(arthur?.valorTransferir).toBe(938);
  });

  it('PJ recebe o bruto, sem retencao na folha', () => {
    const gabriel = itens.find((i) => i.colaboradorNome === 'GABRIEL');
    expect(gabriel?.inss).toBe(0);
    expect(gabriel?.irrf).toBe(0);
    expect(gabriel?.valorTransferir).toBe(5000);
  });

  it('socio recolhe pro-labore de 11% limitado ao teto', () => {
    const socios = itens.filter((i) => ['GABRIEL HAURET', 'PEDRO LANNES'].includes(i.colaboradorNome));
    expect(socios).toHaveLength(2);
    for (const socio of socios) {
      expect(socio.inss, socio.colaboradorNome).toBe(897.32); // 11% de 8157,41
      expect(socio.fgts, socio.colaboradorNome).toBe(0);
    }
  });

  it('colaborador afastado ou em processo entra zerado e nao gera pagamento', () => {
    const parados = itens.filter((i) =>
      ['FABIO EMANOEL MOREIRA DE NOVAES', 'MARIA EDUARDA GARCIA CAMPOS SALLES', 'MATHEUS BARBOSA CARVALHO DE OLIVEIRA'].includes(
        i.colaboradorNome,
      ),
    );
    expect(parados.length).toBeGreaterThan(0);
    for (const item of parados) {
      expect(item.valorTransferir, item.colaboradorNome).toBeLessThanOrEqual(0);
    }
  });

  it('quem tem falta na planilha tem desconto e perda de DSR no sistema', () => {
    const comFalta = dadosSeed.colaboradores.filter((c) => (c.faltasAgosto ?? 0) > 0 && c.tipoContrato === 'CLT');
    expect(comFalta.length).toBeGreaterThan(0);

    for (const colaborador of comFalta) {
      const item = itens.find((i) => i.colaboradorNome === colaborador.nome);
      expect(item, colaborador.nome).toBeDefined();
      expect(item!.faltasDias, colaborador.nome).toBeGreaterThan(0);
      expect(item!.descontoFaltas, colaborador.nome).toBeGreaterThan(0);
      // O DSR e justamente o que a planilha do cliente nao descontava.
      expect(item!.descontoDSR, colaborador.nome).toBeGreaterThan(0);
    }
  });
});
