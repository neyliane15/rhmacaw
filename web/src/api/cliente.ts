import type { RespostaErro } from '@rhmacaw/shared';

const CHAVE_SESSAO = 'rhmacaw.sessao';
export const EVENTO_NAO_AUTORIZADO = 'rhmacaw:nao-autorizado';

/** Erro de API com mensagem ja legivel em portugues e detalhes por campo. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes: { campo: string; mensagem: string }[];

  constructor(status: number, codigo: string, mensagem: string, detalhes: { campo: string; mensagem: string }[] = []) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }

  /** Mensagem pronta para exibir, com os erros de campo anexados. */
  get textoCompleto(): string {
    if (this.detalhes.length === 0) return this.message;
    return `${this.message} (${this.detalhes.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')})`;
  }
}

let tokenEmMemoria: string | null = null;

export function definirToken(token: string | null): void {
  tokenEmMemoria = token;
}

export function lerToken(): string | null {
  if (tokenEmMemoria) return tokenEmMemoria;
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as { token?: string };
    tokenEmMemoria = dados.token ?? null;
    return tokenEmMemoria;
  } catch {
    return null;
  }
}

export const chaveSessao = CHAVE_SESSAO;

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface Opcoes {
  metodo?: Metodo;
  corpo?: unknown;
  /** Pares chave/valor da query string; vazios e nulos sao descartados. */
  query?: Record<string, string | number | boolean | null | undefined>;
  sinal?: AbortSignal;
}

export function montarQuery(query: Opcoes['query']): string {
  if (!query) return '';
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query)) {
    if (valor === null || valor === undefined || valor === '') continue;
    parametros.set(chave, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

const MENSAGENS_PADRAO: Record<number, string> = {
  400: 'Dados invalidos. Confira os campos destacados.',
  401: 'Sua sessao expirou. Entre novamente.',
  403: 'Seu perfil nao tem permissao para esta acao.',
  404: 'Registro nao encontrado.',
  409: 'A operacao conflita com o estado atual do registro.',
  422: 'Nao foi possivel processar os dados enviados.',
  500: 'Erro interno do servidor. Tente novamente em instantes.',
};

async function interpretarErro(resposta: Response): Promise<ErroApi> {
  const padrao = MENSAGENS_PADRAO[resposta.status] ?? `Falha na requisicao (HTTP ${resposta.status}).`;
  try {
    const corpo = (await resposta.json()) as Partial<RespostaErro>;
    return new ErroApi(
      resposta.status,
      typeof corpo.erro === 'string' ? corpo.erro : 'ERRO',
      typeof corpo.mensagem === 'string' && corpo.mensagem.trim() ? corpo.mensagem : padrao,
      Array.isArray(corpo.detalhes) ? corpo.detalhes : [],
    );
  } catch {
    return new ErroApi(resposta.status, 'ERRO', padrao);
  }
}

async function enviar(caminho: string, opcoes: Opcoes = {}): Promise<Response> {
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  const token = lerToken();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}${montarQuery(opcoes.query)}`, {
      method: opcoes.metodo ?? 'GET',
      headers: cabecalhos,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      signal: opcoes.sinal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    throw new ErroApi(0, 'REDE', 'Nao foi possivel falar com o servidor. Verifique se a API esta no ar.');
  }

  if (resposta.status === 401) {
    // Token invalido ou expirado: derruba a sessao em qualquer tela.
    window.dispatchEvent(new CustomEvent(EVENTO_NAO_AUTORIZADO));
    throw await interpretarErro(resposta);
  }
  if (!resposta.ok) throw await interpretarErro(resposta);
  return resposta;
}

/** Requisicao tipada que devolve JSON. */
export async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const resposta = await enviar(caminho, opcoes);
  if (resposta.status === 204) return undefined as T;
  const texto = await resposta.text();
  if (!texto) return undefined as T;
  return JSON.parse(texto) as T;
}

/** Requisicao que devolve texto puro (CSV, CNAB, arquivo de remessa). */
export async function requisitarTexto(caminho: string, opcoes: Opcoes = {}): Promise<string> {
  const resposta = await enviar(caminho, opcoes);
  return resposta.text();
}

/** Dispara o download de um conteudo textual gerado no front ou vindo da API. */
export function baixarTexto(nomeArquivo: string, conteudo: string, tipo = 'text/plain;charset=utf-8'): void {
  const blob = new Blob(['﻿', conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const elo = document.createElement('a');
  elo.href = url;
  elo.download = nomeArquivo;
  document.body.appendChild(elo);
  elo.click();
  elo.remove();
  URL.revokeObjectURL(url);
}

/** Converte qualquer excecao numa frase exibivel. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.textoCompleto;
  if (erro instanceof Error) return erro.message;
  return 'Ocorreu um erro inesperado.';
}
