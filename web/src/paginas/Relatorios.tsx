import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatarBRL, hojeISO, rotuloCompetencia } from '@rhmacaw/shared';
import { baixarTexto } from '../api/cliente.js';
import * as apiRelatorios from '../api/relatorios.js';
import type {
  LinhaAbsenteismo,
  LinhaCentroCusto,
  LinhaComissoes,
  RelatorioProvisoes,
} from '../api/tipos.js';
import { Abas } from '../componentes/Abas.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { Figura, GraficoBarras, GraficoMovimento } from '../componentes/Graficos.js';
import { IconeBaixar, IconeBanco, IconeRelatorio } from '../componentes/Icones.js';
import { SeletorCompetencia } from '../componentes/SeletorCompetencia.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { useCompetencia } from '../contextos/CompetenciaContext.js';
import { useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero, formatarPercentual, montarCSV } from '../util/formato.js';
import { ROTULO_STATUS_PERIODO } from '../util/rotulos.js';
import type { ItemFolha } from '@rhmacaw/shared';

type ChaveRelatorio = 'folha' | 'centro' | 'comissoes' | 'absenteismo' | 'movimentacao' | 'provisoes';

const ABAS: { chave: ChaveRelatorio; rotulo: string }[] = [
  { chave: 'folha', rotulo: 'Folha analitica' },
  { chave: 'centro', rotulo: 'Custo por centro' },
  { chave: 'comissoes', rotulo: 'Comissoes' },
  { chave: 'absenteismo', rotulo: 'Absenteismo' },
  { chave: 'movimentacao', rotulo: 'Movimentacao' },
  { chave: 'provisoes', rotulo: 'Provisoes' },
];

type LinhaProvisao = RelatorioProvisoes['linhas'][number];

export function Relatorios(): JSX.Element {
  const { competencia, definir } = useCompetencia();
  const [aba, setAba] = useState<ChaveRelatorio>('folha');
  const ano = Number(competencia.slice(0, 4));

  const folha = useRequisicao(() => apiRelatorios.folhaAnalitica(competencia), [competencia], aba === 'folha');
  const centro = useRequisicao(() => apiRelatorios.custoCentroCusto(competencia), [competencia], aba === 'centro');
  const comissoes = useRequisicao(() => apiRelatorios.comissoes(ano, competencia), [ano, competencia], aba === 'comissoes');
  const absenteismo = useRequisicao(() => apiRelatorios.absenteismo(competencia), [competencia], aba === 'absenteismo');
  const movimentacao = useRequisicao(() => apiRelatorios.movimentacao(ano), [ano], aba === 'movimentacao');
  const provisoes = useRequisicao(() => apiRelatorios.provisoes(competencia), [competencia], aba === 'provisoes');

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha={aba === 'movimentacao' ? `Ano ${ano}` : rotuloCompetencia(competencia)}
        titulo="Relatorios"
        descricao="Conferencia da folha, custo por unidade, comissoes, faltas, movimentacao e provisoes."
        acoes={<SeletorCompetencia valor={competencia} aoMudar={definir} compacto />}
      />

      <Abas abas={ABAS} ativa={aba} aoMudar={(c) => setAba(c as ChaveRelatorio)} />

      {aba === 'folha' ? <RelatorioFolha estado={folha} competencia={competencia} /> : null}
      {aba === 'centro' ? <RelatorioCentro estado={centro} competencia={competencia} /> : null}
      {aba === 'comissoes' ? <RelatorioComissoes estado={comissoes} ano={ano} /> : null}
      {aba === 'absenteismo' ? <RelatorioAbsenteismo estado={absenteismo} competencia={competencia} /> : null}
      {aba === 'movimentacao' ? <RelatorioMovimentacao estado={movimentacao} ano={ano} /> : null}
      {aba === 'provisoes' ? <RelatorioProvisoesTela estado={provisoes} competencia={competencia} /> : null}
    </div>
  );
}

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

function Moldura({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao: string;
  acoes?: JSX.Element | null;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">{titulo}</h2>
          <p className="text-xs text-[var(--texto-3)]">{descricao}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </div>
      {children}
    </section>
  );
}

/* ---------------------------- Folha analitica ---------------------------- */

function RelatorioFolha({ estado, competencia }: { estado: Estado<Awaited<ReturnType<typeof apiRelatorios.folhaAnalitica>>>; competencia: string }): JSX.Element {
  const itens = estado.dados?.itens ?? [];
  const totais = estado.dados?.totais;

  const colunas: Coluna<ItemFolha>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (i) => i.colaboradorNome, render: (i) => <span className="font-medium">{i.colaboradorNome}</span> },
    { chave: 'centro', titulo: 'Centro de custo', valor: (i) => i.centroCusto, render: (i) => <span className="text-xs text-[var(--texto-3)]">{i.centroCusto}</span> },
    { chave: 'proventos', titulo: 'Proventos', alinhar: 'direita', valor: (i) => i.totalProventos, render: (i) => formatarBRL(i.totalProventos), rodape: formatarBRL(totais?.totalProventos ?? 0) },
    { chave: 'descontos', titulo: 'Descontos', alinhar: 'direita', valor: (i) => i.totalDescontos, render: (i) => formatarBRL(i.totalDescontos), rodape: formatarBRL(totais?.totalDescontos ?? 0) },
    { chave: 'inss', titulo: 'INSS', alinhar: 'direita', valor: (i) => i.inss, render: (i) => formatarBRL(i.inss) },
    { chave: 'fgts', titulo: 'FGTS', alinhar: 'direita', valor: (i) => i.fgts, render: (i) => formatarBRL(i.fgts) },
    { chave: 'liquido', titulo: 'Liquido', alinhar: 'direita', valor: (i) => i.salarioLiquido, render: (i) => <span className="font-semibold">{formatarBRL(i.salarioLiquido)}</span>, rodape: formatarBRL(totais?.totalLiquido ?? 0) },
    {
      chave: 'transferir',
      titulo: 'A transferir',
      alinhar: 'direita',
      classe: 'trilho',
      valor: (i) => i.valorTransferir,
      render: (i) => <span className="font-semibold text-ouro-600 dark:text-ouro-200">{formatarBRL(i.valorTransferir)}</span>,
      rodape: formatarBRL(totais?.totalTransferir ?? 0),
    },
  ];

  return (
    <Moldura
      titulo="Folha analitica"
      descricao={`Todos os itens da folha de ${rotuloCompetencia(competencia)}, linha a linha.`}
      acoes={
        <>
          <button
            type="button"
            className="botao-secundario"
            disabled={itens.length === 0}
            onClick={() =>
              baixarTexto(
                `folha-analitica-${competencia}.csv`,
                montarCSV(
                  ['Colaborador', 'Funcao', 'Centro de custo', 'Proventos', 'Descontos', 'INSS', 'IRRF', 'FGTS', 'Liquido', 'A transferir'],
                  itens.map((i) => [i.colaboradorNome, i.funcao, i.centroCusto, i.totalProventos, i.totalDescontos, i.inss, i.irrf, i.fgts, i.salarioLiquido, i.valorTransferir]),
                ),
                'text/csv;charset=utf-8',
              )
            }
          >
            <IconeBaixar /> Exportar CSV
          </button>
          <Link to="/banco" className="botao-trilho">
            <IconeBanco /> Gerar pagamento
          </Link>
        </>
      }
    >
      <Tabela
        colunas={colunas}
        dados={itens}
        chaveLinha={(i) => i.colaboradorId}
        carregando={estado.carregando}
        erro={estado.erro}
        busca
        denso
        comRodape
        agruparPor={(i) => i.centroCusto}
        legenda="Folha analitica"
        vazio={<EstadoVazio icone={<IconeRelatorio />} titulo="Sem folha nesta competencia" descricao="Processe a folha para gerar o relatorio." acao={<Link to="/folha" className="botao-primario">Ir para a folha</Link>} />}
      />
    </Moldura>
  );
}

/* ------------------------- Custo por centro de custo ------------------------- */

function RelatorioCentro({ estado, competencia }: { estado: Estado<Awaited<ReturnType<typeof apiRelatorios.custoCentroCusto>>>; competencia: string }): JSX.Element {
  const linhas = estado.dados?.linhas ?? [];
  const colunas: Coluna<LinhaCentroCusto>[] = [
    { chave: 'centro', titulo: 'Centro de custo', valor: (l) => l.centroCusto, render: (l) => <span className="font-medium">{l.centroCusto}</span> },
    { chave: 'colab', titulo: 'Colaboradores', alinhar: 'direita', valor: (l) => l.colaboradores },
    { chave: 'proventos', titulo: 'Proventos', alinhar: 'direita', valor: (l) => l.proventos, render: (l) => formatarBRL(l.proventos) },
    { chave: 'descontos', titulo: 'Descontos', alinhar: 'direita', valor: (l) => l.descontos, render: (l) => formatarBRL(l.descontos) },
    { chave: 'liquido', titulo: 'Liquido', alinhar: 'direita', valor: (l) => l.liquido, render: (l) => formatarBRL(l.liquido) },
    {
      chave: 'custo',
      titulo: 'Custo total',
      alinhar: 'direita',
      valor: (l) => l.custoTotal,
      render: (l) => <span className="font-semibold">{formatarBRL(l.custoTotal)}</span>,
      rodape: formatarBRL(estado.dados?.total ?? 0),
    },
  ];

  return (
    <Moldura
      titulo="Custo por centro de custo"
      descricao={`Rateio do custo de ${rotuloCompetencia(competencia)} entre as unidades.`}
      acoes={
        <button
          type="button"
          className="botao-secundario"
          disabled={linhas.length === 0}
          onClick={() =>
            baixarTexto(
              `custo-centro-custo-${competencia}.csv`,
              montarCSV(['Centro de custo', 'Colaboradores', 'Proventos', 'Descontos', 'Liquido', 'Custo total'], linhas.map((l) => [l.centroCusto, l.colaboradores, l.proventos, l.descontos, l.liquido, l.custoTotal])),
              'text/csv;charset=utf-8',
            )
          }
        >
          <IconeBaixar /> Exportar CSV
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Figura titulo="Distribuicao do custo" descricao="Custo total por unidade na competencia.">
          {linhas.length === 0 ? (
            <EstadoVazio titulo="Sem dados" descricao="Nenhum custo apurado nesta competencia." />
          ) : (
            <GraficoBarras dados={linhas.map((l) => ({ rotulo: l.centroCusto, valor: l.custoTotal }))} altura={Math.max(160, linhas.length * 54)} />
          )}
        </Figura>
        <Tabela colunas={colunas} dados={linhas} chaveLinha={(l) => l.centroCusto} carregando={estado.carregando} erro={estado.erro} denso comRodape legenda="Custo por centro de custo" vazio={<EstadoVazio titulo="Sem dados" descricao="Processe a folha desta competencia." />} />
      </div>
    </Moldura>
  );
}

/* ------------------------------- Comissoes ------------------------------- */

function RelatorioComissoes({ estado, ano }: { estado: Estado<Awaited<ReturnType<typeof apiRelatorios.comissoes>>>; ano: number }): JSX.Element {
  const linhas = estado.dados?.linhas ?? [];
  const semanas = estado.dados?.porSemana ?? [];

  const colunas: Coluna<LinhaComissoes>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (l) => l.colaboradorNome, render: (l) => <span className="font-medium">{l.colaboradorNome}</span> },
    { chave: 'funcao', titulo: 'Funcao', valor: (l) => l.funcao ?? '', render: (l) => <span className="text-xs text-[var(--texto-3)]">{l.funcao ?? '—'}</span> },
    { chave: 'semanas', titulo: 'Semanas', alinhar: 'direita', valor: (l) => l.semanas },
    { chave: 'pontos', titulo: 'Pontos', alinhar: 'direita', valor: (l) => l.pontos ?? 0, render: (l) => formatarNumero(l.pontos ?? 0, 1) },
    {
      chave: 'total',
      titulo: 'Total recebido',
      alinhar: 'direita',
      valor: (l) => l.total,
      render: (l) => <span className="font-semibold">{formatarBRL(l.total)}</span>,
      rodape: formatarBRL(estado.dados?.totalDistribuido ?? 0),
    },
  ];

  return (
    <Moldura
      titulo="Comissoes"
      descricao={`Arrecadacao e rateio das semanas de ${ano}.`}
      acoes={
        <>
          <button
            type="button"
            className="botao-secundario"
            disabled={linhas.length === 0}
            onClick={() =>
              baixarTexto(
                `comissoes-${ano}.csv`,
                montarCSV(['Colaborador', 'Funcao', 'Centro de custo', 'Semanas', 'Pontos', 'Total'], linhas.map((l) => [l.colaboradorNome, l.funcao ?? '', l.centroCusto ?? '', l.semanas, l.pontos ?? 0, l.total])),
                'text/csv;charset=utf-8',
              )
            }
          >
            <IconeBaixar /> Exportar CSV
          </button>
          <Link to="/comissoes" className="botao-trilho">
            <IconeBanco /> Fechar e pagar semana
          </Link>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Arrecadado no ano" valor={formatarBRL(estado.dados?.totalArrecadado ?? 0)} />
        <Indicador rotulo="Distribuido" valor={formatarBRL(estado.dados?.totalDistribuido ?? 0)} trilho />
        <Indicador rotulo="Semanas apuradas" valor={formatarNumero(semanas.length, 0)} />
      </div>

      <Tabela colunas={colunas} dados={linhas} chaveLinha={(l) => l.colaboradorId} carregando={estado.carregando} erro={estado.erro} busca denso comRodape legenda="Comissoes por colaborador" ordemInicial={{ chave: 'total', direcao: 'desc' }} vazio={<EstadoVazio titulo="Nenhuma comissao no ano" descricao="Abra e feche semanas na tela de Comissoes." />} />

      {semanas.length > 0 ? (
        <div className="cartao overflow-hidden">
          <header className="border-b border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
            <h3 className="sobrancelha">Semanas apuradas</h3>
          </header>
          <div className="tabela-rolagem rolagem-fina">
            <table className="w-full text-sm">
              <caption className="sr-only">Semanas de comissao</caption>
              <thead>
                <tr className="border-b border-[var(--borda)] text-left">
                  <th className="px-3 py-1.5 font-mono text-2xs uppercase text-[var(--texto-3)]">Semana</th>
                  <th className="px-3 py-1.5 text-right font-mono text-2xs uppercase text-[var(--texto-3)]">Arrecadado</th>
                  <th className="px-3 py-1.5 text-right font-mono text-2xs uppercase text-[var(--texto-3)]">Distribuido</th>
                  <th className="px-3 py-1.5 font-mono text-2xs uppercase text-[var(--texto-3)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map((s) => (
                  <tr key={`${s.ano}-${s.semana}`} className="border-b border-[var(--borda)] last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {String(s.semana).padStart(2, '0')}/{s.ano}
                    </td>
                    <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(s.arrecadado)}</td>
                    <td className="num px-3 py-1.5 text-right font-semibold tabular-nums">{formatarBRL(s.distribuido)}</td>
                    <td className="px-3 py-1.5">
                      <Badge tom={s.status === 'PAGO' ? 'positivo' : s.status === 'FECHADO' ? 'info' : 'atencao'}>
                        {ROTULO_STATUS_PERIODO[s.status as keyof typeof ROTULO_STATUS_PERIODO] ?? s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Moldura>
  );
}

/* ------------------------------ Absenteismo ------------------------------ */

function RelatorioAbsenteismo({ estado, competencia }: { estado: Estado<Awaited<ReturnType<typeof apiRelatorios.absenteismo>>>; competencia: string }): JSX.Element {
  const linhas = estado.dados?.linhas ?? [];
  const colunas: Coluna<LinhaAbsenteismo>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (l) => l.colaboradorNome, render: (l) => <span className="font-medium">{l.colaboradorNome}</span> },
    { chave: 'centro', titulo: 'Centro de custo', valor: (l) => l.centroCusto ?? '', render: (l) => <span className="text-xs text-[var(--texto-3)]">{l.centroCusto ?? '—'}</span> },
    { chave: 'faltas', titulo: 'Faltas', alinhar: 'direita', valor: (l) => l.faltas },
    { chave: 'atestados', titulo: 'Atestados', alinhar: 'direita', valor: (l) => l.atestados },
    { chave: 'atrasos', titulo: 'Atrasos (h)', alinhar: 'direita', valor: (l) => l.atrasosHoras, render: (l) => formatarNumero(l.atrasosHoras, 1) },
    {
      chave: 'percentual',
      titulo: 'Absenteismo',
      alinhar: 'direita',
      valor: (l) => l.percentual,
      render: (l) => (
        <span className={`font-semibold ${l.percentual >= 10 ? 'text-critico' : l.percentual >= 5 ? 'text-[#b98505] dark:text-aviso' : ''}`}>
          {formatarPercentual(l.percentual)}
        </span>
      ),
      rodape: formatarPercentual(estado.dados?.percentualGeral ?? 0),
    },
  ];

  return (
    <Moldura
      titulo="Absenteismo"
      descricao={`Faltas, atestados e atrasos de ${rotuloCompetencia(competencia)}.`}
      acoes={
        <button
          type="button"
          className="botao-secundario"
          disabled={linhas.length === 0}
          onClick={() =>
            baixarTexto(
              `absenteismo-${competencia}.csv`,
              montarCSV(['Colaborador', 'Centro de custo', 'Faltas', 'Atestados', 'Atrasos (h)', 'Absenteismo (%)'], linhas.map((l) => [l.colaboradorNome, l.centroCusto ?? '', l.faltas, l.atestados, l.atrasosHoras, l.percentual])),
              'text/csv;charset=utf-8',
            )
          }
        >
          <IconeBaixar /> Exportar CSV
        </button>
      }
    >
      <Indicador rotulo="Absenteismo geral" valor={formatarPercentual(estado.dados?.percentualGeral ?? 0)} apoio="Dias perdidos sobre dias uteis do mes" />
      <Tabela colunas={colunas} dados={linhas} chaveLinha={(l) => l.colaboradorId} carregando={estado.carregando} erro={estado.erro} busca denso comRodape legenda="Absenteismo por colaborador" ordemInicial={{ chave: 'percentual', direcao: 'desc' }} vazio={<EstadoVazio titulo="Sem ocorrencias" descricao="Nenhuma falta lancada nesta competencia." />} />
    </Moldura>
  );
}

/* ----------------------------- Movimentacao ----------------------------- */

function RelatorioMovimentacao({ estado, ano }: { estado: Estado<Awaited<ReturnType<typeof apiRelatorios.movimentacao>>>; ano: number }): JSX.Element {
  const meses = estado.dados?.meses ?? [];
  const dadosGrafico = useMemo(
    () => meses.map((m) => ({ rotulo: rotuloCompetencia(m.competencia).slice(0, 3), admissoes: m.admissoes, demissoes: m.demissoes })),
    [meses],
  );

  return (
    <Moldura
      titulo="Movimentacao de pessoal"
      descricao={`Admissoes e demissoes mes a mes em ${ano}.`}
      acoes={
        <button
          type="button"
          className="botao-secundario"
          disabled={meses.length === 0}
          onClick={() =>
            baixarTexto(
              `movimentacao-${ano}.csv`,
              montarCSV(['Competencia', 'Admissoes', 'Demissoes', 'Saldo'], meses.map((m) => [m.competencia, m.admissoes, m.demissoes, m.saldo])),
              'text/csv;charset=utf-8',
            )
          }
        >
          <IconeBaixar /> Exportar CSV
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Admissoes no ano" valor={formatarNumero(estado.dados?.totalAdmissoes ?? 0, 0)} />
        <Indicador rotulo="Demissoes no ano" valor={formatarNumero(estado.dados?.totalDemissoes ?? 0, 0)} />
        <Indicador rotulo="Saldo" valor={formatarNumero((estado.dados?.totalAdmissoes ?? 0) - (estado.dados?.totalDemissoes ?? 0), 0)} />
      </div>

      {estado.erro ? <Alerta nivel="critico" titulo="Nao foi possivel carregar">{estado.erro}</Alerta> : null}

      <Figura titulo="Admissoes e demissoes por mes" descricao="Contagem de pessoas, nao valores." >
        {estado.carregando ? (
          <p className="py-8 text-center text-sm text-[var(--texto-3)]">Carregando…</p>
        ) : dadosGrafico.length === 0 ? (
          <EstadoVazio titulo="Sem movimentacao" descricao="Nenhuma admissao ou demissao registrada no ano." />
        ) : (
          <GraficoMovimento dados={dadosGrafico} />
        )}
      </Figura>

      <div className="cartao overflow-hidden">
        <div className="tabela-rolagem rolagem-fina">
          <table className="w-full text-sm">
            <caption className="sr-only">Movimentacao mensal</caption>
            <thead className="bg-[var(--superficie-sutil)]">
              <tr className="border-b border-[var(--borda-forte)] text-left">
                <th className="px-3 py-1.5 font-mono text-2xs uppercase text-[var(--texto-3)]">Competencia</th>
                <th className="px-3 py-1.5 text-right font-mono text-2xs uppercase text-[var(--texto-3)]">Admissoes</th>
                <th className="px-3 py-1.5 text-right font-mono text-2xs uppercase text-[var(--texto-3)]">Demissoes</th>
                <th className="px-3 py-1.5 text-right font-mono text-2xs uppercase text-[var(--texto-3)]">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.competencia} className="border-b border-[var(--borda)] last:border-0">
                  <td className="px-3 py-1.5">{rotuloCompetencia(m.competencia)}</td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{m.admissoes}</td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{m.demissoes}</td>
                  <td className={`num px-3 py-1.5 text-right font-semibold tabular-nums ${m.saldo < 0 ? 'text-critico' : ''}`}>{m.saldo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Moldura>
  );
}

/* ------------------------------- Provisoes ------------------------------- */

function RelatorioProvisoesTela({ estado, competencia }: { estado: Estado<RelatorioProvisoes>; competencia: string }): JSX.Element {
  const linhas = estado.dados?.linhas ?? [];
  const totais = estado.dados?.totais;

  const colunas: Coluna<LinhaProvisao>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (l) => l.colaboradorNome, render: (l) => <span className="font-medium">{l.colaboradorNome}</span> },
    { chave: 'centro', titulo: 'Centro de custo', valor: (l) => l.centroCusto ?? '', render: (l) => <span className="text-xs text-[var(--texto-3)]">{l.centroCusto ?? '—'}</span> },
    { chave: 'ferias', titulo: 'Ferias', alinhar: 'direita', valor: (l) => l.provisaoFerias, render: (l) => formatarBRL(l.provisaoFerias), rodape: formatarBRL(totais?.provisaoFerias ?? 0) },
    { chave: 'terco', titulo: '1/3 ferias', alinhar: 'direita', valor: (l) => l.provisaoTercoFerias, render: (l) => formatarBRL(l.provisaoTercoFerias), rodape: formatarBRL(totais?.provisaoTercoFerias ?? 0) },
    { chave: 'decimo', titulo: '13o', alinhar: 'direita', valor: (l) => l.provisaoDecimoTerceiro, render: (l) => formatarBRL(l.provisaoDecimoTerceiro), rodape: formatarBRL(totais?.provisaoDecimoTerceiro ?? 0) },
    { chave: 'encargos', titulo: 'Encargos', alinhar: 'direita', valor: (l) => l.encargosSobreProvisoes, render: (l) => formatarBRL(l.encargosSobreProvisoes), rodape: formatarBRL(totais?.encargosSobreProvisoes ?? 0) },
    { chave: 'total', titulo: 'Total provisionado', alinhar: 'direita', valor: (l) => l.total, render: (l) => <span className="font-semibold">{formatarBRL(l.total)}</span>, rodape: formatarBRL(totais?.total ?? 0) },
  ];

  return (
    <Moldura
      titulo="Provisoes"
      descricao={`Ferias, 13o e encargos provisionados ate ${rotuloCompetencia(competencia)}.`}
      acoes={
        <button
          type="button"
          className="botao-secundario"
          disabled={linhas.length === 0}
          onClick={() =>
            baixarTexto(
              `provisoes-${competencia}.csv`,
              montarCSV(['Colaborador', 'Centro de custo', 'Ferias', '1/3 ferias', '13o', 'Encargos', 'Total'], linhas.map((l) => [l.colaboradorNome, l.centroCusto ?? '', l.provisaoFerias, l.provisaoTercoFerias, l.provisaoDecimoTerceiro, l.encargosSobreProvisoes, l.total])),
              'text/csv;charset=utf-8',
            )
          }
        >
          <IconeBaixar /> Exportar CSV
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Provisao de ferias" valor={formatarBRL((totais?.provisaoFerias ?? 0) + (totais?.provisaoTercoFerias ?? 0))} />
        <Indicador rotulo="Provisao de 13o" valor={formatarBRL(totais?.provisaoDecimoTerceiro ?? 0)} />
        <Indicador rotulo="Encargos" valor={formatarBRL(totais?.encargosSobreProvisoes ?? 0)} />
        <Indicador rotulo="Total provisionado" valor={formatarBRL(totais?.total ?? 0)} />
      </div>
      <Tabela colunas={colunas} dados={linhas} chaveLinha={(l) => l.colaboradorId} carregando={estado.carregando} erro={estado.erro} busca denso comRodape agruparPor={(l) => l.centroCusto ?? 'SEM CENTRO DE CUSTO'} legenda="Provisoes por colaborador" vazio={<EstadoVazio titulo="Sem provisoes" descricao="Cadastre colaboradores ativos para apurar as provisoes." />} />
      <p className="text-xs text-[var(--texto-3)]">
        Base: {hojeISO()} · a provisao considera os avos ja adquiridos por cada colaborador ate o fim da competencia.
      </p>
    </Moldura>
  );
}
