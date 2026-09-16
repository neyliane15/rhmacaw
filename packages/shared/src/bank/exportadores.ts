/**
 * Formatos de saida alternativos ao CNAB: planilha de PIX em lote (aceita pelos
 * internet bankings) e CSV gerencial para conferencia/contabilidade.
 */
import { arredondar } from '../util/money.js';
import { formatarDataBR, type DataISO } from '../util/datas.js';
import { formatarCPF } from '../util/documentos.js';
import type { FavorecidoRemessa, ItemFolha } from '../domain/tipos.js';

/** Escapa um campo para CSV com separador `;` (padrao brasileiro). */
export function campoCSV(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function linhaCSV(campos: unknown[]): string {
  return campos.map(campoCSV).join(';');
}

/** Numero decimal no formato brasileiro, como os bancos esperam na planilha. */
function decimalBR(valor: number): string {
  return arredondar(valor).toFixed(2).replace('.', ',');
}

/**
 * Planilha de PIX em lote. Colunas no formato aceito pelos internet bankings
 * (chave, valor, descricao) — e o caminho mais rapido quando a empresa nao tem
 * convenio de folha de pagamento com o banco.
 */
export function gerarPixCSV(favorecidos: FavorecidoRemessa[], dataPagamento: DataISO, descricao: string): string {
  const cabecalho = linhaCSV(['TIPO_CHAVE', 'CHAVE', 'NOME', 'CPF', 'VALOR', 'DATA', 'DESCRICAO']);
  const linhas = favorecidos
    .filter((f) => f.chavePix && f.valor > 0)
    .map((f) =>
      linhaCSV([f.tipoPix ?? '', f.chavePix ?? '', f.nome, formatarCPF(f.cpf), decimalBR(f.valor), formatarDataBR(dataPagamento), descricao]),
    );
  return [cabecalho, ...linhas].join('\r\n') + '\r\n';
}

/** CSV de conferencia do lote bancario, linha a linha. */
export function gerarLoteCSV(favorecidos: FavorecidoRemessa[], dataPagamento: DataISO): string {
  const cabecalho = linhaCSV(['NOME', 'CPF', 'BANCO', 'AGENCIA', 'CONTA', 'TIPO_CONTA', 'CHAVE_PIX', 'VALOR', 'DATA', 'REFERENCIA']);
  const linhas = favorecidos.map((f) =>
    linhaCSV([
      f.nome,
      formatarCPF(f.cpf),
      f.bancoCodigo,
      `${f.agencia}${f.agenciaDigito ? `-${f.agenciaDigito}` : ''}`,
      `${f.conta}${f.contaDigito ? `-${f.contaDigito}` : ''}`,
      f.tipoConta,
      f.chavePix ?? '',
      decimalBR(f.valor),
      formatarDataBR(dataPagamento),
      f.referencia,
    ]),
  );
  const total = arredondar(favorecidos.reduce((a, f) => a + f.valor, 0));
  linhas.push(linhaCSV(['TOTAL', '', '', '', '', '', '', decimalBR(total), '', `${favorecidos.length} pagamentos`]));
  return [cabecalho, ...linhas].join('\r\n') + '\r\n';
}

/** Espelho analitico da folha — uma linha por colaborador, com todas as verbas. */
export function gerarFolhaCSV(itens: ItemFolha[], competencia: string): string {
  const cabecalho = linhaCSV([
    'COMPETENCIA',
    'COLABORADOR',
    'FUNCAO',
    'CENTRO_CUSTO',
    'SALARIO_BASE',
    'DIAS',
    'FALTAS',
    'DESC_FALTAS',
    'DESC_DSR',
    'COMISSOES',
    'HORAS_EXTRAS',
    'AD_NOTURNO',
    'VALE_TRANSPORTE',
    'INSS',
    'IRRF',
    'FGTS',
    'TOTAL_PROVENTOS',
    'TOTAL_DESCONTOS',
    'SALARIO_LIQUIDO',
    'COMISSOES_ADIANTADAS',
    'VALOR_TRANSFERIR',
  ]);

  const linhas = itens.map((i) =>
    linhaCSV([
      competencia,
      i.colaboradorNome,
      i.funcao,
      i.centroCusto,
      decimalBR(i.salarioBase),
      i.diasTrabalhados,
      i.faltasDias,
      decimalBR(i.descontoFaltas),
      decimalBR(i.descontoDSR),
      decimalBR(i.comissoes),
      decimalBR(i.horasExtras),
      decimalBR(i.adicionalNoturno),
      decimalBR(i.descontoValeTransporte),
      decimalBR(i.inss),
      decimalBR(i.irrf),
      decimalBR(i.fgts),
      decimalBR(i.totalProventos),
      decimalBR(i.totalDescontos),
      decimalBR(i.salarioLiquido),
      decimalBR(i.comissoesAdiantadas),
      decimalBR(i.valorTransferir),
    ]),
  );

  const soma = (campo: keyof ItemFolha): number => arredondar(itens.reduce((a, i) => a + Number(i[campo] ?? 0), 0));
  linhas.push(
    linhaCSV([
      competencia,
      'TOTAL GERAL',
      '',
      `${itens.length} colaboradores`,
      '',
      '',
      '',
      decimalBR(soma('descontoFaltas')),
      decimalBR(soma('descontoDSR')),
      decimalBR(soma('comissoes')),
      decimalBR(soma('horasExtras')),
      decimalBR(soma('adicionalNoturno')),
      decimalBR(soma('descontoValeTransporte')),
      decimalBR(soma('inss')),
      decimalBR(soma('irrf')),
      decimalBR(soma('fgts')),
      decimalBR(soma('totalProventos')),
      decimalBR(soma('totalDescontos')),
      decimalBR(soma('salarioLiquido')),
      decimalBR(soma('comissoesAdiantadas')),
      decimalBR(soma('valorTransferir')),
    ]),
  );

  return [cabecalho, ...linhas].join('\r\n') + '\r\n';
}
