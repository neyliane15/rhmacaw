/**
 * Erro de dominio: carrega o codigo HTTP junto com a mensagem para que as rotas
 * nao precisem traduzir cada caso — o handler central converte em `RespostaErro`.
 */
import type { RespostaErro } from '@rhmacaw/shared';

export type DetalheErro = { campo: string; mensagem: string };

export class ErroDominio extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes: DetalheErro[] | undefined;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem);
    this.name = 'ErroDominio';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }

  paraResposta(): RespostaErro {
    const corpo: RespostaErro = { erro: this.codigo, mensagem: this.message };
    if (this.detalhes && this.detalhes.length > 0) corpo.detalhes = this.detalhes;
    return corpo;
  }
}

export const erroValidacao = (mensagem: string, detalhes?: DetalheErro[]): ErroDominio =>
  new ErroDominio(400, 'VALIDACAO', mensagem, detalhes);

export const erroNaoAutenticado = (mensagem = 'Credenciais ausentes ou invalidas.'): ErroDominio =>
  new ErroDominio(401, 'NAO_AUTENTICADO', mensagem);

export const erroSemPermissao = (mensagem = 'Seu perfil não permite esta operacao.'): ErroDominio =>
  new ErroDominio(403, 'SEM_PERMISSAO', mensagem);

export const erroNaoEncontrado = (recurso: string): ErroDominio =>
  new ErroDominio(404, 'NAO_ENCONTRADO', `${recurso} não encontrado(a).`);

/** 409: a operacao e valida, mas o estado atual do recurso nao a permite. */
export const erroConflito = (mensagem: string): ErroDominio => new ErroDominio(409, 'CONFLITO', mensagem);

/** 422: a entrada esta bem formada, mas o calculo/regra nao pode ser concluido. */
export const erroNaoProcessavel = (mensagem: string, detalhes?: DetalheErro[]): ErroDominio =>
  new ErroDominio(422, 'NAO_PROCESSAVEL', mensagem, detalhes);
