/** Rotulos em portugues para os enums do dominio, num lugar so. */
import type {
  CriterioRateio,
  LayoutBancario,
  MotivoRescisao,
  OrigemRemessa,
  Papel,
  Situacao,
  StatusFerias,
  StatusFolha,
  StatusPeriodo,
  StatusRemessa,
  TipoAviso,
  TipoContrato,
  TipoConta,
  TipoFalta,
  TipoFolha,
  TipoPix,
} from '@rhmacaw/shared';

export type Tom = 'neutro' | 'positivo' | 'atencao' | 'critico' | 'info' | 'trilho';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  ATIVO: 'Ativo',
  AFASTADO: 'Afastado',
  FERIAS: 'Em férias',
  PROCESSO: 'Em processo',
  DEMITIDO: 'Demitido',
};

export const TOM_SITUACAO: Record<Situacao, Tom> = {
  ATIVO: 'positivo',
  AFASTADO: 'atencao',
  FERIAS: 'info',
  PROCESSO: 'atencao',
  DEMITIDO: 'critico',
};

export const ROTULO_CONTRATO: Record<TipoContrato, string> = {
  CLT: 'CLT',
  INTERMITENTE: 'Intermitente',
  ESTAGIO: 'Estágio',
  PJ: 'PJ',
  SOCIO: 'Sócio',
};

export const ROTULO_FALTA: Record<TipoFalta, string> = {
  FALTA: 'Falta',
  FALTA_JUSTIFICADA: 'Falta justificada',
  ATESTADO: 'Atestado',
  ATRASO: 'Atraso',
  SUSPENSAO: 'Suspensao',
  AFASTAMENTO_INSS: 'Afastamento INSS',
};

export const TOM_FALTA: Record<TipoFalta, Tom> = {
  FALTA: 'critico',
  FALTA_JUSTIFICADA: 'neutro',
  ATESTADO: 'info',
  ATRASO: 'atencao',
  SUSPENSAO: 'critico',
  AFASTAMENTO_INSS: 'info',
};

export const ROTULO_STATUS_FERIAS: Record<StatusFerias, string> = {
  PROGRAMADA: 'Programada',
  EM_GOZO: 'Em gozo',
  CONCLUIDA: 'Concluida',
  CANCELADA: 'Cancelada',
};

export const TOM_STATUS_FERIAS: Record<StatusFerias, Tom> = {
  PROGRAMADA: 'info',
  EM_GOZO: 'positivo',
  CONCLUIDA: 'neutro',
  CANCELADA: 'critico',
};

export const ROTULO_STATUS_PERIODO: Record<StatusPeriodo, string> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
  PAGO: 'Pago',
};

export const TOM_STATUS_PERIODO: Record<StatusPeriodo, Tom> = {
  ABERTO: 'atencao',
  FECHADO: 'info',
  PAGO: 'positivo',
};

export const ROTULO_CRITERIO: Record<CriterioRateio, string> = {
  PONTOS: 'Por pontos',
  HORAS: 'Por horas trabalhadas',
  MANUAL: 'Manual',
  IGUALITARIO: 'Igualitario',
};

export const DESCRICAO_CRITERIO: Record<CriterioRateio, string> = {
  PONTOS: 'Divide o líquido da semana na proporcao dos pontos de cada colaborador.',
  HORAS: 'Divide na proporcao das horas lancadas na semana.',
  MANUAL: 'Você digita o valor de cada um; o sistema so confere o total.',
  IGUALITARIO: 'Mesmo valor para todos os participantes da semana.',
};

export const ROTULO_STATUS_FOLHA: Record<StatusFolha, string> = {
  RASCUNHO: 'Rascunho',
  FECHADA: 'Fechada',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export const TOM_STATUS_FOLHA: Record<StatusFolha, Tom> = {
  RASCUNHO: 'atencao',
  FECHADA: 'info',
  PAGA: 'positivo',
  CANCELADA: 'critico',
};

export const ROTULO_TIPO_FOLHA: Record<TipoFolha, string> = {
  MENSAL: 'Mensal',
  ADIANTAMENTO: 'Adiantamento',
  DECIMO_TERCEIRO_1: '13o - 1a parcela',
  DECIMO_TERCEIRO_2: '13o - 2a parcela',
  FERIAS: 'Férias',
  RESCISAO: 'Rescisão',
};

export const ROTULO_MOTIVO: Record<MotivoRescisao, string> = {
  SEM_JUSTA_CAUSA: 'Dispensa sem justa causa',
  PEDIDO_DEMISSAO: 'Pedido de demissão',
  JUSTA_CAUSA: 'Dispensa por justa causa',
  ACORDO_484A: 'Acordo (art. 484-A)',
  TERMINO_CONTRATO: 'Termino de contrato',
  APOSENTADORIA: 'Aposentadoria',
  FALECIMENTO: 'Falecimento',
};

export const ROTULO_AVISO: Record<TipoAviso, string> = {
  INDENIZADO: 'Indenizado',
  TRABALHADO: 'Trabalhado',
  DISPENSADO: 'Dispensado',
};

export const ROTULO_LAYOUT: Record<LayoutBancario, string> = {
  CNAB240: 'CNAB 240 (folha de pagamento)',
  PIX_CSV: 'PIX em lote (CSV)',
  CSV_GERENCIAL: 'CSV gerencial (conferencia)',
  OFX: 'OFX',
};

export const ROTULO_ORIGEM: Record<OrigemRemessa, string> = {
  FOLHA: 'Folha de pagamento',
  COMISSAO_SEMANAL: 'Comissão semanal',
  RESCISAO: 'Rescisão',
  FERIAS: 'Férias',
};

export const ROTULO_STATUS_REMESSA: Record<StatusRemessa, string> = {
  GERADA: 'Gerada',
  ENVIADA: 'Enviada ao banco',
  CONFIRMADA: 'Confirmada',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};

export const TOM_STATUS_REMESSA: Record<StatusRemessa, Tom> = {
  GERADA: 'atencao',
  ENVIADA: 'info',
  CONFIRMADA: 'positivo',
  REJEITADA: 'critico',
  CANCELADA: 'neutro',
};

export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  CORRENTE: 'Conta corrente',
  POUPANCA: 'Conta poupanca',
  PAGAMENTO: 'Conta de pagamento',
};

export const ROTULO_TIPO_PIX: Record<TipoPix, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone',
  ALEATORIA: 'Chave aleatoria',
};

export const EXEMPLO_PIX: Record<TipoPix, string> = {
  CPF: '000.000.000-00',
  CNPJ: '00.000.000/0000-00',
  EMAIL: 'nome@dominio.com.br',
  TELEFONE: '+5521999998888',
  ALEATORIA: '00000000-0000-4000-8000-000000000000',
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: 'Administrador',
  RH: 'Recursos humanos',
  FINANCEIRO: 'Financeiro',
  LEITURA: 'Somente leitura',
};

export const ROTULO_NIVEL_ALERTA = {
  INFO: 'Informação',
  ATENCAO: 'Atenção',
  CRITICO: 'Critico',
} as const;
