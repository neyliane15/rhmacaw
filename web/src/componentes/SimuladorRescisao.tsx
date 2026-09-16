import { useState } from 'react';
import {
  MOTIVOS_RESCISAO,
  TIPOS_AVISO,
  formatarBRL,
  formatarDataBR,
  hojeISO,
  type Colaborador,
  type MotivoRescisao,
  type Rescisao,
  type ResultadoRescisao,
  type TipoAviso,
  type Verba,
} from '@rhmacaw/shared';
import * as apiColaboradores from '../api/colaboradores.js';
import * as apiRescisoes from '../api/rescisoes.js';
import type { EntradaRescisaoApi } from '../api/tipos.js';
import { useAcao } from '../ganchos/useRequisicao.js';
import { ROTULO_AVISO, ROTULO_MOTIVO } from '../util/rotulos.js';
import { Alerta } from './Alerta.js';
import { CampoSelect, CampoTexto } from './Campo.js';
import { Girando } from './Carregando.js';
import { Modal } from './Modal.js';
import { MoedaInput } from './MoedaInput.js';
import { TabelaVerbas } from './TabelaVerbas.js';

/** Campos comuns a `Rescisao` (gravada) e `ResultadoRescisao` (simulada). */
export interface PreviaRescisao {
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
  habilitaSeguroDesemprego: boolean;
  verbas: Verba[];
  prazoPagamento?: string;
  alertas?: string[];
}

export function normalizarPrevia(bruto: Rescisao | ResultadoRescisao): PreviaRescisao {
  return {
    diasAvisoPrevio: bruto.diasAvisoPrevio,
    saldoSalario: bruto.saldoSalario,
    avisoPrevioIndenizado: bruto.avisoPrevioIndenizado,
    decimoTerceiroProporcional: bruto.decimoTerceiroProporcional,
    feriasVencidas: bruto.feriasVencidas,
    tercoFeriasVencidas: bruto.tercoFeriasVencidas,
    feriasProporcionais: bruto.feriasProporcionais,
    tercoFeriasProporcionais: bruto.tercoFeriasProporcionais,
    saldoComissoes: bruto.saldoComissoes,
    outrosProventos: bruto.outrosProventos,
    totalProventos: bruto.totalProventos,
    inss: bruto.inss,
    irrf: bruto.irrf,
    avisoPrevioDescontado: bruto.avisoPrevioDescontado,
    outrosDescontos: bruto.outrosDescontos,
    totalDescontos: bruto.totalDescontos,
    liquido: bruto.liquido,
    saldoFGTS: bruto.saldoFGTS,
    multaFGTS: bruto.multaFGTS,
    habilitaSeguroDesemprego: bruto.habilitaSeguroDesemprego,
    verbas: bruto.verbas,
    prazoPagamento: 'prazoPagamento' in bruto ? bruto.prazoPagamento : undefined,
    alertas: 'alertas' in bruto ? bruto.alertas : undefined,
  };
}

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  colaborador: Colaborador;
  /** `cadastro` usa POST /colaboradores/:id/demitir para a previa. */
  origem?: 'cadastro' | 'rescisões';
  aoEfetivar?: (rescisao: Rescisao) => void;
}

/**
 * Simulador do TRCT: calcula e mostra verba a verba antes de gravar. Efetivar
 * e um segundo passo explicito — a prévia nunca altera o cadastro.
 */
export function SimuladorRescisao({ aberto, aoFechar, colaborador, origem = 'rescisões', aoEfetivar }: Props): JSX.Element {
  const hoje = hojeISO();
  const [motivo, setMotivo] = useState<MotivoRescisao>('SEM_JUSTA_CAUSA');
  const [tipoAviso, setTipoAviso] = useState<TipoAviso>('INDENIZADO');
  const [dataAviso, setDataAviso] = useState(hoje);
  const [dataDesligamento, setDataDesligamento] = useState(hoje);
  const [diasFeriasVencidas, setDiasFeriasVencidas] = useState(0);
  const [saldoFGTS, setSaldoFGTS] = useState(0);
  const [mediaComissoes, setMediaComissoes] = useState(0);
  const [decimoAdiantado, setDecimoAdiantado] = useState(0);
  const [saldoComissoes, setSaldoComissoes] = useState(0);
  const [outrosProventos, setOutrosProventos] = useState(0);
  const [outrosDescontos, setOutrosDescontos] = useState(0);
  const [faltas, setFaltas] = useState(0);
  const [previa, setPrevia] = useState<PreviaRescisao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const acao = useAcao();

  function montarEntrada(): EntradaRescisaoApi {
    return {
      colaboradorId: colaborador.id,
      dataAviso,
      dataDesligamento,
      motivo,
      tipoAviso,
      mediaComissoes,
      diasFeriasVencidas,
      faltasInjustificadasNoPeriodo: faltas,
      saldoFGTS,
      decimoTerceiroAdiantado: decimoAdiantado,
      saldoComissoes,
      outrosProventos,
      outrosDescontos,
    };
  }

  async function simular(): Promise<void> {
    setConfirmando(false);
    const entrada = montarEntrada();
    const resultado =
      origem === 'cadastro'
        ? await acao.executar(() => {
            const { colaboradorId: _ignorado, ...resto } = entrada;
            return apiColaboradores.demitir(colaborador.id, resto);
          })
        : await acao.executar(() => apiRescisoes.simular(entrada));
    if (resultado) setPrevia(normalizarPrevia(resultado));
  }

  async function efetivar(): Promise<void> {
    const gravada = await acao.executar(() => apiRescisoes.efetivar(montarEntrada()));
    if (gravada) {
      aoEfetivar?.(gravada);
      aoFechar();
    }
  }

  const dataInvalida = dataDesligamento < dataAviso;

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="largo"
      titulo={`Rescisao de ${colaborador.nome}`}
      subtitulo={
        <span>
          {colaborador.funcao} · {colaborador.centroCusto} · admitido em {formatarDataBR(colaborador.admissao)}
        </span>
      }
      rodape={
        <>
          <button type="button" className="botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-secundario" onClick={simular} disabled={acao.executando || dataInvalida}>
            {acao.executando && !confirmando ? <Girando rotulo="Calculando" /> : 'Calcular TRCT'}
          </button>
          {previa ? (
            confirmando ? (
              <button type="button" className="botao-perigo" onClick={efetivar} disabled={acao.executando}>
                {acao.executando ? <Girando rotulo="Gravando" /> : 'Confirmar e desligar'}
              </button>
            ) : (
              <button type="button" className="botao-perigo" onClick={() => setConfirmando(true)}>
                Efetivar rescisao
              </button>
            )
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {acao.erro ? <Alerta nivel="critico" titulo="Não foi possível calcular">{acao.erro}</Alerta> : null}
        {dataInvalida ? (
          <Alerta nivel="atencao" titulo="Datas invertidas">
            A data de desligamento não pode ser anterior a data do aviso.
          </Alerta>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoSelect
            rotulo="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoRescisao)}
            opcoes={MOTIVOS_RESCISAO.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO[m] }))}
          />
          <CampoSelect
            rotulo="Tipo de aviso previo"
            value={tipoAviso}
            onChange={(e) => setTipoAviso(e.target.value as TipoAviso)}
            opcoes={TIPOS_AVISO.map((t) => ({ valor: t, rotulo: ROTULO_AVISO[t] }))}
          />
          <CampoTexto rotulo="Data do aviso" type="date" value={dataAviso} onChange={(e) => setDataAviso(e.target.value)} />
          <CampoTexto
            rotulo="Data do desligamento"
            type="date"
            value={dataDesligamento}
            onChange={(e) => setDataDesligamento(e.target.value)}
          />
          <CampoTexto
            rotulo="Dias de férias vencidas"
            type="number"
            min={0}
            max={30}
            value={diasFeriasVencidas}
            onChange={(e) => setDiasFeriasVencidas(Number(e.target.value))}
          />
          <CampoTexto
            rotulo="Faltas injustificadas no período"
            type="number"
            min={0}
            value={faltas}
            onChange={(e) => setFaltas(Number(e.target.value))}
            dica="Reduz os dias de férias proporcionais."
          />
          <MoedaInput rotulo="Saldo do FGTS depositado" valor={saldoFGTS} aoMudar={setSaldoFGTS} dica="Base da multa rescisoria." />
          <MoedaInput rotulo="Média de comissoes (12 meses)" valor={mediaComissoes} aoMudar={setMediaComissoes} />
          <MoedaInput rotulo="13o já adiantado no ano" valor={decimoAdiantado} aoMudar={setDecimoAdiantado} />
          <MoedaInput rotulo="Saldo de comissões a pagar" valor={saldoComissoes} aoMudar={setSaldoComissoes} />
          <MoedaInput rotulo="Outros proventos" valor={outrosProventos} aoMudar={setOutrosProventos} />
          <MoedaInput rotulo="Outros descontos" valor={outrosDescontos} aoMudar={setOutrosDescontos} />
        </div>

        {previa ? (
          <div className="space-y-3">
            {(previa.alertas ?? []).map((texto) => (
              <Alerta key={texto} nivel="atencao">
                {texto}
              </Alerta>
            ))}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <ResumoNumero rotulo="Total de proventos" valor={formatarBRL(previa.totalProventos)} />
              <ResumoNumero rotulo="Total de descontos" valor={formatarBRL(previa.totalDescontos)} />
              <ResumoNumero rotulo="Líquido do TRCT" valor={formatarBRL(previa.liquido)} destaque />
              <ResumoNumero rotulo="Multa do FGTS" valor={formatarBRL(previa.multaFGTS)} />
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-[var(--texto-3)]">
              <span>Aviso previo: {previa.diasAvisoPrevio} dias</span>
              {previa.prazoPagamento ? <span>Prazo de pagamento: {formatarDataBR(previa.prazoPagamento)}</span> : null}
              <span>Seguro-desemprego: {previa.habilitaSeguroDesemprego ? 'habilitado' : 'não habilitado'}</span>
            </div>

            <TabelaVerbas verbas={previa.verbas} />

            {confirmando ? (
              <Alerta nivel="critico" titulo="Confirmar o desligamento?">
                Gravar a rescisão muda a situação de {colaborador.nome} para DEMITIDO e preenche a data de demissao. Essa ação não se
                desfaz sozinha.
              </Alerta>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--borda-forte)] px-3 py-6 text-center text-sm text-[var(--texto-3)]">
            Preencha os dados e clique em <strong>Calcular TRCT</strong> para ver o termo verba a verba antes de gravar.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ResumoNumero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }): JSX.Element {
  return (
    <div className={`rounded-md border px-3 py-2 ${destaque ? 'trilho border-ouro-300' : 'border-[var(--borda)] bg-[var(--superficie-sutil)]'}`}>
      <p className="sobrancelha">{rotulo}</p>
      <p className={`num mt-0.5 font-display text-lg font-semibold tabular-nums ${destaque ? 'text-ouro-600 dark:text-ouro-200' : ''}`}>{valor}</p>
    </div>
  );
}
