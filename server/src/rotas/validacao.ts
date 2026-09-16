/**
 * Esquemas de entrada (zod) e o adaptador que transforma falha de validacao em
 * `ErroDominio` 400 com a lista de campos — o formato que o contrato promete.
 */
import { z } from 'zod';
import {
  CRITERIOS_RATEIO,
  LAYOUTS_BANCARIOS,
  MOTIVOS_RESCISAO,
  ORIGENS_REMESSA,
  PAPEIS,
  SITUACOES,
  STATUS_FERIAS,
  STATUS_FOLHA,
  STATUS_PERIODO,
  STATUS_REMESSA,
  TIPOS_AVISO,
  TIPOS_CONTA,
  TIPOS_CONTRATO,
  TIPOS_FALTA,
  TIPOS_FOLHA,
  TIPOS_PIX,
  chavePixValida,
  cnpjValido,
  cpfValido,
  somenteDigitos,
} from '@rhmacaw/shared';
import { erroValidacao } from '../erros.js';

/** `z.enum` exige tupla mutavel; as constantes do shared sao `readonly`. */
const enumDe = <T extends string>(valores: readonly T[]): z.ZodEnum<[T, ...T[]]> =>
  z.enum(valores as unknown as [T, ...T[]]);

/**
 * Usa `z.infer` (o tipo de SAIDA) e nao o de entrada: e assim que campos com
 * `.default()` chegam ao servico ja preenchidos em vez de opcionais.
 */
export function validar<E extends z.ZodTypeAny>(esquema: E, dados: unknown): z.infer<E> {
  const resultado = esquema.safeParse(dados);
  if (!resultado.success) {
    throw erroValidacao(
      'Dados invalidos.',
      resultado.error.issues.map((i) => ({ campo: i.path.join('.') || '(corpo)', mensagem: i.message })),
    );
  }
  return resultado.data as z.infer<E>;
}

export const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD.');
export const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato YYYY-MM.');
export const dinheiro = z.number().finite();
export const inteiroPositivo = z.coerce.number().int().positive();

export const papel = enumDe(PAPEIS);
export const situacao = enumDe(SITUACOES);
export const tipoContrato = enumDe(TIPOS_CONTRATO);
export const tipoConta = enumDe(TIPOS_CONTA);
export const tipoPix = enumDe(TIPOS_PIX);
export const tipoFalta = enumDe(TIPOS_FALTA);
export const statusFerias = enumDe(STATUS_FERIAS);
export const statusPeriodo = enumDe(STATUS_PERIODO);
export const criterioRateio = enumDe(CRITERIOS_RATEIO);
export const tipoFolha = enumDe(TIPOS_FOLHA);
export const statusFolha = enumDe(STATUS_FOLHA);
export const motivoRescisao = enumDe(MOTIVOS_RESCISAO);
export const tipoAviso = enumDe(TIPOS_AVISO);
export const layoutBancario = enumDe(LAYOUTS_BANCARIOS);
export const origemRemessa = enumDe(ORIGENS_REMESSA);
export const statusRemessa = enumDe(STATUS_REMESSA);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const esquemaLogin = z.object({
  email: z.string().email('E-mail invalido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export const esquemaNovoUsuario = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
  papel,
});

/* ------------------------------------------------------------------ *
 * Colaboradores
 * ------------------------------------------------------------------ */

const camposBancarios = {
  bancoCodigo: z.string().max(3).nullish(),
  bancoNome: z.string().max(60).nullish(),
  agencia: z.string().max(10).nullish(),
  agenciaDigito: z.string().max(2).nullish(),
  conta: z.string().max(20).nullish(),
  contaDigito: z.string().max(2).nullish(),
  tipoConta: tipoConta.nullish(),
  tipoPix: tipoPix.nullish(),
  chavePix: z.string().max(140).nullish(),
};

const colaboradorBase = z.object({
  matricula: z.string().max(20).optional(),
  nome: z.string().min(3, 'Nome muito curto.'),
  cpf: z.string().refine((v) => cpfValido(v), 'CPF invalido.').transform(somenteDigitos),
  pis: z.string().max(14).nullish(),
  dataNascimento: dataISO.nullish(),
  funcao: z.string().min(2),
  setor: z.string().max(60).nullish(),
  centroCusto: z.string().min(1),
  tipoContrato,
  situacao,
  salarioBase: dinheiro.min(0),
  salarioHora: dinheiro.min(0).nullish(),
  cargaHorariaMensal: z.number().min(0).max(400),
  valeTransporte: z.boolean(),
  valeTransporteValorDiario: dinheiro.min(0).nullish(),
  pontosComissao: z.number().min(0),
  dependentesIRRF: z.number().int().min(0),
  dependentesSalarioFamilia: z.number().int().min(0),
  insalubridadePercentual: z.number().min(0).max(100).nullish(),
  periculosidade: z.boolean(),
  admissao: dataISO,
  demissao: dataISO.nullish(),
  observacoes: z.string().max(2000).nullish(),
  ...camposBancarios,
});

/** A chave PIX so faz sentido junto com o tipo, e precisa ser valida para o tipo. */
const conferirPix = <T extends { tipoPix?: string | null | undefined; chavePix?: string | null | undefined }>(
  dados: T,
  ctx: z.RefinementCtx,
): void => {
  if (!dados.chavePix) return;
  if (!dados.tipoPix) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tipoPix'], message: 'Informe o tipo da chave PIX.' });
    return;
  }
  if (!chavePixValida(dados.tipoPix, dados.chavePix)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chavePix'], message: `Chave PIX invalida para o tipo ${dados.tipoPix}.` });
  }
};

export const esquemaColaborador = colaboradorBase.superRefine(conferirPix);
export const esquemaColaboradorParcial = colaboradorBase.partial().superRefine(conferirPix);

export const esquemaFiltroColaboradores = z.object({
  busca: z.string().optional(),
  situacao: situacao.optional(),
  centroCusto: z.string().optional(),
  tipoContrato: tipoContrato.optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(500).optional(),
});

export const esquemaDemissao = z.object({
  dataAviso: dataISO,
  dataDesligamento: dataISO,
  motivo: motivoRescisao,
  tipoAviso,
  /** Sobrescreve a media apurada no banco; o RH pode ter o numero do contador. */
  mediaComissoes: dinheiro.min(0).optional(),
  /** Sobrescreve a contagem de faltas do periodo aquisitivo (art. 130). */
  faltasInjustificadasNoPeriodo: z.number().int().min(0).max(365).optional(),
  saldoFGTS: dinheiro.min(0).optional(),
  decimoTerceiroAdiantado: dinheiro.min(0).optional(),
  diasFeriasVencidas: z.number().int().min(0).max(60).optional(),
  saldoComissoes: dinheiro.min(0).optional(),
  outrosProventos: dinheiro.min(0).optional(),
  outrosDescontos: dinheiro.min(0).optional(),
});

/* ------------------------------------------------------------------ *
 * Faltas e ferias
 * ------------------------------------------------------------------ */

export const esquemaFalta = z.object({
  colaboradorId: z.string().min(1),
  data: dataISO,
  tipo: tipoFalta,
  horas: z.number().min(0).max(24).nullish(),
  justificativa: z.string().max(500).nullish(),
  documento: z.string().max(120).nullish(),
});

export const esquemaFaltaParcial = esquemaFalta.partial();

export const esquemaFiltroFaltas = z.object({
  colaboradorId: z.string().optional(),
  competencia: competencia.optional(),
  tipo: tipoFalta.optional(),
  de: dataISO.optional(),
  ate: dataISO.optional(),
});

export const esquemaFerias = z.object({
  colaboradorId: z.string().min(1),
  periodoAquisitivoInicio: dataISO,
  periodoAquisitivoFim: dataISO,
  inicioGozo: dataISO,
  diasGozo: z.number().int().min(0).max(30),
  diasAbono: z.number().int().min(0).max(10),
  adiantarDecimoTerceiro: z.boolean(),
  observacoes: z.string().max(500).nullish(),
  status: statusFerias.optional(),
});

export const esquemaFeriasParcial = esquemaFerias.partial();

/* ------------------------------------------------------------------ *
 * Comissoes
 * ------------------------------------------------------------------ */

export const esquemaPeriodoComissao = z.object({
  ano: z.number().int().min(2000).max(2100),
  semana: z.number().int().min(1).max(53),
  valorArrecadado: dinheiro.min(0),
  percentualRetencao: z.number().min(0).max(100),
  criterioRateio,
  dataPagamento: dataISO.optional(),
  observacoes: z.string().max(500).optional(),
});

export const esquemaLancamentosComissao = z.object({
  lancamentos: z
    .array(
      z.object({
        colaboradorId: z.string().min(1),
        pontos: z.number().min(0).default(0),
        horas: z.number().min(0).default(0),
        ajuste: dinheiro.default(0),
        valorManual: dinheiro.min(0).optional(),
        observacao: z.string().max(200).optional(),
      }),
    )
    .min(1, 'Informe ao menos um lancamento.'),
});

/* ------------------------------------------------------------------ *
 * Folha
 * ------------------------------------------------------------------ */

export const esquemaProcessarFolha = z.object({
  competencia,
  tipo: tipoFolha.default('MENSAL'),
  dataPagamento: dataISO.optional(),
  centroCusto: z.string().optional(),
});

export const esquemaAjusteItem = z.object({
  horasExtras: z.number().min(0).optional(),
  horasNoturnas: z.number().min(0).optional(),
  horasTrabalhadas: z.number().min(0).optional(),
  adiantamento: dinheiro.min(0).optional(),
  pensaoAlimenticia: dinheiro.min(0).optional(),
  eventos: z
    .array(
      z.object({
        codigo: z.string().min(1).max(6),
        descricao: z.string().min(1).max(60),
        natureza: z.enum(['PROVENTO', 'DESCONTO']),
        valor: dinheiro,
        baseINSS: z.boolean().optional(),
        baseIRRF: z.boolean().optional(),
        baseFGTS: z.boolean().optional(),
      }),
    )
    .optional(),
  observacoes: z.string().max(500).nullish(),
  reconhecerAlertas: z.boolean().optional(),
});

export const esquemaFecharFolha = z.object({ reconhecerAlertas: z.boolean().default(false) });

export const esquemaDecimoTerceiro = z.object({
  ano: z.number().int().min(2000).max(2100),
  parcela: z.union([z.literal(1), z.literal(2)]),
  dataPagamento: dataISO,
});

/* ------------------------------------------------------------------ *
 * Banco
 * ------------------------------------------------------------------ */

export const esquemaGerarRemessa = z.object({
  layout: layoutBancario.default('CNAB240'),
  bancoCodigo: z.string().min(1).max(3),
  dataPagamento: dataISO,
  usarPix: z.boolean().optional(),
});

export const esquemaPrevia = esquemaGerarRemessa.extend({
  origem: origemRemessa,
  origemId: z.string().min(1),
});

export const esquemaStatusRemessa = z.object({ status: statusRemessa });

export const esquemaContaPagadora = z.object({
  bancoCodigo: z.string().min(1).max(3),
  bancoNome: z.string().min(1).max(60),
  agencia: z.string().min(1).max(10),
  agenciaDigito: z.string().max(2).default(''),
  conta: z.string().min(1).max(20),
  contaDigito: z.string().max(2).default(''),
  convenio: z.string().max(20).default(''),
  nomeEmpresa: z.string().min(1).max(60),
  cnpj: z.string().refine((v) => cnpjValido(v), 'CNPJ invalido.').transform(somenteDigitos),
});
