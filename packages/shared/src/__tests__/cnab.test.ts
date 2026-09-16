/**
 * Remessa CNAB 240: posicionamento fixo em todos os bancos suportados, ida e
 * volta pelo leitor, isolamento de favorecido invalido e recusa do lote PIX
 * onde o banco nao o aceita.
 *
 * `geradoEm` e sempre fixo: o header carrega data e hora de geracao, e sem
 * isso o arquivo mudaria a cada execucao.
 */
import { describe, expect, it } from 'vitest';
import { BANCOS, bancoPorCodigo, listarBancos } from '../bank/bancos.js';
import { gerarCNAB240, inspecionarCNAB240, validarFavorecidos } from '../bank/cnab.js';
import type { ContaPagadora, FavorecidoRemessa } from '../domain/tipos.js';

const GERADO_EM = new Date('2025-09-01T10:30:00Z');

const pagador: ContaPagadora = {
  bancoCodigo: '341',
  bancoNome: 'ITAU UNIBANCO S.A.',
  agencia: '04521',
  agenciaDigito: '2',
  conta: '000000318742',
  contaDigito: '6',
  convenio: '1234567',
  nomeEmpresa: 'MACAW RESTAURANTE LTDA',
  cnpj: '11222333000181',
};

const favorecido = (extra: Partial<FavorecidoRemessa> = {}): FavorecidoRemessa => ({
  colaboradorId: 'c1',
  nome: 'ALEPH SOUZA CORDOVIL',
  cpf: '11144477735',
  bancoCodigo: '341',
  agencia: '04321',
  agenciaDigito: '1',
  conta: '000000112233',
  contaDigito: '4',
  tipoConta: 'CORRENTE',
  valor: 1219.26,
  referencia: 'FOLHA202508',
  ...extra,
});

const gerar = (extra: Partial<Parameters<typeof gerarCNAB240>[0]> = {}) =>
  gerarCNAB240({
    pagador,
    favorecidos: [favorecido()],
    dataPagamento: '2025-09-05',
    numeroRemessa: 1,
    geradoEm: GERADO_EM,
    ...extra,
  });

describe('largura fixa de 240 caracteres', () => {
  it('gera todas as linhas com 240 caracteres em cada um dos 10 bancos suportados', () => {
    const codigos = Object.keys(BANCOS);
    expect(codigos).toHaveLength(10);

    for (const codigo of codigos) {
      const resultado = gerarCNAB240({
        pagador: { ...pagador, bancoCodigo: codigo },
        favorecidos: [favorecido(), favorecido({ colaboradorId: 'c2', nome: 'MARIA DE SOUZA', valor: 987.65 })],
        dataPagamento: '2025-09-05',
        numeroRemessa: 7,
        geradoEm: GERADO_EM,
      });
      const foraDoPadrao = resultado.linhas.filter((l) => l.length !== 240);
      expect({ codigo, foraDoPadrao }).toEqual({ codigo, foraDoPadrao: [] });
    }
  });

  it('grava a versao de layout que cada banco declara no header de arquivo', () => {
    for (const banco of listarBancos()) {
      const linhas = gerarCNAB240({
        pagador: { ...pagador, bancoCodigo: banco.codigo },
        favorecidos: [favorecido()],
        dataPagamento: '2025-09-05',
        numeroRemessa: 1,
        geradoEm: GERADO_EM,
      }).linhas;
      expect(linhas[0]?.slice(163, 166)).toBe(banco.versaoArquivo);
      expect(linhas[1]?.slice(13, 16)).toBe(banco.versaoLote);
    }
  });

  it('monta o arquivo com header, lote, par A+B por favorecido e os dois trailers', () => {
    const resultado = gerar({
      favorecidos: [favorecido(), favorecido({ colaboradorId: 'c2', nome: 'MARIA', valor: 500 })],
    });
    // 1 header de arquivo + 1 header de lote + 2x(A+B) + trailer de lote + trailer de arquivo.
    expect(resultado.linhas).toHaveLength(8);
    expect(resultado.linhas.map((l) => l[7])).toEqual(['0', '1', '3', '3', '3', '3', '5', '9']);
    expect(resultado.linhas.filter((l) => l[13] === 'A')).toHaveLength(2);
    expect(resultado.linhas.filter((l) => l[13] === 'B')).toHaveLength(2);
  });

  it('separa as linhas com CRLF, como os validadores dos bancos exigem', () => {
    const resultado = gerar();
    expect(resultado.conteudo.endsWith('\r\n')).toBe(true);
    expect(resultado.conteudo.split('\r\n').filter((l) => l.length > 0)).toHaveLength(resultado.linhas.length);
  });

  it('e deterministico: a mesma entrada gera byte a byte o mesmo arquivo', () => {
    expect(gerar().conteudo).toBe(gerar().conteudo);
  });
});

describe('ida e volta pelo inspecionarCNAB240', () => {
  it('reconstroi nome, valor e dados bancarios de cada pagamento', () => {
    const resultado = gerar({
      favorecidos: [
        favorecido({ valor: 1219.26 }),
        favorecido({ colaboradorId: 'c2', nome: 'MARIA DE SOUZA', valor: 3456.78, bancoCodigo: '237' }),
      ],
    });
    const inspecao = inspecionarCNAB240(resultado.conteudo);

    expect(inspecao.banco).toBe('341');
    expect(inspecao.linhas).toBe(8);
    expect(inspecao.pagamentos.map((p) => p.nome)).toEqual(['ALEPH SOUZA CORDOVIL', 'MARIA DE SOUZA']);
    expect(inspecao.pagamentos.map((p) => p.valor)).toEqual([1219.26, 3456.78]);
    expect(inspecao.pagamentos.map((p) => p.banco)).toEqual(['341', '237']);
    expect(inspecao.pagamentos[0]?.agencia).toBe('04321');
    expect(inspecao.pagamentos[0]?.conta).toBe('000000112233');
    expect(inspecao.pagamentos[0]?.data).toBe('05/09/2025');
  });

  it('fecha o total dos segmentos A com o declarado no trailer de lote', () => {
    const valores = [1219.26, 3456.78, 987.65, 0.01, 12345.67];
    const resultado = gerar({
      favorecidos: valores.map((valor, i) => favorecido({ colaboradorId: `c${i}`, nome: `FAVORECIDO ${i}`, valor })),
    });
    const inspecao = inspecionarCNAB240(resultado.conteudo);

    expect(inspecao.totalCalculado).toBe(18009.37);
    expect(inspecao.totalDeclarado).toBe(18009.37);
    expect(inspecao.consistente).toBe(true);
    expect(resultado.valorTotal).toBe(18009.37);
  });

  it('remove acento e caractere especial do nome sem mudar a largura do campo', () => {
    const resultado = gerar({ favorecidos: [favorecido({ nome: 'JOÃO DA CONCEIÇÃO & CIA' })] });
    const inspecao = inspecionarCNAB240(resultado.conteudo);
    expect(inspecao.pagamentos[0]?.nome).toBe('JOAO DA CONCEICAO   CIA');
    expect(resultado.linhas.every((l) => l.length === 240)).toBe(true);
  });

  it('trunca o nome longo em 30 posicoes em vez de estourar a linha', () => {
    const resultado = gerar({
      favorecidos: [favorecido({ nome: 'MARIA APARECIDA DA CONCEICAO SOUZA OLIVEIRA' })],
    });
    expect(inspecionarCNAB240(resultado.conteudo).pagamentos[0]?.nome).toBe('MARIA APARECIDA DA CONCEICAO S');
  });
});

describe('validacao dos favorecidos', () => {
  it('reprova CPF invalido, valor nao positivo e dados bancarios ausentes', () => {
    const [semCpf, semValor, semConta] = validarFavorecidos(
      [
        favorecido({ cpf: '123' }),
        favorecido({ valor: 0 }),
        favorecido({ agencia: '', conta: '' }),
      ],
      false,
    );
    expect(semCpf?.erros).toContain('CPF invalido ou ausente');
    expect(semValor?.erros).toContain('valor nao positivo (0.00)');
    expect(semConta?.erros).toEqual(['agencia ausente', 'conta ausente']);
  });

  it('exige chave PIX quando o lote e PIX, e nao conta corrente', () => {
    const [comConta] = validarFavorecidos([favorecido({ chavePix: null, tipoPix: null })], true);
    expect(comConta?.erros).toEqual(['chave PIX ausente', 'tipo de chave PIX ausente']);
  });

  it('isola o favorecido invalido e paga os demais em vez de derrubar o lote', () => {
    const resultado = gerar({
      favorecidos: [
        favorecido({ colaboradorId: 'ok1', nome: 'VALIDO UM', valor: 100 }),
        favorecido({ colaboradorId: 'ruim', nome: 'SEM CONTA', agencia: '', conta: '', valor: 50 }),
        favorecido({ colaboradorId: 'ok2', nome: 'VALIDO DOIS', valor: 200 }),
      ],
    });
    expect(resultado.quantidadePagamentos).toBe(2);
    expect(resultado.valorTotal).toBe(300);
    expect(resultado.inconsistencias).toEqual(['SEM CONTA: agencia ausente; conta ausente']);
    expect(inspecionarCNAB240(resultado.conteudo).pagamentos.map((p) => p.nome)).toEqual([
      'VALIDO UM',
      'VALIDO DOIS',
    ]);
  });

  it('recusa gerar arquivo quando nenhum favorecido e valido', () => {
    expect(() => gerar({ favorecidos: [favorecido({ valor: -10 })] })).toThrowError(/Nenhum favorecido valido/);
  });

  it('nunca inclui valor negativo no arquivo (regra 5 do contrato)', () => {
    const resultado = gerar({
      favorecidos: [favorecido({ colaboradorId: 'ok', nome: 'POSITIVO', valor: 100 }), favorecido({ colaboradorId: 'neg', nome: 'NEGATIVO', valor: -205.78 })],
    });
    expect(inspecionarCNAB240(resultado.conteudo).pagamentos.map((p) => p.nome)).toEqual(['POSITIVO']);
    expect(resultado.inconsistencias[0]).toContain('valor nao positivo (-205.78)');
  });
});

describe('lote PIX', () => {
  it('usa a forma de lancamento 45 e grava o tipo da chave no segmento B', () => {
    const resultado = gerar({
      usarPix: true,
      favorecidos: [favorecido({ tipoPix: 'CPF', chavePix: '11144477735' })],
    });
    const headerLote = resultado.linhas[1] as string;
    const segmentoB = resultado.linhas[3] as string;
    expect(headerLote.slice(11, 13)).toBe('45');
    expect(segmentoB.slice(14, 16)).toBe('03'); // 03 = CPF/CNPJ
    expect(resultado.nomeArquivo).toContain('_PIX.REM');
  });

  it('codifica cada tipo de chave PIX com o proprio codigo', () => {
    const codigos = (['TELEFONE', 'EMAIL', 'CPF', 'ALEATORIA'] as const).map((tipoPix) => {
      const resultado = gerar({ usarPix: true, favorecidos: [favorecido({ tipoPix, chavePix: 'chave' })] });
      return (resultado.linhas[3] as string).slice(14, 16);
    });
    expect(codigos).toEqual(['01', '02', '03', '04']);
  });

  it('zera a camara centralizadora no PIX, que nao passa por TED', () => {
    const pix = gerar({ usarPix: true, favorecidos: [favorecido({ bancoCodigo: '237', tipoPix: 'CPF', chavePix: '11144477735' })] });
    const ted = gerar({ favorecidos: [favorecido({ bancoCodigo: '237' })] });
    expect((pix.linhas[2] as string).slice(17, 20)).toBe('000');
    expect((ted.linhas[2] as string).slice(17, 20)).toBe('018');
  });

  it('recusa o lote PIX no banco que nao o aceita, dizendo qual e o banco', () => {
    expect(bancoPorCodigo('104')?.suportaPix).toBe(false);
    expect(() =>
      gerar({
        pagador: { ...pagador, bancoCodigo: '104' },
        usarPix: true,
        favorecidos: [favorecido({ tipoPix: 'CPF', chavePix: '11144477735' })],
      }),
    ).toThrowError(/CAIXA ECONOMICA FEDERAL nao aceita lote PIX/);
  });

  it('gera normalmente em conta corrente no mesmo banco que recusa PIX', () => {
    const resultado = gerar({ pagador: { ...pagador, bancoCodigo: '104' } });
    expect(resultado.linhas.every((l) => l.length === 240)).toBe(true);
    expect((resultado.linhas[1] as string).slice(11, 13)).toBe('01');
  });

  it('recusa banco fora do catalogo suportado', () => {
    expect(() => gerar({ pagador: { ...pagador, bancoCodigo: '999' } })).toThrowError(/nao suportado/);
  });
});

describe('nome do arquivo de remessa', () => {
  it('carrega banco, data de pagamento, NSA e a forma de pagamento', () => {
    expect(gerar({ numeroRemessa: 42 }).nomeArquivo).toBe('REM341_20250905_00042_CC.REM');
  });
});
