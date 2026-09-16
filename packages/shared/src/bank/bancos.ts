/** Catalogo de bancos suportados na geracao de remessa. */

export interface BancoSuportado {
  codigo: string;
  nome: string;
  /** Versao do layout de lote aceita pelo banco (posicoes 014-016 do header de lote). */
  versaoLote: string;
  /** Versao do layout de arquivo (posicoes 164-166 do header de arquivo). */
  versaoArquivo: string;
  /** Tamanho do campo de convenio/contrato que o banco espera. */
  tamanhoConvenio: number;
  /** Se o banco aceita lote de PIX (forma de lancamento 45). */
  suportaPix: boolean;
  observacao?: string;
}

export const BANCOS: Record<string, BancoSuportado> = {
  '001': { codigo: '001', nome: 'BANCO DO BRASIL S.A.', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
  '033': { codigo: '033', nome: 'BANCO SANTANDER (BRASIL) S.A.', versaoLote: '030', versaoArquivo: '040', tamanhoConvenio: 20, suportaPix: true },
  '104': { codigo: '104', nome: 'CAIXA ECONOMICA FEDERAL', versaoLote: '040', versaoArquivo: '050', tamanhoConvenio: 20, suportaPix: false, observacao: 'PIX em lote apenas via arquivo proprio do SIPAG.' },
  '237': { codigo: '237', nome: 'BANCO BRADESCO S.A.', versaoLote: '046', versaoArquivo: '089', tamanhoConvenio: 20, suportaPix: true },
  '341': { codigo: '341', nome: 'ITAU UNIBANCO S.A.', versaoLote: '040', versaoArquivo: '080', tamanhoConvenio: 20, suportaPix: true },
  '077': { codigo: '077', nome: 'BANCO INTER S.A.', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
  '260': { codigo: '260', nome: 'NU PAGAMENTOS S.A.', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
  '336': { codigo: '336', nome: 'BANCO C6 S.A.', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
  '756': { codigo: '756', nome: 'SICOOB', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
  '748': { codigo: '748', nome: 'SICREDI', versaoLote: '046', versaoArquivo: '103', tamanhoConvenio: 20, suportaPix: true },
};

export function bancoPorCodigo(codigo: string): BancoSuportado | undefined {
  return BANCOS[(codigo ?? '').padStart(3, '0')];
}

export function listarBancos(): BancoSuportado[] {
  return Object.values(BANCOS).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Tipos de servico do lote (posicoes 010-011 do header de lote). */
export const TIPO_SERVICO = {
  PAGAMENTO_SALARIOS: '30',
  PAGAMENTO_FORNECEDOR: '20',
  PAGAMENTOS_DIVERSOS: '98',
} as const;

/** Formas de lancamento (posicoes 012-013 do header de lote). */
export const FORMA_LANCAMENTO = {
  CREDITO_CONTA_CORRENTE: '01',
  CREDITO_POUPANCA: '05',
  DOC_TED: '03',
  TED_OUTRA_TITULARIDADE: '41',
  PIX_TRANSFERENCIA: '45',
} as const;
