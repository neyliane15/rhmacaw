import { useMemo, useState } from 'react';
import { formatarBRL, formatarDataBR, type Colaborador, type Rescisao } from '@rhmacaw/shared';
import * as apiColaboradores from '../api/colaboradores.js';
import * as apiRescisoes from '../api/rescisoes.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeBanco, IconeSaida } from '../componentes/Icones.js';
import { Modal } from '../componentes/Modal.js';
import { ModalRemessa } from '../componentes/ModalRemessa.js';
import { SimuladorRescisao } from '../componentes/SimuladorRescisao.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { TabelaVerbas } from '../componentes/TabelaVerbas.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero } from '../util/formato.js';
import { ROTULO_AVISO, ROTULO_MOTIVO, ROTULO_STATUS_FOLHA, TOM_STATUS_FOLHA } from '../util/rotulos.js';

export function Rescisoes(): JSX.Element {
  const { pode } = useAuth();
  const podeCriar = pode('rescisoes:criar');
  const podeBanco = pode('banco:gerar');

  const [simulando, setSimulando] = useState<Colaborador | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [detalhe, setDetalhe] = useState<Rescisao | null>(null);
  const [remessaDe, setRemessaDe] = useState<Rescisao | null>(null);

  const lista = useRequisicao(() => apiRescisoes.listar(), []);
  const ativos = useRequisicao(() => apiColaboradores.listar({ situacao: 'ATIVO', porPagina: 500 }), [], escolhendo);

  const rescisoes = lista.dados ?? [];
  const totais = useMemo(
    () => ({
      liquido: rescisoes.reduce((s, r) => s + r.liquido, 0),
      multa: rescisoes.reduce((s, r) => s + r.multaFGTS, 0),
    }),
    [rescisoes],
  );

  const colunas: Coluna<Rescisao>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (r) => r.colaboradorNome, render: (r) => <span className="font-medium">{r.colaboradorNome}</span> },
    {
      chave: 'desligamento',
      titulo: 'Desligamento',
      largura: '8rem',
      valor: (r) => r.dataDesligamento,
      render: (r) => <span className="font-mono text-xs">{formatarDataBR(r.dataDesligamento)}</span>,
    },
    { chave: 'motivo', titulo: 'Motivo', valor: (r) => r.motivo, render: (r) => <span className="text-xs">{ROTULO_MOTIVO[r.motivo]}</span> },
    { chave: 'aviso', titulo: 'Aviso', largura: '7rem', valor: (r) => r.tipoAviso, render: (r) => <span className="text-xs text-[var(--texto-3)]">{ROTULO_AVISO[r.tipoAviso]} · {r.diasAvisoPrevio}d</span> },
    { chave: 'proventos', titulo: 'Proventos', alinhar: 'direita', valor: (r) => r.totalProventos, render: (r) => formatarBRL(r.totalProventos) },
    { chave: 'descontos', titulo: 'Descontos', alinhar: 'direita', valor: (r) => r.totalDescontos, render: (r) => formatarBRL(r.totalDescontos) },
    { chave: 'multa', titulo: 'Multa FGTS', alinhar: 'direita', valor: (r) => r.multaFGTS, render: (r) => formatarBRL(r.multaFGTS), rodape: formatarBRL(totais.multa) },
    {
      chave: 'liquido',
      titulo: 'Liquido do TRCT',
      alinhar: 'direita',
      classe: 'trilho',
      valor: (r) => r.liquido,
      render: (r) => <span className="font-semibold text-ouro-600 dark:text-ouro-200">{formatarBRL(r.liquido)}</span>,
      rodape: formatarBRL(totais.liquido),
    },
    { chave: 'status', titulo: 'Status', largura: '7.5rem', valor: (r) => r.status, render: (r) => <Badge tom={TOM_STATUS_FOLHA[r.status]}>{ROTULO_STATUS_FOLHA[r.status]}</Badge> },
    {
      chave: 'acoes',
      titulo: '',
      largura: '9rem',
      ordenavel: false,
      render: (r) =>
        podeBanco ? (
          <button
            type="button"
            className="botao-secundario px-2 py-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setRemessaDe(r);
            }}
          >
            <IconeBanco /> Pagar
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha="Desligamentos"
        titulo="Rescisoes"
        descricao="Simule o TRCT verba a verba antes de efetivar e pague o acerto pelo banco."
        acoes={
          podeCriar ? (
            <button type="button" className="botao-primario" onClick={() => setEscolhendo(true)}>
              <IconeSaida /> Simular rescisao
            </button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Indicador rotulo="Rescisoes registradas" valor={formatarNumero(rescisoes.length, 0)} />
        <Indicador rotulo="Multa do FGTS acumulada" valor={formatarBRL(totais.multa)} />
        <Indicador rotulo="Liquido de TRCT" valor={formatarBRL(totais.liquido)} trilho />
      </div>

      <Tabela
        colunas={colunas}
        dados={rescisoes}
        chaveLinha={(r) => r.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca
        placeholderBusca="Buscar por colaborador"
        denso
        comRodape
        legenda="Rescisoes efetivadas"
        ordemInicial={{ chave: 'desligamento', direcao: 'desc' }}
        aoClicarLinha={(r) => setDetalhe(r)}
        vazio={
          <EstadoVazio
            icone={<IconeSaida />}
            titulo="Nenhuma rescisao registrada"
            descricao="Quando um desligamento acontecer, simule o TRCT aqui antes de efetivar."
            acao={
              podeCriar ? (
                <button type="button" className="botao-primario" onClick={() => setEscolhendo(true)}>
                  Simular rescisao
                </button>
              ) : null
            }
          />
        }
      />

      <Modal
        aberto={escolhendo}
        aoFechar={() => setEscolhendo(false)}
        titulo="Quem sera desligado?"
        subtitulo="Escolha um colaborador ativo para abrir o simulador."
      >
        {ativos.carregando ? (
          <p className="py-6 text-center text-sm text-[var(--texto-3)]">Carregando colaboradores…</p>
        ) : ativos.erro ? (
          <Alerta nivel="critico" titulo="Nao foi possivel listar">{ativos.erro}</Alerta>
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {(ativos.dados?.itens ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-[var(--superficie-sutil)]"
                  onClick={() => {
                    setEscolhendo(false);
                    setSimulando(c);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.nome}</span>
                    <span className="block truncate text-xs text-[var(--texto-3)]">
                      {c.funcao} · {c.centroCusto} · admitido em {formatarDataBR(c.admissao)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-sm tabular-nums">{formatarBRL(c.salarioBase)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {simulando ? (
        <SimuladorRescisao
          aberto
          aoFechar={() => setSimulando(null)}
          colaborador={simulando}
          origem="rescisoes"
          aoEfetivar={() => lista.recarregar()}
        />
      ) : null}

      {detalhe ? (
        <Modal
          aberto
          aoFechar={() => setDetalhe(null)}
          largura="largo"
          titulo={`TRCT de ${detalhe.colaboradorNome}`}
          subtitulo={`${ROTULO_MOTIVO[detalhe.motivo]} · desligamento em ${formatarDataBR(detalhe.dataDesligamento)}`}
          rodape={
            <>
              <button type="button" className="botao-secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
              {podeBanco ? (
                <button
                  type="button"
                  className="botao-trilho"
                  onClick={() => {
                    setRemessaDe(detalhe);
                    setDetalhe(null);
                  }}
                >
                  <IconeBanco /> Gerar pagamento
                </button>
              ) : null}
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <MiniTRCT rotulo="Proventos" valor={formatarBRL(detalhe.totalProventos)} />
              <MiniTRCT rotulo="Descontos" valor={formatarBRL(detalhe.totalDescontos)} />
              <MiniTRCT rotulo="Liquido" valor={formatarBRL(detalhe.liquido)} destaque />
              <MiniTRCT rotulo="Multa FGTS" valor={formatarBRL(detalhe.multaFGTS)} />
            </div>
            <p className="text-xs text-[var(--texto-3)]">
              Aviso {ROTULO_AVISO[detalhe.tipoAviso].toLowerCase()} de {detalhe.diasAvisoPrevio} dias · seguro-desemprego{' '}
              {detalhe.habilitaSeguroDesemprego ? 'habilitado' : 'nao habilitado'} · saldo de FGTS {formatarBRL(detalhe.saldoFGTS)}
            </p>
            <TabelaVerbas verbas={detalhe.verbas} legenda="Verbas do TRCT" />
          </div>
        </Modal>
      ) : null}

      {remessaDe ? (
        <ModalRemessa
          aberto
          aoFechar={() => setRemessaDe(null)}
          origem="RESCISAO"
          origemId={remessaDe.id}
          descricao={`${remessaDe.colaboradorNome} · ${formatarBRL(remessaDe.liquido)}`}
          dataSugerida={remessaDe.dataDesligamento}
          gerar={(dados) => apiRescisoes.gerarRemessa(remessaDe.id, dados)}
          aoGerar={() => lista.recarregar()}
        />
      ) : null}
    </div>
  );
}

function MiniTRCT({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }): JSX.Element {
  return (
    <div className={`rounded-md border px-3 py-2 ${destaque ? 'trilho border-ouro-300' : 'border-[var(--borda)] bg-[var(--superficie-sutil)]'}`}>
      <p className="sobrancelha">{rotulo}</p>
      <p className={`num mt-0.5 font-display text-lg font-semibold tabular-nums ${destaque ? 'text-ouro-600 dark:text-ouro-200' : ''}`}>{valor}</p>
    </div>
  );
}
