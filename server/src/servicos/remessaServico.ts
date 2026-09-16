/**
 * O caminho relatorio -> banco.
 *
 * Monta os favorecidos a partir da origem (folha, semana de comissao, rescisao
 * ou recibo de ferias), delega a geracao do arquivo ao modulo `bank` do shared,
 * grava a remessa, escreve o arquivo em disco e avanca o estado da origem.
 *
 * Regras de estado implementadas aqui (secao final do contrato):
 *   3. gerar remessa exige folha FECHADA / periodo FECHADO;
 *   4. so pode existir uma remessa nao cancelada por origem;
 *   5. `valorTransferir <= 0` nunca entra no arquivo — vai para inconsistencias.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  Colaborador,
  ContaPagadora,
  DataISO,
  FavorecidoRemessa,
  LayoutBancario,
  OrigemRemessa,
  Remessa,
} from '@rhmacaw/shared';
import {
  bancoPorCodigo,
  formatarBRL,
  gerarCNAB240,
  gerarLoteCSV,
  gerarPixCSV,
  montarNomeArquivo,
  rotuloCompetencia,
  somar,
  validarFavorecidos,
} from '@rhmacaw/shared';
import { config } from '../config.js';
import { agora, emTransacao } from '../db/conexao.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoComissoes from '../db/repositorios/comissoes.js';
import * as repoConta from '../db/repositorios/contaPagadora.js';
import * as repoFerias from '../db/repositorios/ferias.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import * as repoRemessas from '../db/repositorios/remessas.js';
import * as repoRescisoes from '../db/repositorios/rescisoes.js';
import { ErroDominio, erroConflito, erroNaoEncontrado, erroNaoProcessavel } from '../erros.js';
import * as comissaoServico from './comissaoServico.js';
import * as folhaServico from './folhaServico.js';
import * as rescisaoServico from './rescisaoServico.js';

export interface PedidoRemessa {
  origem: OrigemRemessa;
  origemId: string;
  layout: LayoutBancario;
  bancoCodigo: string;
  dataPagamento: DataISO;
  /** Em CNAB240, gera lote PIX (forma 45) em vez de credito em conta. */
  usarPix?: boolean | undefined;
}

/**
 * Favorecido da previa: o cadastro bancario mais o veredito da validacao.
 *
 * Os invalidos continuam na lista (marcados com `valido: false` e o motivo)
 * porque a tela precisa mostrar QUEM vai ficar de fora e POR QUE — sumir com
 * eles seria esconder exatamente o que o financeiro precisa corrigir.
 */
export interface FavorecidoPrevia extends FavorecidoRemessa {
  valido: boolean;
  motivos: string[];
}

export interface PreviaRemessa {
  origem: OrigemRemessa;
  origemId: string;
  descricao: string;
  layout: LayoutBancario;
  bancoCodigo: string;
  dataPagamento: DataISO;
  favorecidos: FavorecidoPrevia[];
  inconsistencias: string[];
  quantidadePagamentos: number;
  valorTotal: number;
}

/** Dados da origem que o gerador precisa, ja normalizados. */
interface Origem {
  descricao: string;
  favorecidos: FavorecidoRemessa[];
  inconsistencias: string[];
  /** Avanca o estado da origem apos a remessa ser gravada. */
  concluir: (dataPagamento: DataISO) => void;
}

function contaDoTenant(tenantId: string): ContaPagadora {
  const conta = repoConta.buscarContaPagadora(tenantId);
  if (!conta) {
    throw erroNaoProcessavel('Conta pagadora da empresa nao configurada. Preencha em /api/banco/conta.');
  }
  return conta;
}

/**
 * Monta o favorecido a partir do cadastro. O valor ja chega decidido pela
 * origem (`valorTransferir` na folha, valor do lancamento na comissao, etc.);
 * campos bancarios ausentes viram string vazia para que `validarFavorecidos`
 * os aponte como inconsistencia em vez de o arquivo sair torto.
 */
function favorecidoDe(colaborador: Colaborador, valor: number, referencia: string): FavorecidoRemessa {
  return {
    colaboradorId: colaborador.id,
    nome: colaborador.nome,
    cpf: colaborador.cpf,
    bancoCodigo: colaborador.bancoCodigo ?? '',
    agencia: colaborador.agencia ?? '',
    agenciaDigito: colaborador.agenciaDigito ?? '',
    conta: colaborador.conta ?? '',
    contaDigito: colaborador.contaDigito ?? '',
    tipoConta: colaborador.tipoConta ?? 'CORRENTE',
    tipoPix: colaborador.tipoPix ?? null,
    chavePix: colaborador.chavePix ?? null,
    valor,
    referencia,
  };
}

function origemFolha(tenantId: string, folhaId: string, exigirFechada: boolean): Origem {
  const folha = repoFolhas.buscarFolha(tenantId, folhaId);
  if (!folha) throw erroNaoEncontrado('Folha');
  if (exigirFechada && folha.status !== 'FECHADA') {
    throw erroConflito(`Folha ${folha.status}: a remessa so pode ser gerada a partir de uma folha FECHADA.`);
  }

  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));
  const favorecidos: FavorecidoRemessa[] = [];
  const inconsistencias: string[] = [];

  for (const item of repoFolhas.listarItens(tenantId, folhaId)) {
    // Regra 5: quem nao tem nada a receber nao vira linha no arquivo do banco.
    if (item.valorTransferir <= 0) {
      inconsistencias.push(
        `${item.colaboradorNome}: valor a transferir ${formatarBRL(item.valorTransferir)} — fora da remessa.`,
      );
      continue;
    }
    const colaborador = cadastros.get(item.colaboradorId);
    if (!colaborador) {
      inconsistencias.push(`${item.colaboradorNome}: cadastro nao encontrado.`);
      continue;
    }
    favorecidos.push(
      favorecidoDe(colaborador, item.valorTransferir, `FOLHA${folha.competencia.replace('-', '')}`),
    );
  }

  return {
    descricao: `Folha ${folha.tipo} de ${rotuloCompetencia(folha.competencia)}`,
    favorecidos,
    inconsistencias,
    concluir: () => folhaServico.marcarComoPaga(tenantId, folha),
  };
}

function origemComissao(tenantId: string, periodoId: string, exigirFechado: boolean): Origem {
  const periodo = repoComissoes.buscarPeriodo(tenantId, periodoId);
  if (!periodo) throw erroNaoEncontrado('Periodo de comissao');
  if (exigirFechado && periodo.status !== 'FECHADO') {
    throw erroConflito(`Periodo ${periodo.status}: a remessa exige um periodo FECHADO.`);
  }

  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));
  const favorecidos: FavorecidoRemessa[] = [];
  const inconsistencias: string[] = [];

  for (const lancamento of repoComissoes.listarLancamentos(tenantId, periodoId)) {
    const colaborador = cadastros.get(lancamento.colaboradorId);
    if (!colaborador) {
      inconsistencias.push(`${lancamento.colaboradorId}: cadastro nao encontrado.`);
      continue;
    }
    if (lancamento.valor <= 0) {
      inconsistencias.push(`${colaborador.nome}: comissao ${formatarBRL(lancamento.valor)} — fora da remessa.`);
      continue;
    }
    favorecidos.push(
      favorecidoDe(colaborador, lancamento.valor, `COM${periodo.ano}S${String(periodo.semana).padStart(2, '0')}`),
    );
  }

  return {
    descricao: `Comissoes da semana ${periodo.semana}/${periodo.ano}`,
    favorecidos,
    inconsistencias,
    concluir: (dataPagamento) => comissaoServico.marcarComoPago(tenantId, periodo, dataPagamento),
  };
}

function origemRescisao(tenantId: string, rescisaoId: string): Origem {
  const rescisao = repoRescisoes.buscarRescisao(tenantId, rescisaoId);
  if (!rescisao) throw erroNaoEncontrado('Rescisao');
  if (rescisao.status === 'PAGA') throw erroConflito('Rescisao ja paga.');

  const colaborador = repoColaboradores.buscarColaborador(tenantId, rescisao.colaboradorId);
  if (!colaborador) throw erroNaoEncontrado('Colaborador da rescisao');

  const inconsistencias: string[] = [];
  const favorecidos: FavorecidoRemessa[] = [];
  if (rescisao.liquido > 0) {
    favorecidos.push(favorecidoDe(colaborador, rescisao.liquido, `TRCT${rescisao.dataDesligamento.replace(/-/g, '')}`));
  } else {
    inconsistencias.push(`${rescisao.colaboradorNome}: TRCT com liquido ${formatarBRL(rescisao.liquido)} — nada a pagar.`);
  }

  return {
    descricao: `Rescisao de ${rescisao.colaboradorNome} (${rescisao.dataDesligamento})`,
    favorecidos,
    inconsistencias,
    concluir: () => rescisaoServico.marcarComoPaga(tenantId, rescisao.id),
  };
}

function origemFerias(tenantId: string, feriasId: string): Origem {
  const ferias = repoFerias.buscarFerias(tenantId, feriasId);
  if (!ferias) throw erroNaoEncontrado('Periodo de ferias');
  if (ferias.status === 'CANCELADA') throw erroConflito('Periodo de ferias CANCELADA nao gera pagamento.');

  const colaborador = repoColaboradores.buscarColaborador(tenantId, ferias.colaboradorId);
  if (!colaborador) throw erroNaoEncontrado('Colaborador das ferias');

  const inconsistencias: string[] = [];
  const favorecidos: FavorecidoRemessa[] = [];
  if (ferias.liquido > 0) {
    favorecidos.push(favorecidoDe(colaborador, ferias.liquido, `FER${ferias.inicioGozo.replace(/-/g, '')}`));
  } else {
    inconsistencias.push(`${colaborador.nome}: recibo de ferias com liquido ${formatarBRL(ferias.liquido)}.`);
  }

  return {
    descricao: `Ferias de ${colaborador.nome} a partir de ${ferias.inicioGozo}`,
    favorecidos,
    inconsistencias,
    // O recibo de ferias nao muda de status ao ser pago: o ciclo PROGRAMADA ->
    // EM_GOZO -> CONCLUIDA acompanha o gozo, nao o pagamento.
    concluir: () => undefined,
  };
}

function resolverOrigem(tenantId: string, origem: OrigemRemessa, origemId: string, exigirEstadoFinal: boolean): Origem {
  switch (origem) {
    case 'FOLHA':
      return origemFolha(tenantId, origemId, exigirEstadoFinal);
    case 'COMISSAO_SEMANAL':
      return origemComissao(tenantId, origemId, exigirEstadoFinal);
    case 'RESCISAO':
      return origemRescisao(tenantId, origemId);
    case 'FERIAS':
      return origemFerias(tenantId, origemId);
  }
}

/** Previa conferivel pelo financeiro — nao grava nem reserva NSA. */
export function gerarPrevia(tenantId: string, pedido: PedidoRemessa): PreviaRemessa {
  const dados = resolverOrigem(tenantId, pedido.origem, pedido.origemId, false);
  const usarPix = pedido.layout === 'PIX_CSV' || Boolean(pedido.usarPix);

  const validacoes = validarFavorecidos(dados.favorecidos, usarPix);
  const favorecidos: FavorecidoPrevia[] = validacoes.map((v) => ({
    ...v.favorecido,
    valido: v.erros.length === 0,
    motivos: v.erros,
  }));
  const validos = favorecidos.filter((f) => f.valido);
  const problemas = favorecidos.filter((f) => !f.valido).map((f) => `${f.nome}: ${f.motivos.join('; ')}`);

  return {
    origem: pedido.origem,
    origemId: pedido.origemId,
    descricao: dados.descricao,
    layout: pedido.layout,
    bancoCodigo: pedido.bancoCodigo,
    dataPagamento: pedido.dataPagamento,
    favorecidos,
    inconsistencias: [...dados.inconsistencias, ...problemas],
    quantidadePagamentos: validos.length,
    valorTotal: somar(...validos.map((f) => f.valor)),
  };
}

interface ArquivoGerado {
  conteudo: string;
  nomeArquivo: string;
  quantidadePagamentos: number;
  valorTotal: number;
  inconsistencias: string[];
}

/**
 * Converte a recusa do gerador do shared (um `Error` comum) em 422. Sem isso
 * "nenhum favorecido valido" chegaria ao cliente como 500.
 */
function executarGeracao<T>(operacao: () => T): T {
  try {
    return operacao();
  } catch (erro) {
    if (erro instanceof ErroDominio) throw erro;
    throw erroNaoProcessavel(erro instanceof Error ? erro.message : 'Nao foi possivel gerar o arquivo da remessa.');
  }
}

function gerarArquivo(
  pedido: PedidoRemessa,
  pagador: ContaPagadora,
  favorecidos: FavorecidoRemessa[],
  numeroRemessa: number,
  descricao: string,
): ArquivoGerado {
  switch (pedido.layout) {
    case 'CNAB240': {
      // O gerador do shared recusa (com `Error` puro) banco sem PIX e lote sem
      // nenhum favorecido valido. Sao recusas de regra de negocio, nao falhas do
      // servidor: traduzimos para 422 antes que virem 500 no handler central.
      const banco = bancoPorCodigo(pedido.bancoCodigo);
      if (pedido.usarPix && banco && !banco.suportaPix) {
        throw erroNaoProcessavel(
          `${banco.nome} nao aceita lote PIX no CNAB 240. ${banco.observacao ?? ''}`.trim(),
        );
      }
      const resultado = executarGeracao(() =>
        gerarCNAB240({
          pagador: { ...pagador, bancoCodigo: pedido.bancoCodigo },
          favorecidos,
          dataPagamento: pedido.dataPagamento,
          numeroRemessa,
          historico: descricao,
          ...(pedido.usarPix ? { usarPix: true } : {}),
        }),
      );
      return {
        conteudo: resultado.conteudo,
        nomeArquivo: resultado.nomeArquivo,
        quantidadePagamentos: resultado.quantidadePagamentos,
        valorTotal: resultado.valorTotal,
        inconsistencias: resultado.inconsistencias,
      };
    }
    case 'PIX_CSV': {
      const validacoes = validarFavorecidos(favorecidos, true);
      const validos = validacoes.filter((v) => v.erros.length === 0).map((v) => v.favorecido);
      if (validos.length === 0) throw erroNaoProcessavel('Nenhum favorecido com chave PIX valida.');
      return {
        conteudo: gerarPixCSV(validos, pedido.dataPagamento, descricao),
        nomeArquivo: montarNomeArquivo(pedido.bancoCodigo, numeroRemessa, pedido.dataPagamento, 'PIX').replace('.REM', '.csv'),
        quantidadePagamentos: validos.length,
        valorTotal: somar(...validos.map((f) => f.valor)),
        inconsistencias: validacoes
          .filter((v) => v.erros.length > 0)
          .map((v) => `${v.favorecido.nome}: ${v.erros.join('; ')}`),
      };
    }
    case 'CSV_GERENCIAL': {
      if (favorecidos.length === 0) throw erroNaoProcessavel('Nenhum pagamento a exportar.');
      return {
        conteudo: gerarLoteCSV(favorecidos, pedido.dataPagamento),
        nomeArquivo: montarNomeArquivo(pedido.bancoCodigo, numeroRemessa, pedido.dataPagamento, 'GER').replace('.REM', '.csv'),
        quantidadePagamentos: favorecidos.length,
        valorTotal: somar(...favorecidos.map((f) => f.valor)),
        inconsistencias: [],
      };
    }
    case 'OFX':
      // OFX e formato de extrato (banco -> empresa); nao existe remessa OFX de
      // pagamento. Manter a opcao no enum e recusar aqui evita gerar um arquivo
      // que nenhum banco aceitaria.
      throw erroNaoProcessavel('OFX e um formato de extrato bancario e nao pode ser usado como remessa de pagamento.');
  }
}

/**
 * Gera a remessa de verdade: valida o estado da origem, reserva o NSA, monta o
 * arquivo, grava tudo e avanca a origem (folha -> PAGA, periodo -> PAGO).
 */
export function gerarRemessa(tenantId: string, pedido: PedidoRemessa, usuarioId: string | null): Remessa {
  if (!bancoPorCodigo(pedido.bancoCodigo)) {
    throw erroNaoProcessavel(`Banco ${pedido.bancoCodigo} nao suportado na geracao de remessa.`);
  }

  const ativa = repoRemessas.buscarRemessaAtiva(tenantId, pedido.origem, pedido.origemId);
  if (ativa) {
    throw erroConflito(
      `Ja existe a remessa ${ativa.nomeArquivo} (${ativa.status}) para esta origem. Cancele-a antes de gerar outra.`,
    );
  }

  const pagador = contaDoTenant(tenantId);
  const dados = resolverOrigem(tenantId, pedido.origem, pedido.origemId, true);
  if (dados.favorecidos.length === 0) {
    throw erroNaoProcessavel(
      `Nenhum pagamento elegivel nesta origem.${dados.inconsistencias.length ? ` ${dados.inconsistencias.join(' | ')}` : ''}`,
    );
  }

  return emTransacao(() => {
    const numeroRemessa = repoConta.reservarNumeroRemessa(tenantId);
    const arquivo = gerarArquivo(pedido, pagador, dados.favorecidos, numeroRemessa, dados.descricao);

    const remessa = repoRemessas.criarRemessa(tenantId, {
      origem: pedido.origem,
      origemId: pedido.origemId,
      descricao: dados.descricao,
      layout: pedido.layout,
      bancoCodigo: pedido.bancoCodigo,
      dataPagamento: pedido.dataPagamento,
      numeroRemessa,
      quantidadePagamentos: arquivo.quantidadePagamentos,
      valorTotal: arquivo.valorTotal,
      nomeArquivo: arquivo.nomeArquivo,
      conteudo: arquivo.conteudo,
      status: 'GERADA',
      inconsistencias: [...dados.inconsistencias, ...arquivo.inconsistencias],
      geradoPor: usuarioId,
    });

    gravarArquivoEmDisco(remessa.nomeArquivo, remessa.conteudo);
    dados.concluir(pedido.dataPagamento);

    registrar(tenantId, usuarioId, 'banco:gerar-remessa', 'remessa', remessa.id, {
      origem: pedido.origem,
      origemId: pedido.origemId,
      pagamentos: remessa.quantidadePagamentos,
      valorTotal: remessa.valorTotal,
    });
    return remessa;
  });
}

/** Grava o arquivo em `EXPORT_DIR` para quem prefere pegar do disco. */
function gravarArquivoEmDisco(nomeArquivo: string, conteudo: string): void {
  fs.mkdirSync(config.diretorioExportacao, { recursive: true });
  // `path.basename` impede que um nome vindo de dado externo escape do diretorio.
  fs.writeFileSync(path.join(config.diretorioExportacao, path.basename(nomeArquivo)), conteudo, 'latin1');
}

/** Transicoes aceitas do arquivo junto ao banco. */
const TRANSICOES: Record<Remessa['status'], Remessa['status'][]> = {
  GERADA: ['ENVIADA', 'CANCELADA'],
  ENVIADA: ['CONFIRMADA', 'REJEITADA', 'CANCELADA'],
  CONFIRMADA: [],
  REJEITADA: ['CANCELADA'],
  CANCELADA: [],
};

export function alterarStatus(
  tenantId: string,
  remessaId: string,
  novoStatus: Remessa['status'],
  usuarioId: string | null,
): Remessa {
  const remessa = repoRemessas.buscarRemessa(tenantId, remessaId);
  if (!remessa) throw erroNaoEncontrado('Remessa');

  if (!TRANSICOES[remessa.status].includes(novoStatus)) {
    throw erroConflito(`Transicao ${remessa.status} -> ${novoStatus} nao permitida.`);
  }

  const atualizada: Remessa = {
    ...remessa,
    status: novoStatus,
    enviadoEm: novoStatus === 'ENVIADA' ? agora() : remessa.enviadoEm,
    confirmadoEm: novoStatus === 'CONFIRMADA' ? agora() : remessa.confirmadoEm,
  };
  repoRemessas.atualizarStatusRemessa(tenantId, atualizada);
  registrar(tenantId, usuarioId, 'banco:status-remessa', 'remessa', remessaId, {
    de: remessa.status,
    para: novoStatus,
  });
  return atualizada;
}

export function exigirRemessa(tenantId: string, remessaId: string): Remessa {
  const remessa = repoRemessas.buscarRemessa(tenantId, remessaId);
  if (!remessa) throw erroNaoEncontrado('Remessa');
  return remessa;
}
