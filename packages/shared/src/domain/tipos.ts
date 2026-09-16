import type { Competencia, DataISO } from '../util/datas.js';

export type ID = string;

/* ------------------------------------------------------------------ *
 * Tenant e acesso
 * ------------------------------------------------------------------ */

export const PAPEIS = ['ADMIN', 'RH', 'FINANCEIRO', 'LEITURA'] as const;
export type Papel = (typeof PAPEIS)[number];

/** Permissoes por papel. `FINANCEIRO` e o unico que libera remessa bancaria. */
export const PERMISSOES: Record<Papel, readonly string[]> = {
  ADMIN: ['*'],
  RH: ['colaboradores:*', 'faltas:*', 'ferias:*', 'comissoes:*', 'folha:*', 'rescisoes:*', 'relatorios:*', 'banco:ler'],
  FINANCEIRO: ['colaboradores:ler', 'comissoes:*', 'folha:*', 'relatorios:*', 'banco:*'],
  LEITURA: ['colaboradores:ler', 'faltas:ler', 'ferias:ler', 'comissoes:ler', 'folha:ler', 'rescisoes:ler', 'relatorios:*', 'banco:ler'],
};

export interface Tenant {
  id: ID;
  nome: string;
  cnpj: string;
  /** Codigo FPAS/CNAE opcional, usado em relatorios. */
  cnae?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  criadoEm: string;
}

export interface Usuario {
  id: ID;
  tenantId: ID;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  ultimoAcesso?: string | null;
  criadoEm: string;
}

export interface SessaoUsuario {
  token: string;
  expiraEm: string;
  usuario: Omit<Usuario, 'tenantId'> & { tenantId: ID };
  tenant: Tenant;
}

/* ------------------------------------------------------------------ *
 * Colaboradores
 * ------------------------------------------------------------------ */

export const TIPOS_CONTRATO = ['CLT', 'INTERMITENTE', 'ESTAGIO', 'PJ', 'SOCIO'] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

export const SITUACOES = ['ATIVO', 'AFASTADO', 'FERIAS', 'PROCESSO', 'DEMITIDO'] as const;
export type Situacao = (typeof SITUACOES)[number];

export const TIPOS_CONTA = ['CORRENTE', 'POUPANCA', 'PAGAMENTO'] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

export const TIPOS_PIX = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'] as const;
export type TipoPix = (typeof TIPOS_PIX)[number];

export interface DadosBancarios {
  bancoCodigo?: string | null;   // 3 digitos (ex.: "341")
  bancoNome?: string | null;
  agencia?: string | null;       // sem digito
  agenciaDigito?: string | null;
  conta?: string | null;
  contaDigito?: string | null;
  tipoConta?: TipoConta | null;
  tipoPix?: TipoPix | null;
  chavePix?: string | null;
}

export interface Colaborador extends DadosBancarios {
  id: ID;
  tenantId: ID;
  matricula: string;
  nome: string;
  cpf: string;
  pis?: string | null;
  dataNascimento?: DataISO | null;
  funcao: string;
  setor?: string | null;
  /** Agrupamento de rateio da folha (ex.: "FOLHA TOKITO", "FOLHA CENTRAL"). */
  centroCusto: string;
  tipoContrato: TipoContrato;
  situacao: Situacao;
  /** Salario mensal. Para INTERMITENTE fica 0 e vale o `salarioHora`. */
  salarioBase: number;
  salarioHora?: number | null;
  /** Jornada mensal contratada em horas, base das horas extras. */
  cargaHorariaMensal: number;
  valeTransporte: boolean;
  /** Custo diario do VT; o desconto e limitado a 6% do salario. */
  valeTransporteValorDiario?: number | null;
  /** Percentual do colaborador no rateio de comissoes semanais. */
  pontosComissao: number;
  dependentesIRRF: number;
  dependentesSalarioFamilia: number;
  insalubridadePercentual?: number | null;
  periculosidade: boolean;
  admissao: DataISO;
  demissao?: DataISO | null;
  observacoes?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type ColaboradorEntrada = Omit<Colaborador, 'id' | 'tenantId' | 'criadoEm' | 'atualizadoEm' | 'matricula'> &
  Partial<Pick<Colaborador, 'matricula'>>;

/* ------------------------------------------------------------------ *
 * Faltas e ocorrencias de ponto
 * ------------------------------------------------------------------ */

export const TIPOS_FALTA = ['FALTA', 'FALTA_JUSTIFICADA', 'ATESTADO', 'ATRASO', 'SUSPENSAO', 'AFASTAMENTO_INSS'] as const;
export type TipoFalta = (typeof TIPOS_FALTA)[number];

/** Tipos que geram desconto no salario e perda do DSR da semana. */
export const FALTAS_DESCONTAVEIS: readonly TipoFalta[] = ['FALTA', 'SUSPENSAO'];

export interface Falta {
  id: ID;
  tenantId: ID;
  colaboradorId: ID;
  data: DataISO;
  tipo: TipoFalta;
  /** Preenchido apenas para ATRASO; desconta fracao do dia. */
  horas?: number | null;
  justificativa?: string | null;
  /** Documento anexado (numero do atestado, protocolo etc.). */
  documento?: string | null;
  registradoPor?: ID | null;
  criadoEm: string;
}

export type FaltaEntrada = Omit<Falta, 'id' | 'tenantId' | 'criadoEm'>;

/* ------------------------------------------------------------------ *
 * Ferias
 * ------------------------------------------------------------------ */

export const STATUS_FERIAS = ['PROGRAMADA', 'EM_GOZO', 'CONCLUIDA', 'CANCELADA'] as const;
export type StatusFerias = (typeof STATUS_FERIAS)[number];

export interface Ferias {
  id: ID;
  tenantId: ID;
  colaboradorId: ID;
  periodoAquisitivoInicio: DataISO;
  periodoAquisitivoFim: DataISO;
  inicioGozo: DataISO;
  fimGozo: DataISO;
  diasGozo: number;
  /** Abono pecuniario (venda de ate 1/3 das ferias). */
  diasAbono: number;
  /** Adiantamento da 1a parcela do 13o junto com as ferias (art. 2o Lei 4.749/65). */
  adiantarDecimoTerceiro: boolean;
  status: StatusFerias;
  valorFerias: number;
  valorTerco: number;
  valorAbono: number;
  valorTercoAbono: number;
  valorAdiantamentoDecimo: number;
  inss: number;
  irrf: number;
  liquido: number;
  /** Competencia da folha em que o pagamento foi lancado. */
  competenciaPagamento?: Competencia | null;
  observacoes?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type FeriasEntrada = Pick<
  Ferias,
  'colaboradorId' | 'periodoAquisitivoInicio' | 'periodoAquisitivoFim' | 'inicioGozo' | 'diasGozo' | 'diasAbono' | 'adiantarDecimoTerceiro'
> & Partial<Pick<Ferias, 'observacoes' | 'status'>>;

/** Saldo de ferias calculado a partir da admissao e dos periodos ja gozados. */
export interface SaldoFerias {
  colaboradorId: ID;
  colaboradorNome: string;
  periodoAquisitivoInicio: DataISO;
  periodoAquisitivoFim: DataISO;
  /** Data em que as ferias passam a ser devidas em dobro (art. 137 CLT). */
  limiteConcessivo: DataISO;
  diasDireito: number;
  diasGozados: number;
  diasSaldo: number;
  faltasNoPeriodo: number;
  vencida: boolean;
  diasParaVencer: number;
}

/* ------------------------------------------------------------------ *
 * Comissoes semanais
 * ------------------------------------------------------------------ */

export const STATUS_PERIODO = ['ABERTO', 'FECHADO', 'PAGO'] as const;
export type StatusPeriodo = (typeof STATUS_PERIODO)[number];

/** Como o valor total da semana e distribuido entre os colaboradores. */
export const CRITERIOS_RATEIO = ['PONTOS', 'HORAS', 'MANUAL', 'IGUALITARIO'] as const;
export type CriterioRateio = (typeof CRITERIOS_RATEIO)[number];

export interface PeriodoComissao {
  id: ID;
  tenantId: ID;
  ano: number;
  semana: number;
  dataInicio: DataISO;
  dataFim: DataISO;
  /** Competencia da folha que absorve estas comissoes. */
  competencia: Competencia;
  /** Faturamento/gorjeta arrecadada na semana, base do rateio. */
  valorArrecadado: number;
  /** Percentual retido pela casa antes do rateio (0 a 100). */
  percentualRetencao: number;
  criterioRateio: CriterioRateio;
  status: StatusPeriodo;
  dataPagamento?: DataISO | null;
  totalDistribuido: number;
  observacoes?: string | null;
  criadoEm: string;
  fechadoEm?: string | null;
  pagoEm?: string | null;
}

export interface LancamentoComissao {
  id: ID;
  tenantId: ID;
  periodoId: ID;
  colaboradorId: ID;
  pontos: number;
  horas: number;
  /** Ajuste manual somado ao valor rateado (bonus ou desconto). */
  ajuste: number;
  valor: number;
  observacao?: string | null;
}

export interface PeriodoComissaoDetalhado extends PeriodoComissao {
  lancamentos: (LancamentoComissao & { colaboradorNome: string; funcao: string; centroCusto: string })[];
}

/* ------------------------------------------------------------------ *
 * Folha de pagamento
 * ------------------------------------------------------------------ */

export const TIPOS_FOLHA = ['MENSAL', 'ADIANTAMENTO', 'DECIMO_TERCEIRO_1', 'DECIMO_TERCEIRO_2', 'FERIAS', 'RESCISAO'] as const;
export type TipoFolha = (typeof TIPOS_FOLHA)[number];

export const STATUS_FOLHA = ['RASCUNHO', 'FECHADA', 'PAGA', 'CANCELADA'] as const;
export type StatusFolha = (typeof STATUS_FOLHA)[number];

export interface Folha {
  id: ID;
  tenantId: ID;
  competencia: Competencia;
  tipo: TipoFolha;
  status: StatusFolha;
  descricao?: string | null;
  dataPagamento: DataISO;
  totalProventos: number;
  totalDescontos: number;
  totalLiquido: number;
  totalComissoesAdiantadas: number;
  totalTransferir: number;
  quantidadeColaboradores: number;
  criadoEm: string;
  fechadoEm?: string | null;
  pagoEm?: string | null;
}

/** Linha individual de provento ou desconto — o "contracheque" detalhado. */
export interface Verba {
  codigo: string;
  descricao: string;
  natureza: 'PROVENTO' | 'DESCONTO' | 'INFORMATIVA';
  referencia: string;
  valor: number;
  /** Se entra na base do INSS. */
  baseINSS: boolean;
  /** Se entra na base do IRRF. */
  baseIRRF: boolean;
  /** Se entra na base do FGTS. */
  baseFGTS: boolean;
}

export interface ItemFolha {
  id: ID;
  tenantId: ID;
  folhaId: ID;
  colaboradorId: ID;
  colaboradorNome: string;
  funcao: string;
  centroCusto: string;
  salarioBase: number;
  diasTrabalhados: number;
  faltasDias: number;
  faltasHoras: number;
  descontoFaltas: number;
  descontoDSR: number;
  comissoes: number;
  horasExtras: number;
  adicionalNoturno: number;
  outrosProventos: number;
  descontoValeTransporte: number;
  outrosDescontos: number;
  baseINSS: number;
  inss: number;
  baseIRRF: number;
  irrf: number;
  baseFGTS: number;
  fgts: number;
  salarioFamilia: number;
  totalProventos: number;
  totalDescontos: number;
  salarioLiquido: number;
  /** Comissoes ja pagas semanalmente — abatidas do liquido a transferir. */
  comissoesAdiantadas: number;
  valorTransferir: number;
  verbas: Verba[];
  observacoes?: string | null;
}

export interface FolhaDetalhada extends Folha {
  itens: ItemFolha[];
}

/* ------------------------------------------------------------------ *
 * Decimo terceiro
 * ------------------------------------------------------------------ */

export interface DecimoTerceiro {
  colaboradorId: ID;
  colaboradorNome: string;
  ano: number;
  avos: number;
  mediaComissoes: number;
  baseCalculo: number;
  valorIntegral: number;
  primeiraParcela: number;
  segundaParcelaBruta: number;
  inss: number;
  irrf: number;
  segundaParcelaLiquida: number;
  totalLiquido: number;
}

/* ------------------------------------------------------------------ *
 * Admissao e rescisao
 * ------------------------------------------------------------------ */

export const MOTIVOS_RESCISAO = [
  'SEM_JUSTA_CAUSA',
  'PEDIDO_DEMISSAO',
  'JUSTA_CAUSA',
  'ACORDO_484A',
  'TERMINO_CONTRATO',
  'APOSENTADORIA',
  'FALECIMENTO',
] as const;
export type MotivoRescisao = (typeof MOTIVOS_RESCISAO)[number];

export const TIPOS_AVISO = ['INDENIZADO', 'TRABALHADO', 'DISPENSADO'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

export interface Rescisao {
  id: ID;
  tenantId: ID;
  colaboradorId: ID;
  colaboradorNome: string;
  dataAviso: DataISO;
  dataDesligamento: DataISO;
  motivo: MotivoRescisao;
  tipoAviso: TipoAviso;
  diasAvisoPrevio: number;
  saldoSalario: number;
  avisoPrevioIndenizado: number;
  decimoTerceiroProporcional: number;
  feriasVencidas: number;
  tercoFeriasVencidas: number;
  feriasProporcionais: number;
  tercoFeriasProporcionais: number;
  saldoComissoes: number;
  outrosProventos: number;
  totalProventos: number;
  inss: number;
  irrf: number;
  avisoPrevioDescontado: number;
  outrosDescontos: number;
  totalDescontos: number;
  liquido: number;
  saldoFGTS: number;
  multaFGTS: number;
  /** Se o motivo da direito ao saque do FGTS e ao seguro-desemprego. */
  habilitaSeguroDesemprego: boolean;
  verbas: Verba[];
  status: StatusFolha;
  criadoEm: string;
}

/* ------------------------------------------------------------------ *
 * Remessa bancaria
 * ------------------------------------------------------------------ */

export const LAYOUTS_BANCARIOS = ['CNAB240', 'PIX_CSV', 'CSV_GERENCIAL', 'OFX'] as const;
export type LayoutBancario = (typeof LAYOUTS_BANCARIOS)[number];

export const ORIGENS_REMESSA = ['FOLHA', 'COMISSAO_SEMANAL', 'RESCISAO', 'FERIAS'] as const;
export type OrigemRemessa = (typeof ORIGENS_REMESSA)[number];

export const STATUS_REMESSA = ['GERADA', 'ENVIADA', 'CONFIRMADA', 'REJEITADA', 'CANCELADA'] as const;
export type StatusRemessa = (typeof STATUS_REMESSA)[number];

/** Uma linha de pagamento dentro da remessa. */
export interface FavorecidoRemessa {
  colaboradorId: ID;
  nome: string;
  cpf: string;
  bancoCodigo: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  tipoConta: TipoConta;
  tipoPix?: TipoPix | null;
  chavePix?: string | null;
  valor: number;
  /** Identificador do pagamento dentro do lote (nosso numero). */
  referencia: string;
}

export interface ContaPagadora {
  bancoCodigo: string;
  bancoNome: string;
  agencia: string;
  agenciaDigito: string;
  conta: string;
  contaDigito: string;
  /** Codigo do convenio/contrato de pagamento junto ao banco. */
  convenio: string;
  nomeEmpresa: string;
  cnpj: string;
}

export interface Remessa {
  id: ID;
  tenantId: ID;
  origem: OrigemRemessa;
  origemId: ID;
  descricao: string;
  layout: LayoutBancario;
  bancoCodigo: string;
  dataPagamento: DataISO;
  /** Sequencial da remessa no banco (NSA). */
  numeroRemessa: number;
  quantidadePagamentos: number;
  valorTotal: number;
  nomeArquivo: string;
  conteudo: string;
  status: StatusRemessa;
  /** Favorecidos rejeitados na validacao (sem conta, sem CPF etc.). */
  inconsistencias: string[];
  geradoPor?: ID | null;
  criadoEm: string;
  enviadoEm?: string | null;
  confirmadoEm?: string | null;
}

/* ------------------------------------------------------------------ *
 * Dashboard / relatorios
 * ------------------------------------------------------------------ */

export interface ResumoDashboard {
  competencia: Competencia;
  colaboradoresAtivos: number;
  admissoesNoMes: number;
  demissoesNoMes: number;
  emFerias: number;
  feriasVencendo: number;
  faltasNoMes: number;
  custoFolha: number;
  totalComissoesSemana: number;
  totalTransferir: number;
  folhaStatus: StatusFolha | 'NAO_INICIADA';
  remessasPendentes: number;
  porCentroCusto: { centroCusto: string; colaboradores: number; custo: number }[];
  alertas: Alerta[];
}

export interface Alerta {
  nivel: 'INFO' | 'ATENCAO' | 'CRITICO';
  titulo: string;
  detalhe: string;
  /** Rota do front para resolver o alerta. */
  acao?: string | null;
}

export interface Paginado<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface RespostaErro {
  erro: string;
  mensagem: string;
  detalhes?: { campo: string; mensagem: string }[];
}
