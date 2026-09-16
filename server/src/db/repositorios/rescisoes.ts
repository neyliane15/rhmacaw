import type { MotivoRescisao, Rescisao, StatusFolha, TipoAviso, Verba } from '@rhmacaw/shared';
import { agora, novoId, obterBanco } from '../conexao.js';
import { deBooleano, gravarJSON, lerJSON, paraBooleano } from './comum.js';

interface LinhaRescisao {
  id: string;
  tenant_id: string;
  colaborador_id: string;
  colaborador_nome: string;
  data_aviso: string;
  data_desligamento: string;
  motivo: string;
  tipo_aviso: string;
  dias_aviso_previo: number;
  saldo_salario: number;
  aviso_previo_indenizado: number;
  decimo_terceiro_proporcional: number;
  ferias_vencidas: number;
  terco_ferias_vencidas: number;
  ferias_proporcionais: number;
  terco_ferias_proporcionais: number;
  saldo_comissoes: number;
  outros_proventos: number;
  total_proventos: number;
  inss: number;
  irrf: number;
  aviso_previo_descontado: number;
  outros_descontos: number;
  total_descontos: number;
  liquido: number;
  saldo_fgts: number;
  multa_fgts: number;
  habilita_seguro_desemprego: number;
  verbas: string;
  status: string;
  criado_em: string;
}

const paraRescisao = (l: LinhaRescisao): Rescisao => ({
  id: l.id,
  tenantId: l.tenant_id,
  colaboradorId: l.colaborador_id,
  colaboradorNome: l.colaborador_nome,
  dataAviso: l.data_aviso,
  dataDesligamento: l.data_desligamento,
  motivo: l.motivo as MotivoRescisao,
  tipoAviso: l.tipo_aviso as TipoAviso,
  diasAvisoPrevio: l.dias_aviso_previo,
  saldoSalario: l.saldo_salario,
  avisoPrevioIndenizado: l.aviso_previo_indenizado,
  decimoTerceiroProporcional: l.decimo_terceiro_proporcional,
  feriasVencidas: l.ferias_vencidas,
  tercoFeriasVencidas: l.terco_ferias_vencidas,
  feriasProporcionais: l.ferias_proporcionais,
  tercoFeriasProporcionais: l.terco_ferias_proporcionais,
  saldoComissoes: l.saldo_comissoes,
  outrosProventos: l.outros_proventos,
  totalProventos: l.total_proventos,
  inss: l.inss,
  irrf: l.irrf,
  avisoPrevioDescontado: l.aviso_previo_descontado,
  outrosDescontos: l.outros_descontos,
  totalDescontos: l.total_descontos,
  liquido: l.liquido,
  saldoFGTS: l.saldo_fgts,
  multaFGTS: l.multa_fgts,
  habilitaSeguroDesemprego: paraBooleano(l.habilita_seguro_desemprego),
  verbas: lerJSON<Verba[]>(l.verbas, []),
  status: l.status as StatusFolha,
  criadoEm: l.criado_em,
});

export function listarRescisoes(tenantId: string, colaboradorId?: string): Rescisao[] {
  const partes = ['tenant_id = ?'];
  const args: unknown[] = [tenantId];
  if (colaboradorId) {
    partes.push('colaborador_id = ?');
    args.push(colaboradorId);
  }
  return obterBanco()
    .prepare<unknown[], LinhaRescisao>(
      `SELECT * FROM rescisoes WHERE ${partes.join(' AND ')} ORDER BY data_desligamento DESC`,
    )
    .all(...args)
    .map(paraRescisao);
}

export function buscarRescisao(tenantId: string, id: string): Rescisao | null {
  const linha = obterBanco()
    .prepare<[string, string], LinhaRescisao>('SELECT * FROM rescisoes WHERE tenant_id = ? AND id = ?')
    .get(tenantId, id);
  return linha ? paraRescisao(linha) : null;
}

export type DadosRescisao = Omit<Rescisao, 'id' | 'tenantId' | 'criadoEm'>;

export function criarRescisao(tenantId: string, dados: DadosRescisao): Rescisao {
  const rescisao: Rescisao = { ...dados, id: novoId('rsc'), tenantId, criadoEm: agora() };
  obterBanco()
    .prepare<unknown[], unknown>(
      `INSERT INTO rescisoes (
         id, tenant_id, colaborador_id, colaborador_nome, data_aviso, data_desligamento, motivo, tipo_aviso,
         dias_aviso_previo, saldo_salario, aviso_previo_indenizado, decimo_terceiro_proporcional, ferias_vencidas,
         terco_ferias_vencidas, ferias_proporcionais, terco_ferias_proporcionais, saldo_comissoes, outros_proventos,
         total_proventos, inss, irrf, aviso_previo_descontado, outros_descontos, total_descontos, liquido,
         saldo_fgts, multa_fgts, habilita_seguro_desemprego, verbas, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      rescisao.id,
      tenantId,
      rescisao.colaboradorId,
      rescisao.colaboradorNome,
      rescisao.dataAviso,
      rescisao.dataDesligamento,
      rescisao.motivo,
      rescisao.tipoAviso,
      rescisao.diasAvisoPrevio,
      rescisao.saldoSalario,
      rescisao.avisoPrevioIndenizado,
      rescisao.decimoTerceiroProporcional,
      rescisao.feriasVencidas,
      rescisao.tercoFeriasVencidas,
      rescisao.feriasProporcionais,
      rescisao.tercoFeriasProporcionais,
      rescisao.saldoComissoes,
      rescisao.outrosProventos,
      rescisao.totalProventos,
      rescisao.inss,
      rescisao.irrf,
      rescisao.avisoPrevioDescontado,
      rescisao.outrosDescontos,
      rescisao.totalDescontos,
      rescisao.liquido,
      rescisao.saldoFGTS,
      rescisao.multaFGTS,
      deBooleano(rescisao.habilitaSeguroDesemprego),
      gravarJSON(rescisao.verbas),
      rescisao.status,
      rescisao.criadoEm,
    );
  return rescisao;
}

export function atualizarStatusRescisao(tenantId: string, id: string, status: StatusFolha): void {
  obterBanco()
    .prepare<[string, string, string], unknown>('UPDATE rescisoes SET status = ? WHERE tenant_id = ? AND id = ?')
    .run(status, tenantId, id);
}
