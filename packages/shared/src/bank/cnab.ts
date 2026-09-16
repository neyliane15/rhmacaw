/**
 * Gerador de remessa CNAB 240 (padrao FEBRABAN) para pagamento de salarios,
 * comissoes e rescisoes.
 *
 * Estrutura do arquivo:
 *   0 - Header de Arquivo
 *   1 - Header de Lote
 *   3 - Detalhe Segmento A (credito em conta) [+ Segmento B com dados do favorecido]
 *   5 - Trailer de Lote
 *   9 - Trailer de Arquivo
 *
 * Toda linha tem exatamente 240 caracteres. O arquivo usa CRLF, exigido pelos
 * validadores dos bancos.
 */
import { paraCentavos } from '../util/money.js';
import { formatarDataBR, type DataISO } from '../util/datas.js';
import { somenteDigitos } from '../util/documentos.js';
import type { ContaPagadora, FavorecidoRemessa, TipoConta } from '../domain/tipos.js';
import { bancoPorCodigo, FORMA_LANCAMENTO, TIPO_SERVICO, type BancoSuportado } from './bancos.js';

const TAMANHO_LINHA = 240;
const QUEBRA = '\r\n';

/* ------------------------------------------------------------------ *
 * Primitivas de campo
 * ------------------------------------------------------------------ */

/** Remove acentos e caracteres que os bancos rejeitam no arquivo posicional. */
export function normalizarTexto(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/]/g, ' ')
    .toUpperCase();
}

/** Campo alfanumerico: alinhado a esquerda, completado com espacos. */
export function alfa(valor: string | null | undefined, tamanho: number): string {
  return normalizarTexto(valor ?? '').slice(0, tamanho).padEnd(tamanho, ' ');
}

/** Campo numerico: alinhado a direita, completado com zeros. */
export function num(valor: string | number | null | undefined, tamanho: number): string {
  const texto = typeof valor === 'number' ? String(Math.trunc(Math.abs(valor))) : somenteDigitos(String(valor ?? ''));
  return texto.slice(-tamanho).padStart(tamanho, '0');
}

/** Valor monetario em centavos, sem separador (2 decimais implicitos). */
export function valor(reais: number, tamanho: number): string {
  return num(paraCentavos(reais), tamanho);
}

/** Data no formato DDMMAAAA exigido pelo CNAB. */
export function dataCNAB(iso: DataISO): string {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

export function horaCNAB(data = new Date()): string {
  return `${String(data.getHours()).padStart(2, '0')}${String(data.getMinutes()).padStart(2, '0')}${String(data.getSeconds()).padStart(2, '0')}`;
}

function tipoInscricao(documento: string): string {
  return somenteDigitos(documento).length > 11 ? '2' : '1';
}

/** Codigo do tipo de conta no segmento A (poupanca usa forma de lancamento propria). */
function formaPorTipoConta(tipo: TipoConta, usarPix: boolean): string {
  if (usarPix) return FORMA_LANCAMENTO.PIX_TRANSFERENCIA;
  return tipo === 'POUPANCA' ? FORMA_LANCAMENTO.CREDITO_POUPANCA : FORMA_LANCAMENTO.CREDITO_CONTA_CORRENTE;
}

/* ------------------------------------------------------------------ *
 * Validacao previa
 * ------------------------------------------------------------------ */

export interface ValidacaoFavorecido {
  favorecido: FavorecidoRemessa;
  erros: string[];
}

/**
 * Valida os favorecidos antes de montar o arquivo. Um unico registro invalido
 * faz o banco rejeitar o lote inteiro, entao o sistema separa os problemas
 * antes de gerar.
 */
export function validarFavorecidos(favorecidos: FavorecidoRemessa[], usarPix: boolean): ValidacaoFavorecido[] {
  return favorecidos.map((favorecido) => {
    const erros: string[] = [];
    if (!favorecido.nome?.trim()) erros.push('nome do favorecido vazio');
    if (somenteDigitos(favorecido.cpf).length !== 11) erros.push('CPF invalido ou ausente');
    if (favorecido.valor <= 0) erros.push(`valor nao positivo (${favorecido.valor.toFixed(2)})`);

    if (usarPix) {
      if (!favorecido.chavePix?.trim()) erros.push('chave PIX ausente');
      if (!favorecido.tipoPix) erros.push('tipo de chave PIX ausente');
    } else {
      if (somenteDigitos(favorecido.bancoCodigo).length !== 3) erros.push('codigo do banco invalido');
      if (!somenteDigitos(favorecido.agencia)) erros.push('agencia ausente');
      if (!somenteDigitos(favorecido.conta)) erros.push('conta ausente');
    }
    return { favorecido, erros };
  });
}

/* ------------------------------------------------------------------ *
 * Montagem dos registros
 * ------------------------------------------------------------------ */

export interface OpcoesRemessa {
  pagador: ContaPagadora;
  favorecidos: FavorecidoRemessa[];
  dataPagamento: DataISO;
  /** Numero sequencial do arquivo no banco (NSA). */
  numeroRemessa: number;
  /** Texto que aparece no extrato do colaborador. */
  historico?: string;
  tipoServico?: string;
  /** Usa lote PIX (forma 45) em vez de credito em conta. */
  usarPix?: boolean;
  /** Fixa a data/hora de geracao — usado nos testes para saida deterministica. */
  geradoEm?: Date;
}

export interface ResultadoRemessa {
  conteudo: string;
  nomeArquivo: string;
  quantidadePagamentos: number;
  valorTotal: number;
  /** Favorecidos que ficaram de fora e o motivo. */
  inconsistencias: string[];
  /** Linhas do arquivo, uteis para inspecao e testes. */
  linhas: string[];
}

function headerArquivo(pagador: ContaPagadora, banco: BancoSuportado, numeroRemessa: number, geradoEm: Date): string {
  const doc = somenteDigitos(pagador.cnpj);
  return (
    num(banco.codigo, 3) +                       // 001-003 banco
    '0000' +                                     // 004-007 lote
    '0' +                                        // 008     tipo de registro
    ' '.repeat(9) +                              // 009-017 uso FEBRABAN
    tipoInscricao(doc) +                         // 018     tipo de inscricao
    num(doc, 14) +                               // 019-032 numero de inscricao
    alfa(pagador.convenio, 20) +                 // 033-052 convenio
    num(pagador.agencia, 5) +                    // 053-057 agencia
    alfa(pagador.agenciaDigito, 1) +             // 058     dv agencia
    num(pagador.conta, 12) +                     // 059-070 conta
    alfa(pagador.contaDigito, 1) +               // 071     dv conta
    ' ' +                                        // 072     dv ag/conta
    alfa(pagador.nomeEmpresa, 30) +              // 073-102 nome da empresa
    alfa(banco.nome, 30) +                       // 103-132 nome do banco
    ' '.repeat(10) +                             // 133-142 uso FEBRABAN
    '1' +                                        // 143     1 = remessa
    dataCNAB(geradoEm.toISOString().slice(0, 10)) + // 144-151 data de geracao
    horaCNAB(geradoEm) +                         // 152-157 hora de geracao
    num(numeroRemessa, 6) +                      // 158-163 NSA
    num(banco.versaoArquivo, 3) +                // 164-166 versao do layout
    '00000' +                                    // 167-171 densidade
    ' '.repeat(20) +                             // 172-191 uso do banco
    ' '.repeat(20) +                             // 192-211 uso da empresa
    ' '.repeat(29)                               // 212-240 uso FEBRABAN
  );
}

function headerLote(
  pagador: ContaPagadora,
  banco: BancoSuportado,
  lote: number,
  forma: string,
  tipoServico: string,
  historico: string,
): string {
  const doc = somenteDigitos(pagador.cnpj);
  return (
    num(banco.codigo, 3) +          // 001-003 banco
    num(lote, 4) +                  // 004-007 lote
    '1' +                           // 008     tipo de registro
    'C' +                           // 009     C = credito
    num(tipoServico, 2) +           // 010-011 tipo de servico
    num(forma, 2) +                 // 012-013 forma de lancamento
    num(banco.versaoLote, 3) +      // 014-016 versao do layout do lote
    ' ' +                           // 017     uso FEBRABAN
    tipoInscricao(doc) +            // 018     tipo de inscricao
    num(doc, 14) +                  // 019-032 numero de inscricao
    alfa(pagador.convenio, 20) +    // 033-052 convenio
    num(pagador.agencia, 5) +       // 053-057 agencia
    alfa(pagador.agenciaDigito, 1) +// 058     dv agencia
    num(pagador.conta, 12) +        // 059-070 conta
    alfa(pagador.contaDigito, 1) +  // 071     dv conta
    ' ' +                           // 072     dv ag/conta
    alfa(pagador.nomeEmpresa, 30) + // 073-102 nome da empresa
    alfa(historico, 40) +           // 103-142 mensagem
    ' '.repeat(30) +                // 143-172 logradouro
    '00000' +                       // 173-177 numero
    ' '.repeat(15) +                // 178-192 complemento
    ' '.repeat(20) +                // 193-212 cidade
    '00000' +                       // 213-217 CEP
    '000' +                         // 218-220 complemento do CEP
    ' '.repeat(2) +                 // 221-222 UF
    ' '.repeat(8) +                 // 223-230 uso FEBRABAN
    ' '.repeat(10)                  // 231-240 ocorrencias (retorno)
  );
}

function segmentoA(
  banco: BancoSuportado,
  lote: number,
  sequencial: number,
  favorecido: FavorecidoRemessa,
  dataPagamento: DataISO,
  usarPix: boolean,
): string {
  // Camara centralizadora: 018 para TED, 000 quando o credito e na mesma
  // instituicao ou quando o pagamento e PIX.
  const mesmoBanco = somenteDigitos(favorecido.bancoCodigo) === banco.codigo;
  const camara = usarPix || mesmoBanco ? '000' : '018';

  return (
    num(banco.codigo, 3) +                    // 001-003 banco
    num(lote, 4) +                            // 004-007 lote
    '3' +                                     // 008     tipo de registro
    num(sequencial, 5) +                      // 009-013 sequencial no lote
    'A' +                                     // 014     segmento
    '000' +                                   // 015-017 tipo de movimento (inclusao)
    camara +                                  // 018-020 camara centralizadora
    num(favorecido.bancoCodigo, 3) +          // 021-023 banco do favorecido
    num(favorecido.agencia, 5) +              // 024-028 agencia
    alfa(favorecido.agenciaDigito, 1) +       // 029     dv agencia
    num(favorecido.conta, 12) +               // 030-041 conta
    alfa(favorecido.contaDigito, 1) +         // 042     dv conta
    ' ' +                                     // 043     dv ag/conta
    alfa(favorecido.nome, 30) +               // 044-073 nome do favorecido
    alfa(favorecido.referencia, 20) +         // 074-093 seu numero
    dataCNAB(dataPagamento) +                 // 094-101 data do pagamento
    'BRL' +                                   // 102-104 moeda
    '0'.repeat(15) +                          // 105-119 quantidade da moeda
    valor(favorecido.valor, 15) +             // 120-134 valor do pagamento
    ' '.repeat(15) +                          // 135-149 nosso numero (banco preenche)
    '0'.repeat(8) +                           // 150-157 data real (retorno)
    '0'.repeat(15) +                          // 158-172 valor real (retorno)
    ' '.repeat(40) +                          // 173-212 informacao 2
    '00' +                                    // 213-214 finalidade DOC
    ' '.repeat(5) +                           // 215-219 finalidade TED
    ' '.repeat(2) +                           // 220-221 finalidade complementar
    ' '.repeat(3) +                           // 222-224 uso FEBRABAN
    '0' +                                     // 225     aviso ao favorecido
    ' '.repeat(15)                            // 226-240 ocorrencias (retorno)
  );
}

function segmentoB(
  banco: BancoSuportado,
  lote: number,
  sequencial: number,
  favorecido: FavorecidoRemessa,
  dataPagamento: DataISO,
  usarPix: boolean,
): string {
  const doc = somenteDigitos(favorecido.cpf);
  // Em lote PIX o segmento B carrega a chave; no credito em conta ele leva os
  // dados cadastrais do favorecido.
  const tipoChave = usarPix ? mapearTipoChavePix(favorecido.tipoPix) : '  ';
  const chave = usarPix ? alfa(favorecido.chavePix ?? '', 99) : ' '.repeat(99);

  return (
    num(banco.codigo, 3) +          // 001-003 banco
    num(lote, 4) +                  // 004-007 lote
    '3' +                           // 008     tipo de registro
    num(sequencial, 5) +            // 009-013 sequencial no lote
    'B' +                           // 014     segmento
    tipoChave +                     // 015-016 tipo de chave PIX (branco quando nao e PIX)
    ' ' +                           // 017     uso FEBRABAN
    tipoInscricao(doc) +            // 018     tipo de inscricao do favorecido
    num(doc, 14) +                  // 019-032 CPF/CNPJ do favorecido
    ' '.repeat(30) +                // 033-062 logradouro
    '00000' +                       // 063-067 numero
    ' '.repeat(15) +                // 068-082 complemento
    ' '.repeat(15) +                // 083-097 bairro
    ' '.repeat(20) +                // 098-117 cidade
    '00000' +                       // 118-122 CEP
    '000' +                         // 123-125 complemento do CEP
    ' '.repeat(2) +                 // 126-127 UF
    dataCNAB(dataPagamento) +       // 128-135 data de vencimento
    valor(favorecido.valor, 15) +   // 136-150 valor do documento
    '0'.repeat(15) +                // 151-165 abatimento
    '0'.repeat(15) +                // 166-180 desconto
    '0'.repeat(15) +                // 181-195 mora
    '0'.repeat(15) +                // 196-210 multa
    chave.slice(0, 99) +            // 211-240(-) chave PIX / codigo do favorecido
    ' '.repeat(6)
  ).slice(0, TAMANHO_LINHA).padEnd(TAMANHO_LINHA, ' ');
}

/** Codigo do tipo de chave PIX no segmento B (layout FEBRABAN 046). */
function mapearTipoChavePix(tipo: FavorecidoRemessa['tipoPix']): string {
  switch (tipo) {
    case 'TELEFONE':
      return '01';
    case 'EMAIL':
      return '02';
    case 'CPF':
    case 'CNPJ':
      return '03';
    case 'ALEATORIA':
      return '04';
    default:
      return '  ';
  }
}

function trailerLote(banco: BancoSuportado, lote: number, quantidadeRegistros: number, somaValores: number): string {
  return (
    num(banco.codigo, 3) +           // 001-003 banco
    num(lote, 4) +                   // 004-007 lote
    '5' +                            // 008     tipo de registro
    ' '.repeat(9) +                  // 009-017 uso FEBRABAN
    num(quantidadeRegistros, 6) +    // 018-023 quantidade de registros do lote
    valor(somaValores, 18) +         // 024-041 somatoria dos valores
    '0'.repeat(18) +                 // 042-059 somatoria de quantidade de moeda
    '0'.repeat(6) +                  // 060-065 numero do aviso de debito
    ' '.repeat(165) +                // 066-230 uso FEBRABAN
    ' '.repeat(10)                   // 231-240 ocorrencias (retorno)
  );
}

function trailerArquivo(banco: BancoSuportado, quantidadeLotes: number, quantidadeRegistros: number): string {
  return (
    num(banco.codigo, 3) +           // 001-003 banco
    '9999' +                         // 004-007 lote
    '9' +                            // 008     tipo de registro
    ' '.repeat(9) +                  // 009-017 uso FEBRABAN
    num(quantidadeLotes, 6) +        // 018-023 quantidade de lotes
    num(quantidadeRegistros, 6) +    // 024-029 quantidade de registros do arquivo
    '0'.repeat(6) +                  // 030-035 quantidade de contas para conciliacao
    ' '.repeat(205)                  // 036-240 uso FEBRABAN
  );
}

/* ------------------------------------------------------------------ *
 * Geracao
 * ------------------------------------------------------------------ */

/**
 * Monta a remessa CNAB 240 completa.
 *
 * Favorecidos invalidos sao excluidos do arquivo e devolvidos em
 * `inconsistencias`: e preferivel pagar 29 de 30 e corrigir um cadastro do que
 * ter o lote inteiro rejeitado pelo banco.
 */
export function gerarCNAB240(opcoes: OpcoesRemessa): ResultadoRemessa {
  const banco = bancoPorCodigo(opcoes.pagador.bancoCodigo);
  if (!banco) {
    throw new Error(`Banco ${opcoes.pagador.bancoCodigo} nao suportado na geracao de remessa.`);
  }
  const usarPix = Boolean(opcoes.usarPix);
  if (usarPix && !banco.suportaPix) {
    throw new Error(`${banco.nome} nao aceita lote PIX no CNAB 240. ${banco.observacao ?? ''}`.trim());
  }

  const geradoEm = opcoes.geradoEm ?? new Date();
  const historico = opcoes.historico ?? 'PAGAMENTO DE SALARIOS';
  const tipoServico = opcoes.tipoServico ?? TIPO_SERVICO.PAGAMENTO_SALARIOS;

  const validacoes = validarFavorecidos(opcoes.favorecidos, usarPix);
  const validos = validacoes.filter((v) => v.erros.length === 0).map((v) => v.favorecido);
  const inconsistencias = validacoes
    .filter((v) => v.erros.length > 0)
    .map((v) => `${v.favorecido.nome || v.favorecido.colaboradorId}: ${v.erros.join('; ')}`);

  if (validos.length === 0) {
    throw new Error(
      `Nenhum favorecido valido para gerar a remessa.${inconsistencias.length ? ` Problemas: ${inconsistencias.join(' | ')}` : ''}`,
    );
  }

  const lote = 1;
  const linhas: string[] = [headerArquivo(opcoes.pagador, banco, opcoes.numeroRemessa, geradoEm)];

  // Todos os pagamentos vao num unico lote; a forma de lancamento e definida
  // pelo tipo de conta predominante (ou PIX, quando solicitado).
  const formaPredominante = usarPix
    ? FORMA_LANCAMENTO.PIX_TRANSFERENCIA
    : formaPorTipoConta((validos[0] as FavorecidoRemessa).tipoConta, false);

  linhas.push(headerLote(opcoes.pagador, banco, lote, formaPredominante, tipoServico, historico));

  let sequencial = 0;
  let somaValores = 0;
  for (const favorecido of validos) {
    sequencial += 1;
    linhas.push(segmentoA(banco, lote, sequencial, favorecido, opcoes.dataPagamento, usarPix));
    sequencial += 1;
    linhas.push(segmentoB(banco, lote, sequencial, favorecido, opcoes.dataPagamento, usarPix));
    somaValores += favorecido.valor;
  }

  // O trailer conta header de lote + detalhes + o proprio trailer.
  linhas.push(trailerLote(banco, lote, sequencial + 2, somaValores));
  // O trailer de arquivo conta todas as linhas, inclusive ele mesmo.
  linhas.push(trailerArquivo(banco, 1, linhas.length + 1));

  const invalidas = linhas.filter((l) => l.length !== TAMANHO_LINHA);
  if (invalidas.length > 0) {
    throw new Error(`Remessa gerada com ${invalidas.length} linha(s) fora dos 240 caracteres — layout ${banco.nome}.`);
  }

  const nomeArquivo = montarNomeArquivo(banco.codigo, opcoes.numeroRemessa, opcoes.dataPagamento, usarPix ? 'PIX' : 'CC');

  return {
    conteudo: linhas.join(QUEBRA) + QUEBRA,
    nomeArquivo,
    quantidadePagamentos: validos.length,
    valorTotal: Number(somaValores.toFixed(2)),
    inconsistencias,
    linhas,
  };
}

export function montarNomeArquivo(bancoCodigo: string, numeroRemessa: number, dataPagamento: DataISO, sufixo: string): string {
  const data = dataPagamento.replace(/-/g, '');
  return `REM${bancoCodigo}_${data}_${String(numeroRemessa).padStart(5, '0')}_${sufixo}.REM`;
}

/**
 * Le um arquivo de remessa e devolve um resumo conferivel. Serve para a tela de
 * pre-visualizacao e para os testes de ida e volta.
 */
export function inspecionarCNAB240(conteudo: string): {
  banco: string;
  linhas: number;
  pagamentos: { nome: string; valor: number; banco: string; agencia: string; conta: string; data: string }[];
  totalDeclarado: number;
  totalCalculado: number;
  consistente: boolean;
} {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.length === TAMANHO_LINHA);
  const pagamentos: { nome: string; valor: number; banco: string; agencia: string; conta: string; data: string }[] = [];
  let totalDeclarado = 0;

  for (const linha of linhas) {
    const tipoRegistro = linha[7];
    if (tipoRegistro === '3' && linha[13] === 'A') {
      pagamentos.push({
        nome: linha.slice(43, 73).trim(),
        valor: Number(linha.slice(119, 134)) / 100,
        banco: linha.slice(20, 23),
        agencia: linha.slice(23, 28),
        conta: linha.slice(29, 41),
        data: formatarDataBR(`${linha.slice(97, 101)}-${linha.slice(95, 97)}-${linha.slice(93, 95)}`),
      });
    }
    if (tipoRegistro === '5') {
      totalDeclarado = Number(linha.slice(23, 41)) / 100;
    }
  }

  const totalCalculado = Number(pagamentos.reduce((a, p) => a + p.valor, 0).toFixed(2));
  return {
    banco: linhas[0]?.slice(0, 3) ?? '',
    linhas: linhas.length,
    pagamentos,
    totalDeclarado,
    totalCalculado,
    consistente: Math.abs(totalDeclarado - totalCalculado) < 0.01,
  };
}
