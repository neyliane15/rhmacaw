import type {
  Colaborador,
  ColaboradorEntrada,
  Paginado,
  Situacao,
  TipoConta,
  TipoContrato,
  TipoPix,
} from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';
import { deBooleano, paraBooleano } from './comum.js';

interface LinhaColaborador {
  id: string;
  tenant_id: string;
  matricula: string;
  nome: string;
  cpf: string;
  pis: string | null;
  data_nascimento: string | null;
  funcao: string;
  setor: string | null;
  centro_custo: string;
  tipo_contrato: string;
  situacao: string;
  salario_base: number;
  salario_hora: number | null;
  carga_horaria_mensal: number;
  vale_transporte: number;
  vale_transporte_valor_diario: number | null;
  pontos_comissao: number;
  dependentes_irrf: number;
  dependentes_salario_familia: number;
  insalubridade_percentual: number | null;
  periculosidade: number;
  admissao: string;
  demissao: string | null;
  observacoes: string | null;
  banco_codigo: string | null;
  banco_nome: string | null;
  agencia: string | null;
  agencia_digito: string | null;
  conta: string | null;
  conta_digito: string | null;
  tipo_conta: string | null;
  tipo_pix: string | null;
  chave_pix: string | null;
  criado_em: string;
  atualizado_em: string;
}

export function paraColaborador(l: LinhaColaborador): Colaborador {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    matricula: l.matricula,
    nome: l.nome,
    cpf: l.cpf,
    pis: l.pis,
    dataNascimento: l.data_nascimento,
    funcao: l.funcao,
    setor: l.setor,
    centroCusto: l.centro_custo,
    tipoContrato: l.tipo_contrato as TipoContrato,
    situacao: l.situacao as Situacao,
    salarioBase: l.salario_base,
    salarioHora: l.salario_hora,
    cargaHorariaMensal: l.carga_horaria_mensal,
    valeTransporte: paraBooleano(l.vale_transporte),
    valeTransporteValorDiario: l.vale_transporte_valor_diario,
    pontosComissao: l.pontos_comissao,
    dependentesIRRF: l.dependentes_irrf,
    dependentesSalarioFamilia: l.dependentes_salario_familia,
    insalubridadePercentual: l.insalubridade_percentual,
    periculosidade: paraBooleano(l.periculosidade),
    admissao: l.admissao,
    demissao: l.demissao,
    observacoes: l.observacoes,
    bancoCodigo: l.banco_codigo,
    bancoNome: l.banco_nome,
    agencia: l.agencia,
    agenciaDigito: l.agencia_digito,
    conta: l.conta,
    contaDigito: l.conta_digito,
    tipoConta: l.tipo_conta as TipoConta | null,
    tipoPix: l.tipo_pix as TipoPix | null,
    chavePix: l.chave_pix,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

export interface FiltroColaboradores {
  busca?: string | undefined;
  situacao?: Situacao | undefined;
  centroCusto?: string | undefined;
  tipoContrato?: TipoContrato | undefined;
  pagina?: number | undefined;
  porPagina?: number | undefined;
}

/** Monta o WHERE comum a listagem e contagem, sempre iniciando pelo tenant. */
function condicoes(tenantId: string, filtro: FiltroColaboradores): { sql: string; args: unknown[] } {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];

  if (filtro.busca?.trim()) {
    partes.push('(nome LIKE ? OR matricula LIKE ? OR cpf LIKE ? OR funcao LIKE ?)');
    const termo = `%${filtro.busca.trim()}%`;
    args.push(termo, termo, termo, termo);
  }
  if (filtro.situacao) {
    partes.push('situacao = ?');
    args.push(filtro.situacao);
  }
  if (filtro.centroCusto) {
    partes.push('centro_custo = ?');
    args.push(filtro.centroCusto);
  }
  if (filtro.tipoContrato) {
    partes.push('tipo_contrato = ?');
    args.push(filtro.tipoContrato);
  }
  return { sql: partes.join(' AND '), args };
}

export function listarColaboradores(tenantId: string, filtro: FiltroColaboradores = {}): Paginado<Colaborador> {
  const db = obterBanco();
  const { sql, args } = condicoes(tenantId, filtro);
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const porPagina = Math.min(500, Math.max(1, filtro.porPagina ?? 50));

  const total =
    db.prepare<unknown[], { total: number }>(`SELECT COUNT(*) AS total FROM colaboradores WHERE ${sql}`).get(...args)
      ?.total ?? 0;

  const itens = db
    .prepare<unknown[], LinhaColaborador>(
      `SELECT * FROM colaboradores WHERE ${sql} ORDER BY nome LIMIT ? OFFSET ?`,
    )
    .all(...args, porPagina, (pagina - 1) * porPagina)
    .map(paraColaborador);

  return { itens, total, pagina, porPagina };
}

/** Todos os colaboradores do tenant, sem paginacao — base do processamento da folha. */
export function listarTodos(tenantId: string): Colaborador[] {
  return obterBanco()
    .prepare<[string], LinhaColaborador>('SELECT * FROM colaboradores WHERE tenant_id = ? ORDER BY nome')
    .all(tenantId)
    .map(paraColaborador);
}

export function buscarColaborador(tenantId: string, id: string): Colaborador | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaColaborador>('SELECT * FROM colaboradores WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraColaborador(linha) : null;
}

export function buscarPorCpf(tenantId: string, cpf: string): Colaborador | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaColaborador>('SELECT * FROM colaboradores WHERE tenant_id = ? AND cpf = ?')
    .get(tenantId, cpf);
  return linha ? paraColaborador(linha) : null;
}

/**
 * Proxima matricula do tenant. Usa o maior numero ja existente (e nao a
 * contagem) para que a exclusao de um cadastro nao gere matricula repetida.
 */
export function proximaMatricula(tenantId: string): string {
  const linha = obterBanco()
    .prepare<[string], { maior: number | null }>(
      `SELECT MAX(CAST(matricula AS INTEGER)) AS maior FROM colaboradores
       WHERE tenant_id = ? AND matricula GLOB '[0-9]*'`,
    )
    .get(tenantId);
  return String((linha?.maior ?? 0) + 1).padStart(4, '0');
}

const COLUNAS = [
  'matricula',
  'nome',
  'cpf',
  'pis',
  'data_nascimento',
  'funcao',
  'setor',
  'centro_custo',
  'tipo_contrato',
  'situacao',
  'salario_base',
  'salario_hora',
  'carga_horaria_mensal',
  'vale_transporte',
  'vale_transporte_valor_diario',
  'pontos_comissao',
  'dependentes_irrf',
  'dependentes_salario_familia',
  'insalubridade_percentual',
  'periculosidade',
  'admissao',
  'demissao',
  'observacoes',
  'banco_codigo',
  'banco_nome',
  'agencia',
  'agencia_digito',
  'conta',
  'conta_digito',
  'tipo_conta',
  'tipo_pix',
  'chave_pix',
] as const;

type Coluna = (typeof COLUNAS)[number];

/** Traduz o objeto de dominio nas colunas da tabela (apenas os campos presentes). */
function paraColunas(dados: Partial<ColaboradorEntrada>): Map<Coluna, unknown> {
  const mapa = new Map<Coluna, unknown>();
  const definir = (coluna: Coluna, valor: unknown): void => {
    if (valor !== undefined) mapa.set(coluna, valor);
  };

  definir('matricula', dados.matricula);
  definir('nome', dados.nome);
  definir('cpf', dados.cpf);
  definir('pis', dados.pis ?? undefined);
  definir('data_nascimento', dados.dataNascimento ?? undefined);
  definir('funcao', dados.funcao);
  definir('setor', dados.setor ?? undefined);
  definir('centro_custo', dados.centroCusto);
  definir('tipo_contrato', dados.tipoContrato);
  definir('situacao', dados.situacao);
  definir('salario_base', dados.salarioBase);
  definir('salario_hora', dados.salarioHora ?? undefined);
  definir('carga_horaria_mensal', dados.cargaHorariaMensal);
  definir('vale_transporte', dados.valeTransporte === undefined ? undefined : deBooleano(dados.valeTransporte));
  definir('vale_transporte_valor_diario', dados.valeTransporteValorDiario ?? undefined);
  definir('pontos_comissao', dados.pontosComissao);
  definir('dependentes_irrf', dados.dependentesIRRF);
  definir('dependentes_salario_familia', dados.dependentesSalarioFamilia);
  definir('insalubridade_percentual', dados.insalubridadePercentual ?? undefined);
  definir('periculosidade', dados.periculosidade === undefined ? undefined : deBooleano(dados.periculosidade));
  definir('admissao', dados.admissao);
  definir('demissao', dados.demissao ?? undefined);
  definir('observacoes', dados.observacoes ?? undefined);
  definir('banco_codigo', dados.bancoCodigo ?? undefined);
  definir('banco_nome', dados.bancoNome ?? undefined);
  definir('agencia', dados.agencia ?? undefined);
  definir('agencia_digito', dados.agenciaDigito ?? undefined);
  definir('conta', dados.conta ?? undefined);
  definir('conta_digito', dados.contaDigito ?? undefined);
  definir('tipo_conta', dados.tipoConta ?? undefined);
  definir('tipo_pix', dados.tipoPix ?? undefined);
  definir('chave_pix', dados.chavePix ?? undefined);

  return mapa;
}

export function criarColaborador(tenantId: string, dados: ColaboradorEntrada): Colaborador {
  const db = obterBanco();
  const id = novoId('col');
  const carimbo = agora();
  const matricula = dados.matricula?.trim() || proximaMatricula(tenantId);

  const mapa = paraColunas({ ...dados, matricula });
  // Colunas NOT NULL sem default precisam de valor mesmo quando o corpo omite.
  if (!mapa.has('vale_transporte')) mapa.set('vale_transporte', 0);
  if (!mapa.has('periculosidade')) mapa.set('periculosidade', 0);
  if (!mapa.has('carga_horaria_mensal')) mapa.set('carga_horaria_mensal', 220);
  if (!mapa.has('pontos_comissao')) mapa.set('pontos_comissao', 0);
  if (!mapa.has('dependentes_irrf')) mapa.set('dependentes_irrf', 0);
  if (!mapa.has('dependentes_salario_familia')) mapa.set('dependentes_salario_familia', 0);
  if (!mapa.has('salario_base')) mapa.set('salario_base', 0);

  const colunas = [...mapa.keys()];
  db.prepare<unknown[], unknown>(
    `INSERT INTO colaboradores (id, tenant_id, ${colunas.join(', ')}, criado_em, atualizado_em)
     VALUES (?, ?, ${colunas.map(() => '?').join(', ')}, ?, ?)`,
  ).run(id, tenantId, ...colunas.map((c) => mapa.get(c) ?? null), carimbo, carimbo);

  const criado = buscarColaborador(tenantId, id);
  if (!criado) throw new Error('Falha ao recarregar o colaborador recem-criado.');
  return criado;
}

export function atualizarColaborador(
  tenantId: string,
  id: string,
  dados: Partial<ColaboradorEntrada>,
): Colaborador | null {
  const mapa = paraColunas(dados);
  if (mapa.size > 0) {
    const colunas = [...mapa.keys()];
    obterBanco()
      .prepare<unknown[], unknown>(
        `UPDATE colaboradores SET ${colunas.map((c) => `${c} = ?`).join(', ')}, atualizado_em = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(...colunas.map((c) => mapa.get(c) ?? null), agora(), tenantId, id);
  }
  return buscarColaborador(tenantId, id);
}

export function removerColaborador(tenantId: string, id: string): boolean {
  const resultado = obterBanco()
    .prepare<[string, string], unknown>('DELETE FROM colaboradores WHERE tenant_id = ? AND id = ?')
    .run(tenantId, id);
  return resultado.changes > 0;
}

/** Quantos itens de folha existem para o colaborador (bloqueia exclusao). */
export function contarItensDeFolha(tenantId: string, colaboradorId: string): number {
  return (
    obterBanco()
      .prepare<[string, string], { total: number }>(
        'SELECT COUNT(*) AS total FROM itens_folha WHERE tenant_id = ? AND colaborador_id = ?',
      )
      .get(tenantId, colaboradorId)?.total ?? 0
  );
}

export function listarCentrosDeCusto(tenantId: string): string[] {
  return obterBanco()
    .prepare<[string], { centro_custo: string }>(
      'SELECT DISTINCT centro_custo FROM colaboradores WHERE tenant_id = ? ORDER BY centro_custo',
    )
    .all(tenantId)
    .map((l) => l.centro_custo);
}
