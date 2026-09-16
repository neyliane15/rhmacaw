/** Utilitarios compartilhados pelos servicos de calculo. */
import type { Colaborador, Competencia } from '@rhmacaw/shared';
import {
  mediaComissoes,
  primeiroDiaDaCompetencia,
  somarMeses,
  ultimoDiaDaCompetencia,
} from '@rhmacaw/shared';
import { buscarColaborador } from '../db/repositorios/colaboradores.js';
import { comissoesPorColaboradorNoIntervalo } from '../db/repositorios/comissoes.js';
import { erroNaoEncontrado } from '../erros.js';

export function exigirColaborador(tenantId: string, colaboradorId: string): Colaborador {
  const colaborador = buscarColaborador(tenantId, colaboradorId);
  if (!colaborador) throw erroNaoEncontrado('Colaborador');
  return colaborador;
}

/** Lista das N competencias que antecedem (e incluem) a competencia informada. */
export function competenciasAnteriores(ate: Competencia, quantidade = 12): Competencia[] {
  const referencia = `${ate}-01`;
  const lista: Competencia[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    lista.push(somarMeses(referencia, -i).slice(0, 7));
  }
  return lista;
}

/**
 * Media de comissoes dos ultimos 12 meses por colaborador.
 *
 * Meses sem comissao entram como zero de proposito: a media do art. 142, par.
 * 3o da CLT e sobre o periodo, nao apenas sobre os meses em que houve pagamento.
 */
export function mediasDeComissoes(tenantId: string, ate: Competencia, quantidade = 12): Map<string, number> {
  const competencias = competenciasAnteriores(ate, quantidade);
  const primeira = competencias[0] ?? ate;
  const porColaborador = comissoesPorColaboradorNoIntervalo(tenantId, primeira, ate);

  const medias = new Map<string, number>();
  for (const [colaboradorId, porCompetencia] of porColaborador) {
    medias.set(colaboradorId, mediaComissoes(competencias.map((c) => porCompetencia.get(c) ?? 0), quantidade));
  }
  return medias;
}

/** O colaborador tem vinculo vivo em algum dia da competencia? */
export function vinculadoNaCompetencia(colaborador: Colaborador, competencia: Competencia): boolean {
  const inicio = primeiroDiaDaCompetencia(competencia);
  const fim = ultimoDiaDaCompetencia(competencia);
  if (colaborador.admissao > fim) return false;
  if (colaborador.demissao && colaborador.demissao < inicio) return false;
  // `DEMITIDO` sem data de demissao registrada e cadastro legado: fica de fora.
  if (colaborador.situacao === 'DEMITIDO' && !colaborador.demissao) return false;
  return true;
}
