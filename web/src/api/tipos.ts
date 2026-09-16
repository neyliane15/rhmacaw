/**
 * Formatos de resposta que o contrato descreve em prosa (relatorios, resumos,
 * previa bancaria) e que por isso nao tem tipo nominal em `@rhmacaw/shared`.
 * Ficam aqui, do lado do front, para nao duplicar o dominio.
 */
import type {
  Competencia,
  DataISO,
  EntradaRescisao,
  ID,
  ItemFolha,
  LayoutBancario,
  MotivoRescisao,
  OrigemRemessa,
  TipoFalta,
  TipoAviso,
} from '@rhmacaw/shared';

/** `GET /faltas/resumo?competencia=` */
export interface ResumoFaltasColaborador {
  colaboradorId: ID;
  colaboradorNome: string;
  funcao?: string;
  centroCusto?: string;
  dias: number;
  horas?: number;
  diasDSR: number;
  valorEstimado: number;
  porTipo?: Partial<Record<TipoFalta, number>>;
}

/** `GET /colaboradores/:id/historico` */
export interface EventoHistorico {
  tipo: 'ADMISSAO' | 'FALTA' | 'FERIAS' | 'FOLHA' | 'RESCISAO' | 'COMISSAO' | 'ALTERACAO';
  data: DataISO;
  titulo: string;
  detalhe?: string | null;
  valor?: number | null;
  referencia?: string | null;
}

/** Corpo de `POST /colaboradores/:id/demitir` e de `POST /rescisoes/simular`. */
export type EntradaRescisaoApi = Omit<EntradaRescisao, 'colaborador'> & {
  colaboradorId: ID;
  motivo: MotivoRescisao;
  tipoAviso: TipoAviso;
};

/** `POST /banco/previa` */
export interface FavorecidoPrevia {
  colaboradorId: ID;
  nome: string;
  cpf: string;
  valor: number;
  bancoCodigo?: string | null;
  agencia?: string | null;
  conta?: string | null;
  chavePix?: string | null;
  tipoPix?: string | null;
  referencia?: string | null;
  valido: boolean;
  motivos?: string[];
}

export interface PreviaRemessa {
  origem: OrigemRemessa;
  origemId: ID;
  layout: LayoutBancario;
  bancoCodigo: string;
  dataPagamento: DataISO;
  descricao?: string;
  quantidadePagamentos: number;
  valorTotal: number;
  favorecidos: FavorecidoPrevia[];
  inconsistencias: string[];
}

export interface EntradaPrevia {
  origem: OrigemRemessa;
  origemId: ID;
  layout: LayoutBancario;
  bancoCodigo: string;
  dataPagamento: DataISO;
}

/* ----------------------------- Relatorios ----------------------------- */

/** Um ponto de `GET /relatorios/evolucao-folha`. */
export interface PontoEvolucaoFolha {
  competencia: Competencia;
  custo: number;
  transferir: number;
}

export interface RelatorioFolhaAnalitica {
  competencia: Competencia;
  folhaId?: ID | null;
  status?: string;
  itens: ItemFolha[];
  totais: {
    totalProventos: number;
    totalDescontos: number;
    totalLiquido: number;
    totalTransferir: number;
    totalComissoesAdiantadas?: number;
  };
}

export interface LinhaCentroCusto {
  centroCusto: string;
  colaboradores: number;
  proventos: number;
  descontos: number;
  liquido: number;
  inss?: number;
  fgts?: number;
  custoTotal: number;
}

export interface RelatorioCentroCusto {
  competencia: Competencia;
  linhas: LinhaCentroCusto[];
  total: number;
}

export interface LinhaComissoes {
  colaboradorId: ID;
  colaboradorNome: string;
  funcao?: string;
  centroCusto?: string;
  semanas: number;
  pontos?: number;
  total: number;
}

export interface RelatorioComissoes {
  ano: number;
  competencia?: Competencia | null;
  linhas: LinhaComissoes[];
  totalArrecadado: number;
  totalDistribuido: number;
  porSemana: { ano: number; semana: number; arrecadado: number; distribuido: number; status: string }[];
}

export interface LinhaAbsenteismo {
  colaboradorId: ID;
  colaboradorNome: string;
  funcao?: string;
  centroCusto?: string;
  diasUteis?: number;
  faltas: number;
  atestados: number;
  atrasosHoras: number;
  percentual: number;
}

export interface RelatorioAbsenteismo {
  competencia: Competencia;
  linhas: LinhaAbsenteismo[];
  percentualGeral: number;
}

export interface RelatorioMovimentacao {
  ano: number;
  meses: { competencia: Competencia; admissoes: number; demissoes: number; saldo: number; ativosFimDoMes?: number }[];
  totalAdmissoes: number;
  totalDemissoes: number;
  turnover?: number;
}

export interface RelatorioProvisoes {
  competencia: Competencia;
  linhas: {
    colaboradorId: ID;
    colaboradorNome: string;
    centroCusto?: string;
    provisaoFerias: number;
    provisaoTercoFerias: number;
    provisaoDecimoTerceiro: number;
    encargosSobreProvisoes: number;
    total: number;
  }[];
  totais: {
    provisaoFerias: number;
    provisaoTercoFerias: number;
    provisaoDecimoTerceiro: number;
    encargosSobreProvisoes: number;
    total: number;
  };
}
