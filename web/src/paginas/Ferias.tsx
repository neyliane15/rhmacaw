import { useState } from 'react';
import {
  STATUS_FERIAS,
  formatarBRL,
  formatarDataBR,
  hojeISO,
  somarDias,
  type Ferias as FeriasDominio,
  type FeriasEntrada,
  type ResultadoFerias,
  type SaldoFerias,
  type StatusFerias,
} from '@rhmacaw/shared';
import * as apiFerias from '../api/ferias.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoCheck, CampoTexto } from '../componentes/Campo.js';
import { Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeLixeira, IconePalmeira } from '../componentes/Icones.js';
import { Modal } from '../componentes/Modal.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero } from '../util/formato.js';
import { ROTULO_STATUS_FERIAS, TOM_STATUS_FERIAS } from '../util/rotulos.js';

export function Ferias(): JSX.Element {
  const { pode } = useAuth();
  const podeEditar = pode('ferias:criar');
  const anoAtual = Number(hojeISO().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [status, setStatus] = useState<StatusFerias | ''>('');
  const [programando, setProgramando] = useState<SaldoFerias | null>(null);
  const acao = useAcao();

  const saldos = useRequisicao(() => apiFerias.saldos(), []);
  const programadas = useRequisicao(() => apiFerias.listar({ ano, status: status || undefined }), [ano, status]);

  const linhasSaldo = saldos.dados ?? [];
  const vencidas = linhasSaldo.filter((s) => s.vencida);
  const aVencer = linhasSaldo.filter((s) => !s.vencida && s.diasParaVencer <= 90);

  const colunasSaldo: Coluna<SaldoFerias>[] = [
    {
      chave: 'nome',
      titulo: 'Colaborador',
      valor: (s) => s.colaboradorNome,
      render: (s) => <span className="font-medium">{s.colaboradorNome}</span>,
    },
    {
      chave: 'aquisitivo',
      titulo: 'Periodo aquisitivo',
      valor: (s) => s.periodoAquisitivoInicio,
      render: (s) => (
        <span className="font-mono text-xs text-[var(--texto-3)]">
          {formatarDataBR(s.periodoAquisitivoInicio)} — {formatarDataBR(s.periodoAquisitivoFim)}
        </span>
      ),
    },
    {
      chave: 'limite',
      titulo: 'Limite concessivo',
      largura: '9rem',
      valor: (s) => s.limiteConcessivo,
      render: (s) => (
        <span className={`font-mono text-xs font-semibold ${s.vencida ? 'text-critico' : ''}`}>{formatarDataBR(s.limiteConcessivo)}</span>
      ),
    },
    {
      chave: 'diasParaVencer',
      titulo: 'Prazo',
      alinhar: 'direita',
      largura: '7rem',
      valor: (s) => s.diasParaVencer,
      render: (s) =>
        s.vencida ? (
          <Badge tom="critico">Vencida</Badge>
        ) : s.diasParaVencer <= 90 ? (
          <Badge tom="atencao">{s.diasParaVencer} dias</Badge>
        ) : (
          <span className="num text-[var(--texto-3)]">{s.diasParaVencer} dias</span>
        ),
    },
    { chave: 'direito', titulo: 'Direito', alinhar: 'direita', largura: '5rem', valor: (s) => s.diasDireito },
    { chave: 'gozados', titulo: 'Gozados', alinhar: 'direita', largura: '5.5rem', valor: (s) => s.diasGozados },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      alinhar: 'direita',
      largura: '5rem',
      valor: (s) => s.diasSaldo,
      render: (s) => <span className="font-semibold">{s.diasSaldo}</span>,
    },
    { chave: 'faltas', titulo: 'Faltas', alinhar: 'direita', largura: '5rem', valor: (s) => s.faltasNoPeriodo, titulo2: 'Faltas injustificadas no periodo aquisitivo' },
    {
      chave: 'acoes',
      titulo: '',
      largura: '7rem',
      ordenavel: false,
      render: (s) =>
        podeEditar && s.diasSaldo > 0 ? (
          <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => setProgramando(s)}>
            Programar
          </button>
        ) : null,
    },
  ];

  const colunasProgramadas: Coluna<FeriasDominio>[] = [
    {
      chave: 'gozo',
      titulo: 'Periodo de gozo',
      valor: (f) => f.inicioGozo,
      render: (f) => (
        <span className="font-mono text-xs">
          {formatarDataBR(f.inicioGozo)} — {formatarDataBR(f.fimGozo)}
        </span>
      ),
    },
    { chave: 'dias', titulo: 'Dias', alinhar: 'direita', largura: '4.5rem', valor: (f) => f.diasGozo },
    { chave: 'abono', titulo: 'Abono', alinhar: 'direita', largura: '5rem', valor: (f) => f.diasAbono, titulo2: 'Dias vendidos (abono pecuniario)' },
    { chave: 'ferias', titulo: 'Ferias', alinhar: 'direita', valor: (f) => f.valorFerias, render: (f) => formatarBRL(f.valorFerias) },
    { chave: 'terco', titulo: '1/3', alinhar: 'direita', valor: (f) => f.valorTerco, render: (f) => formatarBRL(f.valorTerco) },
    { chave: 'inss', titulo: 'INSS', alinhar: 'direita', valor: (f) => f.inss, render: (f) => formatarBRL(f.inss) },
    { chave: 'irrf', titulo: 'IRRF', alinhar: 'direita', valor: (f) => f.irrf, render: (f) => formatarBRL(f.irrf) },
    {
      chave: 'liquido',
      titulo: 'Liquido',
      alinhar: 'direita',
      valor: (f) => f.liquido,
      render: (f) => <span className="font-semibold">{formatarBRL(f.liquido)}</span>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '8rem',
      valor: (f) => f.status,
      render: (f) => <Badge tom={TOM_STATUS_FERIAS[f.status]}>{ROTULO_STATUS_FERIAS[f.status]}</Badge>,
    },
    {
      chave: 'acoes',
      titulo: '',
      largura: '3rem',
      ordenavel: false,
      render: (f) =>
        podeEditar && f.status === 'PROGRAMADA' ? (
          <button
            type="button"
            aria-label={`Cancelar ferias de ${formatarDataBR(f.inicioGozo)}`}
            title="Cancelar programacao"
            className="botao-fantasma px-1.5 py-1 text-critico"
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await acao.executar(() => apiFerias.remover(f.id));
              if (ok !== null) {
                programadas.recarregar();
                saldos.recarregar();
              }
            }}
          >
            <IconeLixeira />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha="Descanso anual"
        titulo="Ferias"
        descricao="Saldos por vencimento e programacao com recibo calculado antes de gravar."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Com saldo em aberto" valor={formatarNumero(linhasSaldo.filter((s) => s.diasSaldo > 0).length, 0)} />
        <Indicador
          rotulo="Periodos vencidos"
          valor={formatarNumero(vencidas.length, 0)}
          apoio="Pagamento em dobro, art. 137 da CLT"
          tom={vencidas.length > 0 ? 'critico' : 'neutro'}
        />
        <Indicador rotulo="Vencem em 90 dias" valor={formatarNumero(aVencer.length, 0)} apoio="Programe antes de virar dobro" />
        <Indicador rotulo="Ferias programadas no ano" valor={formatarNumero((programadas.dados ?? []).length, 0)} />
      </div>

      {acao.erro ? (
        <Alerta nivel="critico" titulo="Operacao recusada" aoFechar={acao.limparErro}>
          {acao.erro}
        </Alerta>
      ) : null}

      {vencidas.length > 0 ? (
        <Alerta nivel="critico" titulo={`${vencidas.length} periodo(s) de ferias vencido(s)`}>
          Passado o limite concessivo, a remuneracao das ferias e devida em dobro. Priorize:{' '}
          {vencidas
            .slice(0, 3)
            .map((s) => s.colaboradorNome)
            .join(', ')}
          {vencidas.length > 3 ? ` e mais ${vencidas.length - 3}.` : '.'}
        </Alerta>
      ) : null}

      <section className="space-y-2">
        <h2 className="sobrancelha">Painel de saldos — ordenado por vencimento</h2>
        <Tabela
          colunas={colunasSaldo}
          dados={linhasSaldo}
          chaveLinha={(s) => `${s.colaboradorId}-${s.periodoAquisitivoInicio}`}
          carregando={saldos.carregando}
          erro={saldos.erro}
          busca
          placeholderBusca="Buscar colaborador"
          denso
          legenda="Saldos de ferias por colaborador"
          ordemInicial={{ chave: 'limite', direcao: 'asc' }}
          classeLinha={(s) => (s.vencida ? 'bg-critico/[0.07]' : '')}
          vazio={<EstadoVazio icone={<IconePalmeira />} titulo="Nenhum saldo apurado" descricao="Cadastre colaboradores ativos para ver os periodos aquisitivos." />}
        />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sobrancelha">Ferias programadas</h2>
          <div className="flex items-center gap-2">
            <label>
              <span className="sr-only">Ano</span>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="campo w-auto">
                {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFerias | '')} className="campo w-auto">
                <option value="">Todos os status</option>
                {STATUS_FERIAS.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_FERIAS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <Tabela
          colunas={colunasProgramadas}
          dados={programadas.dados ?? []}
          chaveLinha={(f) => f.id}
          carregando={programadas.carregando}
          erro={programadas.erro}
          denso
          comRodape={false}
          legenda="Ferias programadas no ano"
          ordemInicial={{ chave: 'gozo', direcao: 'asc' }}
          vazio={<EstadoVazio titulo="Nenhuma ferias programada" descricao="Use o botao Programar no painel de saldos para simular e agendar." />}
        />
      </section>

      {programando ? (
        <ModalProgramacao
          saldo={programando}
          aoFechar={() => setProgramando(null)}
          aoGravar={() => {
            setProgramando(null);
            saldos.recarregar();
            programadas.recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function ModalProgramacao({
  saldo,
  aoFechar,
  aoGravar,
}: {
  saldo: SaldoFerias;
  aoFechar: () => void;
  aoGravar: () => void;
}): JSX.Element {
  const [inicioGozo, setInicioGozo] = useState(somarDias(hojeISO(), 30));
  const [diasGozo, setDiasGozo] = useState(Math.min(30, saldo.diasSaldo));
  const [diasAbono, setDiasAbono] = useState(0);
  const [adiantarDecimo, setAdiantarDecimo] = useState(false);
  const [recibo, setRecibo] = useState<ResultadoFerias | null>(null);
  const acao = useAcao();

  function entrada(): FeriasEntrada {
    return {
      colaboradorId: saldo.colaboradorId,
      periodoAquisitivoInicio: saldo.periodoAquisitivoInicio,
      periodoAquisitivoFim: saldo.periodoAquisitivoFim,
      inicioGozo,
      diasGozo,
      diasAbono,
      adiantarDecimoTerceiro: adiantarDecimo,
    };
  }

  async function simular(): Promise<void> {
    const resultado = await acao.executar(() => apiFerias.simular(entrada()));
    if (resultado) setRecibo(resultado);
  }

  async function gravar(): Promise<void> {
    const gravada = await acao.executar(() => apiFerias.programar(entrada()));
    if (gravada) aoGravar();
  }

  const excedeSaldo = diasGozo + diasAbono > saldo.diasSaldo;
  const abonoAcimaDoLimite = diasAbono > Math.floor(saldo.diasDireito / 3);

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="largo"
      titulo={`Programar ferias de ${saldo.colaboradorNome}`}
      subtitulo={`Periodo aquisitivo ${formatarDataBR(saldo.periodoAquisitivoInicio)} a ${formatarDataBR(saldo.periodoAquisitivoFim)} · saldo de ${saldo.diasSaldo} dias`}
      rodape={
        <>
          <button type="button" className="botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-secundario" onClick={simular} disabled={acao.executando || excedeSaldo}>
            {acao.executando && !recibo ? <Girando rotulo="Calculando" /> : 'Simular recibo'}
          </button>
          <button type="button" className="botao-primario" onClick={gravar} disabled={acao.executando || !recibo || excedeSaldo}>
            {acao.executando && recibo ? <Girando rotulo="Gravando" /> : 'Gravar programacao'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {acao.erro ? <Alerta nivel="critico" titulo="Nao foi possivel calcular">{acao.erro}</Alerta> : null}
        {excedeSaldo ? (
          <Alerta nivel="atencao" titulo="Dias acima do saldo">
            Gozo e abono somam {diasGozo + diasAbono} dias, mas o saldo disponivel e de {saldo.diasSaldo}.
          </Alerta>
        ) : null}
        {abonoAcimaDoLimite ? (
          <Alerta nivel="atencao" titulo="Abono acima do limite legal">
            O abono pecuniario nao pode passar de 1/3 do direito ({Math.floor(saldo.diasDireito / 3)} dias).
          </Alerta>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoTexto rotulo="Inicio do gozo" type="date" value={inicioGozo} onChange={(e) => setInicioGozo(e.target.value)} />
          <CampoTexto
            rotulo="Dias de gozo"
            type="number"
            min={1}
            max={30}
            value={diasGozo}
            onChange={(e) => setDiasGozo(Number(e.target.value))}
          />
          <CampoTexto
            rotulo="Dias de abono"
            type="number"
            min={0}
            max={10}
            value={diasAbono}
            onChange={(e) => setDiasAbono(Number(e.target.value))}
            dica="Venda de ate 1/3 das ferias."
          />
          <div className="flex items-end">
            <CampoCheck
              rotulo="Adiantar 1a parcela do 13o"
              descricao="Lei 4.749/65, art. 2o."
              marcado={adiantarDecimo}
              aoMudar={setAdiantarDecimo}
            />
          </div>
        </div>

        {recibo ? (
          <div className="space-y-3">
            {recibo.alertas.map((texto) => (
              <Alerta key={texto} nivel="atencao">
                {texto}
              </Alerta>
            ))}
            <div className="overflow-hidden rounded-md border border-[var(--borda)]">
              <table className="w-full text-sm">
                <caption className="sr-only">Recibo de ferias simulado</caption>
                <tbody>
                  <LinhaRecibo rotulo="Base de calculo" valor={recibo.baseCalculo} />
                  <LinhaRecibo rotulo="Ferias" valor={recibo.valorFerias} />
                  <LinhaRecibo rotulo="1/3 constitucional" valor={recibo.valorTerco} />
                  <LinhaRecibo rotulo="Abono pecuniario" valor={recibo.valorAbono} />
                  <LinhaRecibo rotulo="1/3 sobre o abono" valor={recibo.valorTercoAbono} />
                  <LinhaRecibo rotulo="Adiantamento do 13o" valor={recibo.valorAdiantamentoDecimo} />
                  <LinhaRecibo rotulo="Total de proventos" valor={recibo.totalProventos} forte />
                  <LinhaRecibo rotulo="INSS" valor={-recibo.inss} />
                  <LinhaRecibo rotulo="IRRF" valor={-recibo.irrf} />
                  <LinhaRecibo rotulo="Liquido a receber" valor={recibo.liquido} forte destaque />
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--texto-3)]">
              Retorno ao trabalho em {formatarDataBR(somarDias(recibo.fimGozo, 1))}. Abono e 1/3 sobre o abono sao indenizatorios: nao
              sofrem INSS nem IRRF.
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-[var(--borda-forte)] px-3 py-6 text-center text-sm text-[var(--texto-3)]">
            Ajuste os dias e clique em <strong>Simular recibo</strong> para ver o valor antes de gravar.
          </p>
        )}
      </div>
    </Modal>
  );
}

function LinhaRecibo({ rotulo, valor, forte = false, destaque = false }: { rotulo: string; valor: number; forte?: boolean; destaque?: boolean }): JSX.Element {
  return (
    <tr className={`border-b border-[var(--borda)] last:border-0 ${destaque ? 'trilho' : ''}`}>
      <td className={`px-3 py-1.5 ${forte ? 'font-semibold' : ''}`}>{rotulo}</td>
      <td className={`num px-3 py-1.5 text-right tabular-nums ${forte ? 'font-semibold' : ''} ${valor < 0 ? 'text-critico' : ''}`}>
        {formatarBRL(valor)}
      </td>
    </tr>
  );
}
