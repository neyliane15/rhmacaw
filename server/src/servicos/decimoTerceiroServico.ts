/**
 * Decimo terceiro salario: previa do ano e geracao da folha de cada parcela.
 *
 * A 1a parcela e adiantamento puro (sem encargos) e a 2a carrega o INSS e o
 * IRRF calculados sobre o valor integral — quem faz essa conta e
 * `calcularDecimoTerceiro`; aqui so montamos a folha correspondente.
 */
import type { Colaborador, Competencia, DataISO, DecimoTerceiro, Folha, Verba } from '@rhmacaw/shared';
import { REGIMES_CONTRATO, arredondar, calcularDecimoTerceiro, somar } from '@rhmacaw/shared';
import { emTransacao } from '../db/conexao.js';
import { registrar } from '../db/repositorios/auditoria.js';
import * as repoColaboradores from '../db/repositorios/colaboradores.js';
import * as repoFaltas from '../db/repositorios/faltas.js';
import * as repoFolhas from '../db/repositorios/folhas.js';
import { erroConflito, erroNaoEncontrado, erroNaoProcessavel } from '../erros.js';
import type { FolhaCompleta } from '../tipos.js';
import { mediasDeComissoes } from './comum.js';

export type Parcela = 1 | 2;

/** Faltas injustificadas mes a mes: mais de 15 num mes derruba o avo (art. 1o, par. 1o). */
function faltasPorMes(tenantId: string, colaboradorId: string, ano: number): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const falta of repoFaltas.listarFaltas(tenantId, { colaboradorId, de: `${ano}-01-01`, ate: `${ano}-12-31` })) {
    if (falta.tipo !== 'FALTA' && falta.tipo !== 'SUSPENSAO') continue;
    const competencia = falta.data.slice(0, 7);
    mapa[competencia] = (mapa[competencia] ?? 0) + 1;
  }
  return mapa;
}

/**
 * Quem tem direito a 13o no ano.
 *
 * O filtro por tipo de contrato nao e cosmetico: socio (pro-labore), PJ e
 * estagiario NAO tem 13o salario — e o que `REGIMES_CONTRATO` ja declarava e
 * o que a Lei 4.090/62, a Lei 11.788/2008 e a natureza do contrato de PJ
 * impoem. Sem esse filtro a folha de 13o pagava essas pessoas, e pagar 13o a
 * um PJ ainda serve de prova de vinculo empregaticio numa reclamatoria.
 */
function elegiveis(tenantId: string, ano: number): Colaborador[] {
  return repoColaboradores
    .listarTodos(tenantId)
    .filter((c) => REGIMES_CONTRATO[c.tipoContrato].temDecimoTerceiroEFerias)
    .filter((c) => c.admissao <= `${ano}-12-31`)
    .filter((c) => !c.demissao || c.demissao >= `${ano}-01-01`);
}

export function calcularAno(tenantId: string, ano: number, referencia?: DataISO): DecimoTerceiro[] {
  const medias = mediasDeComissoes(tenantId, `${ano}-12`);
  return elegiveis(tenantId, ano)
    .map((colaborador) => {
      const entrada = {
        colaborador,
        ano,
        mediaVariaveis: medias.get(colaborador.id) ?? 0,
        faltasPorMes: faltasPorMes(tenantId, colaborador.id, ano),
        ...(referencia ? { referencia } : {}),
      };
      return calcularDecimoTerceiro(entrada);
    })
    .filter((d) => d.avos > 0)
    .sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, 'pt-BR'));
}

function verbasDaParcela(decimo: DecimoTerceiro, parcela: Parcela): Verba[] {
  const verba = (codigo: string, descricao: string, natureza: Verba['natureza'], referencia: string, valor: number): Verba => ({
    codigo,
    descricao,
    natureza,
    referencia,
    valor: arredondar(valor),
    baseINSS: false,
    baseIRRF: false,
    baseFGTS: false,
  });

  if (parcela === 1) {
    return [verba('050', '13o salario - 1a parcela', 'PROVENTO', `${decimo.avos}/12`, decimo.primeiraParcela)];
  }
  const linhas: Verba[] = [
    verba('051', '13o salario - 2a parcela', 'PROVENTO', `${decimo.avos}/12`, decimo.segundaParcelaBruta),
  ];
  if (decimo.inss > 0) linhas.push(verba('150', 'INSS sobre 13o', 'DESCONTO', 'integral', decimo.inss));
  if (decimo.irrf > 0) linhas.push(verba('151', 'IRRF sobre 13o', 'DESCONTO', 'exclusiva na fonte', decimo.irrf));
  linhas.push(verba('950', '13o integral (informativo)', 'INFORMATIVA', `${decimo.avos}/12`, decimo.valorIntegral));
  return linhas;
}

/**
 * Gera a folha da parcela. A competencia e novembro para a 1a e dezembro para a
 * 2a, que sao os prazos legais de pagamento (Lei 4.090/62, art. 2o).
 */
export function processarParcela(
  tenantId: string,
  ano: number,
  parcela: Parcela,
  dataPagamento: DataISO,
  usuarioId: string | null,
): FolhaCompleta {
  const tipo = parcela === 1 ? 'DECIMO_TERCEIRO_1' : 'DECIMO_TERCEIRO_2';
  const competencia: Competencia = parcela === 1 ? `${ano}-11` : `${ano}-12`;

  const existente = repoFolhas.buscarFolhaAtiva(tenantId, competencia, tipo);
  if (existente && existente.status !== 'RASCUNHO') {
    throw erroConflito(`A folha de 13o (${parcela}a parcela) de ${ano} esta ${existente.status}.`);
  }

  const calculos = calcularAno(tenantId, ano, dataPagamento);
  if (calculos.length === 0) throw erroNaoProcessavel(`Nenhum colaborador com avos de 13o em ${ano}.`);

  const cadastros = new Map(repoColaboradores.listarTodos(tenantId).map((c) => [c.id, c]));
  const itens: repoFolhas.DadosItem[] = [];

  for (const decimo of calculos) {
    const colaborador = cadastros.get(decimo.colaboradorId);
    if (!colaborador) continue;

    const verbas = verbasDaParcela(decimo, parcela);
    const proventos = somar(...verbas.filter((v) => v.natureza === 'PROVENTO').map((v) => v.valor));
    const descontos = somar(...verbas.filter((v) => v.natureza === 'DESCONTO').map((v) => v.valor));
    const liquido = arredondar(proventos - descontos);

    itens.push({
      colaboradorId: colaborador.id,
      colaboradorNome: colaborador.nome,
      funcao: colaborador.funcao,
      centroCusto: colaborador.centroCusto,
      salarioBase: colaborador.salarioBase,
      diasTrabalhados: 0,
      faltasDias: 0,
      faltasHoras: 0,
      descontoFaltas: 0,
      descontoDSR: 0,
      // A media de comissoes ja integra a base do 13o; aparece aqui para conferencia.
      comissoes: decimo.mediaComissoes,
      horasExtras: 0,
      adicionalNoturno: 0,
      outrosProventos: proventos,
      descontoValeTransporte: 0,
      outrosDescontos: descontos,
      baseINSS: parcela === 2 ? decimo.valorIntegral : 0,
      inss: parcela === 2 ? decimo.inss : 0,
      baseIRRF: parcela === 2 ? decimo.valorIntegral : 0,
      irrf: parcela === 2 ? decimo.irrf : 0,
      baseFGTS: REGIMES_CONTRATO[colaborador.tipoContrato].temFGTS ? proventos : 0,
      fgts: REGIMES_CONTRATO[colaborador.tipoContrato].temFGTS ? arredondar(proventos * 0.08) : 0,
      salarioFamilia: 0,
      totalProventos: proventos,
      totalDescontos: descontos,
      salarioLiquido: liquido,
      comissoesAdiantadas: 0,
      valorTransferir: liquido,
      verbas,
      alertas: liquido < 0 ? ['Parcela liquida negativa: conferir adiantamentos ja pagos.'] : [],
      alertasReconhecidos: false,
      entradaManual: null,
      observacoes: `13o ${parcela}a parcela - ${decimo.avos}/12 avos`,
    });
  }

  return emTransacao(() => {
    const folha: Folha = existente
      ? existente
      : repoFolhas.criarFolha(tenantId, {
          competencia,
          tipo,
          status: 'RASCUNHO',
          descricao: `13o salario ${ano} - ${parcela}a parcela`,
          dataPagamento,
          totalProventos: 0,
          totalDescontos: 0,
          totalLiquido: 0,
          totalComissoesAdiantadas: 0,
          totalTransferir: 0,
          quantidadeColaboradores: 0,
        });

    repoFolhas.substituirItens(tenantId, folha.id, itens);
    repoFolhas.atualizarFolha(tenantId, {
      ...folha,
      dataPagamento,
      totalProventos: somar(...itens.map((i) => i.totalProventos)),
      totalDescontos: somar(...itens.map((i) => i.totalDescontos)),
      totalLiquido: somar(...itens.map((i) => i.salarioLiquido)),
      totalComissoesAdiantadas: 0,
      totalTransferir: somar(...itens.map((i) => i.valorTransferir)),
      quantidadeColaboradores: itens.length,
    });
    registrar(tenantId, usuarioId, 'decimo-terceiro:processar', 'folha', folha.id, { ano, parcela });

    const detalhada = repoFolhas.detalharFolha(tenantId, folha.id);
    if (!detalhada) throw erroNaoEncontrado('Folha');
    return detalhada;
  });
}
