import { useEffect, useMemo, useState } from 'react';
import {
  TIPOS_FOLHA,
  formatarBRL,
  formatarDataBR,
  hojeISO,
  rotuloCompetencia,
  ultimoDiaDaCompetencia,
  type FolhaDetalhada,
  type ItemFolha,
  type TipoFolha,
} from '@rhmacaw/shared';
import { baixarTexto } from '../api/cliente.js';
import * as apiFolhas from '../api/folhas.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoSelect, CampoTexto } from '../componentes/Campo.js';
import { Carregando, Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeBaixar, IconeBanco, IconeFolha } from '../componentes/Icones.js';
import { ModalRemessa } from '../componentes/ModalRemessa.js';
import { Modal } from '../componentes/Modal.js';
import { MoedaInput } from '../componentes/MoedaInput.js';
import { SeletorCompetencia } from '../componentes/SeletorCompetencia.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { TabelaVerbas } from '../componentes/TabelaVerbas.js';
import { TrilhoPagamento } from '../componentes/TrilhoPagamento.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useCompetencia } from '../contextos/CompetenciaContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero, montarCSV } from '../util/formato.js';
import { ROTULO_STATUS_FOLHA, ROTULO_TIPO_FOLHA, TOM_STATUS_FOLHA } from '../util/rotulos.js';

export function Folha(): JSX.Element {
  const { competencia, definir } = useCompetencia();
  const { pode } = useAuth();
  const podeProcessar = pode('folha:processar');
  const podeBanco = pode('banco:gerar');

  const [tipo, setTipo] = useState<TipoFolha>('MENSAL');
  const [dataPagamento, setDataPagamento] = useState(ultimoDiaDaCompetencia(competencia));
  const [itemAberto, setItemAberto] = useState<ItemFolha | null>(null);
  const [abrindoRemessa, setAbrindoRemessa] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const acao = useAcao();

  // A data sugerida acompanha a competência escolhida na topbar.
  useEffect(() => {
    setDataPagamento(ultimoDiaDaCompetencia(competencia));
  }, [competencia]);

  const lista = useRequisicao(() => apiFolhas.listar({ competencia, tipo }), [competencia, tipo]);
  const folhaResumo = (lista.dados ?? [])[0] ?? null;

  const detalhe = useRequisicao(
    () => apiFolhas.obter(folhaResumo?.id as string),
    [folhaResumo?.id],
    Boolean(folhaResumo?.id),
  );

  const folha: FolhaDetalhada | null = detalhe.dados;
  const itens = folha?.itens ?? [];
  const negativos = useMemo(() => itens.filter((i) => i.valorTransferir <= 0), [itens]);

  async function processar(): Promise<void> {
    const resultado = await acao.executar(() => apiFolhas.processar({ competencia, tipo, dataPagamento }));
    if (resultado) {
      detalhe.definir(resultado);
      lista.recarregar();
      setAviso(`Folha de ${rotuloCompetencia(competencia)} processada em rascunho. Confira antes de fechar.`);
    }
  }

  async function fechar(): Promise<void> {
    if (!folha) return;
    const resultado = await acao.executar(() => apiFolhas.fechar(folha.id));
    if (resultado) {
      detalhe.definir(resultado);
      lista.recarregar();
      setAviso('Folha fechada. Agora ela pode virar remessa bancaria.');
    }
  }

  async function reabrir(): Promise<void> {
    if (!folha) return;
    const resultado = await acao.executar(() => apiFolhas.reabrir(folha.id));
    if (resultado) {
      detalhe.definir(resultado);
      lista.recarregar();
    }
  }

  async function exportar(): Promise<void> {
    if (!folha) return;
    const csv = await acao.executar(() => apiFolhas.exportar(folha.id, 'csv'));
    if (csv !== null) baixarTexto(`folha-${folha.competencia}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportarLocal(): void {
    if (!folha) return;
    const csv = montarCSV(
      ['Colaborador', 'Função', 'Centro de custo', 'Base', 'Faltas', 'Comissões', 'INSS', 'IRRF', 'Líquido', 'Adiantado', 'A transferir'],
      itens.map((i) => [
        i.colaboradorNome,
        i.funcao,
        i.centroCusto,
        i.salarioBase,
        i.descontoFaltas + i.descontoDSR,
        i.comissoes,
        i.inss,
        i.irrf,
        i.salarioLiquido,
        i.comissoesAdiantadas,
        i.valorTransferir,
      ]),
    );
    baixarTexto(`folha-analitica-${folha.competencia}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const soma = (extrair: (i: ItemFolha) => number): number => itens.reduce((s, i) => s + extrair(i), 0);

  const colunas: Coluna<ItemFolha>[] = [
    {
      chave: 'nome',
      titulo: 'Colaborador',
      valor: (i) => i.colaboradorNome,
      rodape: `${itens.length} colaborador(es)`,
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{i.colaboradorNome}</p>
          <p className="truncate text-2xs text-[var(--texto-3)]">{i.funcao}</p>
        </div>
      ),
    },
    { chave: 'base', titulo: 'Base', alinhar: 'direita', valor: (i) => i.salarioBase, render: (i) => formatarBRL(i.salarioBase), rodape: formatarBRL(soma((i) => i.salarioBase)) },
    {
      chave: 'faltas',
      titulo: 'Faltas',
      alinhar: 'direita',
      valor: (i) => i.descontoFaltas + i.descontoDSR,
      titulo2: 'Desconto de faltas somado ao DSR perdido',
      rodape: formatarBRL(soma((i) => i.descontoFaltas + i.descontoDSR)),
      render: (i) => {
        const total = i.descontoFaltas + i.descontoDSR;
        return total > 0 ? <span className="text-critico">-{formatarBRL(total)}</span> : <span className="text-[var(--texto-3)]">—</span>;
      },
    },
    {
      chave: 'comissões',
      titulo: 'Comissões',
      alinhar: 'direita',
      valor: (i) => i.comissoes,
      rodape: formatarBRL(soma((i) => i.comissoes)),
      render: (i) => (i.comissoes > 0 ? formatarBRL(i.comissoes) : <span className="text-[var(--texto-3)]">—</span>),
    },
    { chave: 'inss', titulo: 'INSS', alinhar: 'direita', valor: (i) => i.inss, render: (i) => formatarBRL(i.inss), rodape: formatarBRL(soma((i) => i.inss)) },
    { chave: 'irrf', titulo: 'IRRF', alinhar: 'direita', valor: (i) => i.irrf, render: (i) => (i.irrf > 0 ? formatarBRL(i.irrf) : <span className="text-[var(--texto-3)]">—</span>), rodape: formatarBRL(soma((i) => i.irrf)) },
    {
      chave: 'líquido',
      titulo: 'Líquido',
      alinhar: 'direita',
      valor: (i) => i.salarioLiquido,
      rodape: formatarBRL(soma((i) => i.salarioLiquido)),
      render: (i) => <span className="font-semibold">{formatarBRL(i.salarioLiquido)}</span>,
    },
    {
      chave: 'adiantadas',
      titulo: 'Adiantado',
      alinhar: 'direita',
      valor: (i) => i.comissoesAdiantadas,
      titulo2: 'Comissões já pagas nas semanas',
      rodape: formatarBRL(soma((i) => i.comissoesAdiantadas)),
      render: (i) =>
        i.comissoesAdiantadas > 0 ? <span className="text-[var(--texto-2)]">-{formatarBRL(i.comissoesAdiantadas)}</span> : <span className="text-[var(--texto-3)]">—</span>,
    },
    {
      chave: 'transferir',
      titulo: 'A transferir',
      alinhar: 'direita',
      classe: 'trilho',
      valor: (i) => i.valorTransferir,
      rodape: formatarBRL(soma((i) => i.valorTransferir)),
      render: (i) => (
        <span className={`font-semibold ${i.valorTransferir <= 0 ? 'text-critico' : 'text-ouro-600 dark:text-ouro-200'}`}>
          {formatarBRL(i.valorTransferir)}
        </span>
      ),
    },
  ];

  function rodapeGrupo(grupo: string, linhas: ItemFolha[]): JSX.Element {
    const somaGrupo = (extrair: (i: ItemFolha) => number): number => linhas.reduce((acc, i) => acc + extrair(i), 0);
    return (
      <tr className="border-y border-[var(--borda-forte)] bg-[var(--superficie-sutil)] text-xs font-semibold">
        <td className="px-3 py-1.5">Subtotal — {grupo}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.salarioBase))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.descontoFaltas + i.descontoDSR))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.comissoes))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.inss))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.irrf))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.salarioLiquido))}</td>
        <td className="num px-3 py-1.5 text-right tabular-nums">{formatarBRL(somaGrupo((i) => i.comissoesAdiantadas))}</td>
        <td className="num trilho px-3 py-1.5 text-right tabular-nums text-ouro-600 dark:text-ouro-200">
          {formatarBRL(somaGrupo((i) => i.valorTransferir))}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha={rotuloCompetencia(competencia)}
        titulo="Folha de pagamento"
        descricao="Da apuração ao valor que sai da conta da empresa, colaborador a colaborador."
        acoes={
          <>
            <SeletorCompetencia valor={competencia} aoMudar={definir} compacto />
            {folha ? <Badge tom={TOM_STATUS_FOLHA[folha.status]}>{ROTULO_STATUS_FOLHA[folha.status]}</Badge> : null}
          </>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Operacao recusada" aoFechar={acao.limparErro}>{acao.erro}</Alerta> : null}
      {aviso ? <Alerta nivel="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta> : null}
      {lista.erro ? <Alerta nivel="critico" titulo="Não foi possível carregar a folha">{lista.erro}</Alerta> : null}

      <section className="cartão p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoSelect
            rotulo="Tipo de folha"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoFolha)}
            opcoes={TIPOS_FOLHA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_FOLHA[t] }))}
          />
          <CampoTexto rotulo="Data do pagamento" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          <div className="flex items-end">
            <button
              type="button"
              className="botao-primario w-full"
              onClick={processar}
              disabled={!podeProcessar || acao.executando || folha?.status === 'PAGA'}
              title={folha?.status === 'PAGA' ? 'Folha paga e imutavel' : undefined}
            >
              {acao.executando ? <Girando rotulo="Processando" /> : folha ? 'Reprocessar rascunho' : 'Processar folha'}
            </button>
          </div>
          <div className="flex items-end gap-2">
            {folha ? (
              <>
                <button type="button" className="botao-secundario" onClick={exportar} title="Exportação gerada pela API">
                  <IconeBaixar /> CSV
                </button>
                <button type="button" className="botao-secundario" onClick={exportarLocal} title="Exportação da tabela em tela">
                  Analítica
                </button>
              </>
            ) : null}
          </div>
        </div>
        {folha ? (
          <p className="mt-2 text-xs text-[var(--texto-3)]">
            Pagamento em {formatarDataBR(folha.dataPagamento)} · {folha.quantidadeColaboradores} colaborador(es) ·{' '}
            {folha.fechadoEm ? `fechada em ${formatarDataBR(folha.fechadoEm.slice(0, 10))}` : 'ainda em rascunho'}
          </p>
        ) : null}
      </section>

      {detalhe.carregando && !folha ? (
        <div className="cartão p-4">
          <Carregando linhas={8} />
        </div>
      ) : !folha ? (
        <div className="cartão">
          <EstadoVazio
            icone={<IconeFolha />}
            titulo={`Nenhuma folha ${ROTULO_TIPO_FOLHA[tipo].toLowerCase()} em ${rotuloCompetencia(competencia)}`}
            descricao="Processe a competência para apurar salários, faltas, comissões e encargos."
            acao={
              podeProcessar ? (
                <button type="button" className="botao-primario" onClick={processar} disabled={acao.executando}>
                  Processar folha de {rotuloCompetencia(competencia)}
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          {folha.status !== 'RASCUNHO' ? <TrilhoPagamento etapa={folha.status === 'PAGA' ? 'gerada' : 'origem'} compacto /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Indicador rotulo="Proventos" valor={formatarBRL(folha.totalProventos)} />
            <Indicador rotulo="Descontos" valor={formatarBRL(folha.totalDescontos)} />
            <Indicador rotulo="Líquido" valor={formatarBRL(folha.totalLiquido)} />
            <Indicador rotulo="Comissões adiantadas" valor={formatarBRL(folha.totalComissoesAdiantadas)} apoio="Pagas nas semanas" />
            <Indicador rotulo="Valor a transferir" valor={formatarBRL(folha.totalTransferir)} trilho apoio="O que sai da conta da empresa" />
          </div>

          {negativos.length > 0 ? (
            <Alerta nivel="atencao" titulo={`${negativos.length} colaborador(es) com valor a transferir zero ou negativo`}>
              O adiantamento de comissões superou o líquido do mês. Esses casos ficam de fora da remessa e precisam de acerto:{' '}
              {negativos
                .slice(0, 4)
                .map((i) => i.colaboradorNome)
                .join(', ')}
              {negativos.length > 4 ? ` e mais ${negativos.length - 4}.` : '.'}
            </Alerta>
          ) : null}

          <Tabela
            colunas={colunas}
            dados={itens}
            chaveLinha={(i) => i.colaboradorId}
            carregando={detalhe.carregando}
            erro={detalhe.erro}
            busca
            placeholderBusca="Buscar colaborador na folha"
            denso
            legenda="Folha analítica por colaborador"
            agruparPor={(i) => i.centroCusto}
            rodapeGrupo={rodapeGrupo}
            aoClicarLinha={(i) => setItemAberto(i)}
            classeLinha={(i) => (i.valorTransferir <= 0 ? 'bg-critico/[0.06]' : '')}
            comRodape
            vazio={<EstadoVazio titulo="Folha sem itens" descricao="Nenhum colaborador elegivel nesta competencia." />}
            acoes={
              <>
                {folha.status === 'RASCUNHO' ? (
                  <button type="button" className="botao-primario" onClick={fechar} disabled={!podeProcessar || acao.executando}>
                    Fechar folha
                  </button>
                ) : null}
                {folha.status === 'FECHADA' ? (
                  <>
                    <button type="button" className="botao-secundario" onClick={reabrir} disabled={!podeProcessar || acao.executando}>
                      Reabrir
                    </button>
                    <button type="button" className="botao-trilho" onClick={() => setAbrindoRemessa(true)} disabled={!podeBanco}>
                      <IconeBanco /> Gerar remessa bancaria
                    </button>
                  </>
                ) : null}
                {folha.status === 'PAGA' ? <Badge tom="positivo">Paga — folha imutavel</Badge> : null}
              </>
            }
          />

          {itemAberto ? (
            <Contracheque
              folhaId={folha.id}
              item={itemAberto}
              editavel={folha.status === 'RASCUNHO' && podeProcessar}
              aoFechar={() => setItemAberto(null)}
              aoSalvar={() => {
                setItemAberto(null);
                detalhe.recarregar();
              }}
            />
          ) : null}

          {abrindoRemessa ? (
            <ModalRemessa
              aberto
              aoFechar={() => setAbrindoRemessa(false)}
              origem="FOLHA"
              origemId={folha.id}
              descricao={`${rotuloCompetencia(folha.competencia)} · ${formatarBRL(folha.totalTransferir)}`}
              dataSugerida={folha.dataPagamento || hojeISO()}
              gerar={(dados) => apiFolhas.gerarRemessa(folha.id, dados)}
              aoGerar={() => {
                detalhe.recarregar();
                lista.recarregar();
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Contracheque({
  folhaId,
  item,
  editavel,
  aoFechar,
  aoSalvar,
}: {
  folhaId: string;
  item: ItemFolha;
  editavel: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}): JSX.Element {
  const [outrosProventos, setOutrosProventos] = useState(item.outrosProventos);
  const [outrosDescontos, setOutrosDescontos] = useState(item.outrosDescontos);
  const [horasExtras, setHorasExtras] = useState(item.horasExtras);
  const acao = useAcao();

  const completo = useRequisicao(() => apiFolhas.obterItem(folhaId, item.colaboradorId), [folhaId, item.colaboradorId]);
  const dados = completo.dados ?? item;

  async function salvar(): Promise<void> {
    const atualizado = await acao.executar(() =>
      apiFolhas.ajustarItem(folhaId, item.colaboradorId, { outrosProventos, outrosDescontos, horasExtras }),
    );
    if (atualizado) aoSalvar();
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="cheio"
      titulo={`Contracheque de ${item.colaboradorNome}`}
      subtitulo={`${item.funcao} · ${item.centroCusto} · ${formatarNumero(dados.diasTrabalhados, 0)} dias trabalhados`}
      rodape={
        <>
          <button type="button" className="botao-secundario" onClick={aoFechar}>
            Fechar
          </button>
          {editavel ? (
            <button type="button" className="botao-primario" onClick={salvar} disabled={acao.executando}>
              {acao.executando ? <Girando rotulo="Recalculando" /> : 'Salvar e recalcular item'}
            </button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {acao.erro ? <Alerta nivel="critico" titulo="Não foi possível ajustar">{acao.erro}</Alerta> : null}
        {completo.erro ? <Alerta nivel="atencao" titulo="Detalhe parcial">{completo.erro}</Alerta> : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Miniatura rotulo="Total de proventos" valor={formatarBRL(dados.totalProventos)} />
          <Miniatura rotulo="Total de descontos" valor={formatarBRL(dados.totalDescontos)} />
          <Miniatura rotulo="Salário líquido" valor={formatarBRL(dados.salarioLiquido)} />
          <Miniatura rotulo="Valor a transferir" valor={formatarBRL(dados.valorTransferir)} trilho critico={dados.valorTransferir <= 0} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Par rotulo="Base INSS" valor={formatarBRL(dados.baseINSS)} />
          <Par rotulo="Base IRRF" valor={formatarBRL(dados.baseIRRF)} />
          <Par rotulo="Base FGTS" valor={formatarBRL(dados.baseFGTS)} />
          <Par rotulo="FGTS do mês" valor={formatarBRL(dados.fgts)} />
          <Par rotulo="Salário-familia" valor={formatarBRL(dados.salarioFamilia)} />
          <Par rotulo="Vale-transporte" valor={formatarBRL(dados.descontoValeTransporte)} />
          <Par rotulo="Faltas" valor={`${formatarNumero(dados.faltasDias, 0)} dias`} />
          <Par rotulo="Comissões adiantadas" valor={formatarBRL(dados.comissoesAdiantadas)} />
        </dl>

        {completo.carregando ? <Carregando linhas={5} /> : <TabelaVerbas verbas={dados.verbas} legenda="Verbas do contracheque" />}

        {editavel ? (
          <section className="rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] p-3">
            <h3 className="sobrancelha mb-2">Eventos avulsos</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <MoedaInput rotulo="Outros proventos" valor={outrosProventos} aoMudar={setOutrosProventos} />
              <MoedaInput rotulo="Outros descontos" valor={outrosDescontos} aoMudar={setOutrosDescontos} />
              <MoedaInput rotulo="Horas extras (valor)" valor={horasExtras} aoMudar={setHorasExtras} />
            </div>
            <p className="mt-2 text-xs text-[var(--texto-3)]">O recalculo vale so para este colaborador; o restante da folha não muda.</p>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

function Miniatura({ rotulo, valor, trilho = false, critico = false }: { rotulo: string; valor: string; trilho?: boolean; critico?: boolean }): JSX.Element {
  return (
    <div className={`rounded-md border px-3 py-2 ${trilho ? 'trilho border-ouro-300' : 'border-[var(--borda)] bg-[var(--superficie-sutil)]'}`}>
      <p className="sobrancelha">{rotulo}</p>
      <p className={`num mt-0.5 font-display text-lg font-semibold tabular-nums ${critico ? 'text-critico' : trilho ? 'text-ouro-600 dark:text-ouro-200' : ''}`}>
        {valor}
      </p>
    </div>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2 border-b border-[var(--borda)] py-1">
      <dt className="text-[var(--texto-3)]">{rotulo}</dt>
      <dd className="num font-medium tabular-nums">{valor}</dd>
    </div>
  );
}
