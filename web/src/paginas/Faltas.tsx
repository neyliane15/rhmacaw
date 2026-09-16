import { useMemo, useState } from 'react';
import {
  TIPOS_FALTA,
  diaDaSemana,
  diasNoMes,
  formatarBRL,
  formatarDataBR,
  primeiroDiaDaCompetencia,
  rotuloCompetencia,
  somarDias,
  type Falta,
  type TipoFalta,
} from '@rhmacaw/shared';
import * as apiColaboradores from '../api/colaboradores.js';
import * as apiFaltas from '../api/faltas.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoSelect, CampoTexto } from '../componentes/Campo.js';
import { Carregando, Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeCalendario, IconeLixeira, IconeMais } from '../componentes/Icones.js';
import { Modal } from '../componentes/Modal.js';
import { SeletorCompetencia } from '../componentes/SeletorCompetencia.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useCompetencia } from '../contextos/CompetenciaContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero } from '../util/formato.js';
import { ROTULO_FALTA, TOM_FALTA } from '../util/rotulos.js';
import type { ResumoFaltasColaborador } from '../api/tipos.js';

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

export function Faltas(): JSX.Element {
  const { competencia, definir } = useCompetencia();
  const { pode } = useAuth();
  const podeEditar = pode('faltas:criar');

  const [colaboradorId, setColaboradorId] = useState('');
  const [tipo, setTipo] = useState<TipoFalta | ''>('');
  const [lancando, setLancando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Falta | null>(null);
  const acao = useAcao();

  const colaboradores = useRequisicao(() => apiColaboradores.listar({ porPagina: 500 }), []);
  const lista = useRequisicao(
    () => apiFaltas.listar({ competencia, colaboradorId: colaboradorId || undefined, tipo: tipo || undefined }),
    [competencia, colaboradorId, tipo],
  );
  const resumo = useRequisicao(() => apiFaltas.resumo(competencia), [competencia]);

  const nomePorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of colaboradores.dados?.itens ?? []) mapa.set(c.id, c.nome);
    return mapa;
  }, [colaboradores.dados]);

  const faltas = lista.dados ?? [];

  const porDia = useMemo(() => {
    const mapa = new Map<string, Falta[]>();
    for (const falta of faltas) {
      const atual = mapa.get(falta.data);
      if (atual) atual.push(falta);
      else mapa.set(falta.data, [falta]);
    }
    return mapa;
  }, [faltas]);

  // Grade do mes comecando na segunda-feira (semana ISO).
  const grade = useMemo(() => {
    const primeiro = primeiroDiaDaCompetencia(competencia);
    const total = diasNoMes(competencia);
    const diaSemana = diaDaSemana(primeiro);
    const recuo = diaSemana === 0 ? 6 : diaSemana - 1;
    const celulas: (string | null)[] = Array.from({ length: recuo }, () => null);
    for (let i = 0; i < total; i += 1) celulas.push(somarDias(primeiro, i));
    while (celulas.length % 7 !== 0) celulas.push(null);
    return celulas;
  }, [competencia]);

  const totais = useMemo(() => {
    const linhas = resumo.dados ?? [];
    return {
      dias: linhas.reduce((s, l) => s + l.dias, 0),
      dsr: linhas.reduce((s, l) => s + l.diasDSR, 0),
      valor: linhas.reduce((s, l) => s + l.valorEstimado, 0),
      colaboradores: linhas.length,
    };
  }, [resumo.dados]);

  const colunasResumo: Coluna<ResumoFaltasColaborador>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (l) => l.colaboradorNome, render: (l) => <span className="font-medium">{l.colaboradorNome}</span> },
    { chave: 'centro', titulo: 'Centro de custo', valor: (l) => l.centroCusto ?? '', render: (l) => <span className="text-xs text-[var(--texto-3)]">{l.centroCusto ?? '—'}</span> },
    { chave: 'dias', titulo: 'Dias', alinhar: 'direita', valor: (l) => l.dias, rodape: formatarNumero(totais.dias, 0) },
    {
      chave: 'dsr',
      titulo: 'DSR',
      alinhar: 'direita',
      valor: (l) => l.diasDSR,
      titulo2: 'Descanso semanal remunerado perdido',
      rodape: formatarNumero(totais.dsr, 0),
    },
    {
      chave: 'valor',
      titulo: 'Desconto estimado',
      alinhar: 'direita',
      valor: (l) => l.valorEstimado,
      render: (l) => <span className="font-semibold">{formatarBRL(l.valorEstimado)}</span>,
      rodape: formatarBRL(totais.valor),
    },
  ];

  const colunasFaltas: Coluna<Falta>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      largura: '7rem',
      valor: (f) => f.data,
      render: (f) => <span className="font-mono text-xs">{formatarDataBR(f.data)}</span>,
    },
    {
      chave: 'colaborador',
      titulo: 'Colaborador',
      valor: (f) => nomePorId.get(f.colaboradorId) ?? f.colaboradorId,
      render: (f) => <span className="font-medium">{nomePorId.get(f.colaboradorId) ?? '—'}</span>,
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '11rem',
      valor: (f) => f.tipo,
      render: (f) => <Badge tom={TOM_FALTA[f.tipo]}>{ROTULO_FALTA[f.tipo]}</Badge>,
    },
    { chave: 'horas', titulo: 'Horas', alinhar: 'direita', largura: '5rem', valor: (f) => f.horas ?? 0, render: (f) => (f.horas ? formatarNumero(f.horas, 1) : '—') },
    { chave: 'justificativa', titulo: 'Justificativa', valor: (f) => f.justificativa ?? '', render: (f) => <span className="text-xs text-[var(--texto-3)]">{f.justificativa || '—'}</span> },
    {
      chave: 'acoes',
      titulo: '',
      largura: '3rem',
      ordenavel: false,
      render: (f) =>
        podeEditar ? (
          <button
            type="button"
            aria-label={`Excluir ocorrencia de ${formatarDataBR(f.data)}`}
            className="botao-fantasma px-1.5 py-1 text-critico"
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await acao.executar(() => apiFaltas.remover(f.id));
              if (ok !== null) {
                lista.recarregar();
                resumo.recarregar();
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
        sobrancelha={rotuloCompetencia(competencia)}
        titulo="Faltas e ponto"
        descricao="Ocorrencias do mes, com o desconto e o DSR que a folha vai aplicar."
        acoes={
          <>
            <SeletorCompetencia valor={competencia} aoMudar={definir} compacto />
            {podeEditar ? (
              <button type="button" className="botao-primario" onClick={() => setLancando(primeiroDiaDaCompetencia(competencia))}>
                <IconeMais /> Lancar ocorrencia
              </button>
            ) : null}
          </>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Operacao recusada" aoFechar={acao.limparErro}>{acao.erro}</Alerta> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Colaboradores com ocorrencia" valor={formatarNumero(totais.colaboradores, 0)} />
        <Indicador rotulo="Dias de falta" valor={formatarNumero(totais.dias, 0)} apoio="Somente tipos descontaveis entram no calculo" />
        <Indicador rotulo="DSR perdido" valor={formatarNumero(totais.dsr, 0)} apoio="Domingos e feriados na semana da falta" />
        <Indicador rotulo="Desconto estimado" valor={formatarBRL(totais.valor)} apoio="Antes do fechamento da folha" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <section className="cartao p-3">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="sobrancelha">Calendario de {rotuloCompetencia(competencia)}</h2>
            <IconeCalendario className="text-[var(--texto-3)]" />
          </header>
          {lista.carregando ? (
            <Carregando linhas={5} />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1">
                {DIAS_SEMANA.map((dia) => (
                  <div key={dia} className="pb-1 text-center font-mono text-2xs uppercase text-[var(--texto-3)]">
                    {dia}
                  </div>
                ))}
                {grade.map((data, i) => {
                  if (!data) return <div key={`vazio-${i}`} />;
                  const doDia = porDia.get(data) ?? [];
                  const temDescontavel = doDia.some((f) => f.tipo === 'FALTA' || f.tipo === 'SUSPENSAO');
                  return (
                    <button
                      key={data}
                      type="button"
                      disabled={!podeEditar}
                      onClick={() => setLancando(data)}
                      title={doDia.length > 0 ? doDia.map((f) => `${nomePorId.get(f.colaboradorId) ?? ''}: ${ROTULO_FALTA[f.tipo]}`).join('\n') : 'Lancar ocorrencia'}
                      className={`aspect-square rounded border p-1 text-left transition-colors ${
                        doDia.length === 0
                          ? 'border-[var(--borda)] hover:bg-[var(--superficie-sutil)]'
                          : temDescontavel
                            ? 'border-critico/45 bg-critico/10'
                            : 'border-aviso/45 bg-aviso/12'
                      } ${podeEditar ? '' : 'cursor-default'}`}
                    >
                      <span className="num block text-xs font-semibold tabular-nums">{data.slice(8, 10)}</span>
                      {doDia.length > 0 ? (
                        <span className="num block text-2xs font-medium text-[var(--texto-2)]">{doDia.length} ocor.</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-[var(--texto-3)]">
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-critico/45 bg-critico/10" /> Com desconto
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-aviso/45 bg-aviso/12" /> Justificada / atestado
                </li>
              </ul>
            </>
          )}
        </section>

        <Tabela
          colunas={colunasResumo}
          dados={resumo.dados ?? []}
          chaveLinha={(l) => l.colaboradorId}
          carregando={resumo.carregando}
          erro={resumo.erro}
          comRodape
          ordemInicial={{ chave: 'valor', direcao: 'desc' }}
          legenda="Resumo de faltas por colaborador"
          busca
          placeholderBusca="Buscar colaborador no resumo"
          vazio={<EstadoVazio titulo="Nenhuma falta nesta competencia" descricao="Mes limpo — nada a descontar na folha." />}
        />
      </div>

      <Tabela
        colunas={colunasFaltas}
        dados={faltas}
        chaveLinha={(f) => f.id}
        carregando={lista.carregando}
        erro={lista.erro}
        denso
        legenda="Ocorrencias lancadas"
        aoClicarLinha={podeEditar ? (f) => setEditando(f) : undefined}
        ordemInicial={{ chave: 'data', direcao: 'desc' }}
        vazio={
          <EstadoVazio
            titulo="Nenhuma ocorrencia lancada"
            descricao="Clique num dia do calendario ou use o botao de lancar ocorrencia."
            acao={
              podeEditar ? (
                <button type="button" className="botao-primario" onClick={() => setLancando(primeiroDiaDaCompetencia(competencia))}>
                  <IconeMais /> Lancar ocorrencia
                </button>
              ) : null
            }
          />
        }
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Colaborador</span>
              <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="campo w-auto">
                <option value="">Todos os colaboradores</option>
                {(colaboradores.dados?.itens ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Tipo de ocorrencia</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFalta | '')} className="campo w-auto">
                <option value="">Todos os tipos</option>
                {TIPOS_FALTA.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_FALTA[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {lancando || editando ? (
        <ModalLancamento
          data={editando?.data ?? lancando ?? primeiroDiaDaCompetencia(competencia)}
          falta={editando}
          colaboradores={(colaboradores.dados?.itens ?? []).map((c) => ({ id: c.id, nome: c.nome }))}
          aoFechar={() => {
            setLancando(null);
            setEditando(null);
          }}
          aoSalvar={() => {
            setLancando(null);
            setEditando(null);
            lista.recarregar();
            resumo.recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function ModalLancamento({
  data,
  falta,
  colaboradores,
  aoFechar,
  aoSalvar,
}: {
  data: string;
  falta?: Falta | null;
  colaboradores: { id: string; nome: string }[];
  aoFechar: () => void;
  aoSalvar: () => void;
}): JSX.Element {
  const primeiro = colaboradores[0];
  const [colaboradorId, setColaboradorId] = useState(falta?.colaboradorId ?? primeiro?.id ?? '');
  const [dataFalta, setDataFalta] = useState(falta?.data ?? data);
  const [tipo, setTipo] = useState<TipoFalta>(falta?.tipo ?? 'FALTA');
  const [horas, setHoras] = useState(falta?.horas ?? 1);
  const [justificativa, setJustificativa] = useState(falta?.justificativa ?? '');
  const [documento, setDocumento] = useState(falta?.documento ?? '');
  const acao = useAcao();

  async function salvar(): Promise<void> {
    if (!colaboradorId) return;
    const corpo = {
      colaboradorId,
      data: dataFalta,
      tipo,
      horas: tipo === 'ATRASO' ? horas : null,
      justificativa: justificativa || null,
      documento: documento || null,
      registradoPor: falta?.registradoPor ?? null,
    };
    const salva = falta
      ? await acao.executar(() => apiFaltas.atualizar(falta.id, corpo))
      : await acao.executar(() => apiFaltas.criar(corpo));
    if (salva) aoSalvar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={falta ? 'Editar ocorrencia' : 'Lancar ocorrencia'}
      subtitulo={`Data escolhida: ${formatarDataBR(dataFalta)}`}
      rodape={
        <>
          <button type="button" className="botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-primario" onClick={salvar} disabled={acao.executando || !colaboradorId}>
            {acao.executando ? <Girando rotulo="Salvando" /> : falta ? 'Salvar alteracoes' : 'Lancar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {acao.erro ? <Alerta nivel="critico" titulo="Nao foi possivel salvar a ocorrencia">{acao.erro}</Alerta> : null}
        <CampoSelect
          rotulo="Colaborador"
          required
          value={colaboradorId}
          onChange={(e) => setColaboradorId(e.target.value)}
          opcoes={colaboradores.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          vazio={colaboradores.length === 0 ? 'Nenhum colaborador cadastrado' : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Data" type="date" value={dataFalta} onChange={(e) => setDataFalta(e.target.value)} />
          <CampoSelect
            rotulo="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoFalta)}
            opcoes={TIPOS_FALTA.map((t) => ({ valor: t, rotulo: ROTULO_FALTA[t] }))}
            dica={tipo === 'FALTA' || tipo === 'SUSPENSAO' ? 'Desconta o dia e o DSR da semana.' : 'Nao gera desconto de DSR.'}
          />
        </div>
        {tipo === 'ATRASO' ? (
          <CampoTexto
            rotulo="Horas de atraso"
            type="number"
            min={0.25}
            step="0.25"
            value={horas}
            onChange={(e) => setHoras(Number(e.target.value))}
            dica="Desconta a fracao do dia proporcional as horas."
          />
        ) : null}
        <CampoTexto rotulo="Justificativa" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
        <CampoTexto
          rotulo="Documento"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          dica="Numero do atestado, protocolo ou CID, quando houver."
        />
      </div>
    </Modal>
  );
}
