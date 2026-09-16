import { useEffect, useMemo, useState } from 'react';
import {
  ORIGENS_REMESSA,
  STATUS_REMESSA,
  formatarBRL,
  formatarCNPJ,
  formatarDataBR,
  rotuloCompetencia,
  somenteDigitos,
  type ContaPagadora,
  type OrigemRemessa,
  type Remessa,
  type StatusRemessa,
} from '@rhmacaw/shared';
import { baixarTexto } from '../api/cliente.js';
import * as apiBanco from '../api/banco.js';
import * as apiComissoes from '../api/comissoes.js';
import * as apiFolhas from '../api/folhas.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoSelect, CampoTexto, Secao } from '../componentes/Campo.js';
import { Carregando, Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeBaixar, IconeBanco, IconeEngrenagem } from '../componentes/Icones.js';
import { Modal } from '../componentes/Modal.js';
import { ModalRemessa } from '../componentes/ModalRemessa.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { TrilhoPagamento, etapaDaRemessa } from '../componentes/TrilhoPagamento.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero, mascararCNPJ } from '../util/formato.js';
import { ROTULO_LAYOUT, ROTULO_ORIGEM, ROTULO_STATUS_REMESSA, TOM_STATUS_REMESSA } from '../util/rotulos.js';

/** Proximo estado permitido no ciclo da remessa. */
const PROXIMO: Partial<Record<StatusRemessa, { status: StatusRemessa; rotulo: string }>> = {
  GERADA: { status: 'ENVIADA', rotulo: 'Marcar como enviada' },
  ENVIADA: { status: 'CONFIRMADA', rotulo: 'Confirmar crédito' },
};

type OrigemSelecionavel = Extract<OrigemRemessa, 'FOLHA' | 'COMISSAO_SEMANAL'>;

export function Banco(): JSX.Element {
  const { pode } = useAuth();
  const podeGerar = pode('banco:gerar');
  const podeConfigurar = pode('banco:configurar');

  const [origem, setOrigem] = useState<OrigemSelecionavel>('FOLHA');
  const [origemId, setOrigemId] = useState('');
  const [gerando, setGerando] = useState(false);
  const [filtroOrigem, setFiltroOrigem] = useState<OrigemRemessa | ''>('');
  const [filtroStatus, setFiltroStatus] = useState<StatusRemessa | ''>('');
  const [configurando, setConfigurando] = useState(false);
  const [detalhe, setDetalhe] = useState<Remessa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const acao = useAcao();

  const remessas = useRequisicao(
    () => apiBanco.listarRemessas({ origem: filtroOrigem || undefined, status: filtroStatus || undefined }),
    [filtroOrigem, filtroStatus],
  );
  const conta = useRequisicao(() => apiBanco.obterConta(), []);
  const folhasFechadas = useRequisicao(() => apiFolhas.listar({ status: 'FECHADA' }), []);
  const semanasFechadas = useRequisicao(
    () => apiComissoes.listarPeriodos({ ano: new Date().getFullYear(), status: 'FECHADO' }),
    [],
  );

  const fontes = useMemo(() => {
    if (origem === 'FOLHA') {
      return (folhasFechadas.dados ?? []).map((f) => ({
        id: f.id,
        rotulo: `${rotuloCompetencia(f.competencia)} · ${f.quantidadeColaboradores} colab. · ${formatarBRL(f.totalTransferir)}`,
        valor: f.totalTransferir,
        data: f.dataPagamento,
      }));
    }
    return (semanasFechadas.dados ?? []).map((p) => ({
      id: p.id,
      rotulo: `Semana ${String(p.semana).padStart(2, '0')}/${p.ano} · ${formatarDataBR(p.dataInicio)} a ${formatarDataBR(p.dataFim)} · ${formatarBRL(p.totalDistribuido)}`,
      valor: p.totalDistribuido,
      data: p.dataFim,
    }));
  }, [origem, folhasFechadas.dados, semanasFechadas.dados]);

  useEffect(() => {
    const primeira = fontes[0];
    setOrigemId((atual) => (fontes.some((f) => f.id === atual) ? atual : (primeira?.id ?? '')));
  }, [fontes]);

  const fonteEscolhida = fontes.find((f) => f.id === origemId);
  const lista = remessas.dados ?? [];
  const pendentes = lista.filter((r) => r.status === 'GERADA' || r.status === 'ENVIADA');

  async function baixar(remessa: Remessa): Promise<void> {
    const conteudo = await acao.executar(() => apiBanco.baixarArquivo(remessa.id));
    if (conteudo !== null) baixarTexto(remessa.nomeArquivo, conteudo);
  }

  async function avancarStatus(remessa: Remessa, status: StatusRemessa): Promise<void> {
    const atualizada = await acao.executar(() => apiBanco.mudarStatus(remessa.id, status));
    if (atualizada) {
      remessas.recarregar();
      setDetalhe((atual) => (atual && atual.id === atualizada.id ? atualizada : atual));
      setAviso(`Remessa ${atualizada.numeroRemessa} agora esta ${ROTULO_STATUS_REMESSA[atualizada.status].toLowerCase()}.`);
    }
  }

  const colunas: Coluna<Remessa>[] = [
    {
      chave: 'número',
      titulo: 'NSA',
      largura: '4.5rem',
      valor: (r) => r.numeroRemessa,
      render: (r) => <span className="font-mono text-xs">{String(r.numeroRemessa).padStart(6, '0')}</span>,
      titulo2: 'Número sequencial da remessa no banco',
    },
    {
      chave: 'descrição',
      titulo: 'Remessa',
      valor: (r) => r.descricao,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.descricao}</p>
          <p className="truncate font-mono text-2xs text-[var(--texto-3)]">{r.nomeArquivo}</p>
        </div>
      ),
    },
    { chave: 'origem', titulo: 'Origem', largura: '9rem', valor: (r) => r.origem, render: (r) => <span className="text-xs">{ROTULO_ORIGEM[r.origem]}</span> },
    { chave: 'layout', titulo: 'Layout', largura: '7rem', valor: (r) => r.layout, render: (r) => <span className="font-mono text-2xs uppercase">{r.layout}</span> },
    {
      chave: 'data',
      titulo: 'Pagamento',
      largura: '7.5rem',
      valor: (r) => r.dataPagamento,
      render: (r) => <span className="font-mono text-xs">{formatarDataBR(r.dataPagamento)}</span>,
    },
    { chave: 'qtd', titulo: 'Pgtos', alinhar: 'direita', largura: '5rem', valor: (r) => r.quantidadePagamentos },
    {
      chave: 'valor',
      titulo: 'Valor total',
      alinhar: 'direita',
      classe: 'trilho',
      valor: (r) => r.valorTotal,
      render: (r) => <span className="font-semibold text-ouro-600 dark:text-ouro-200">{formatarBRL(r.valorTotal)}</span>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '10rem',
      valor: (r) => r.status,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge tom={TOM_STATUS_REMESSA[r.status]}>{ROTULO_STATUS_REMESSA[r.status]}</Badge>
          {r.inconsistencias.length > 0 ? (
            <span title={r.inconsistencias.join('; ')} className="text-2xs font-semibold text-critico">
              {r.inconsistencias.length}!
            </span>
          ) : null}
        </div>
      ),
    },
    {
      chave: 'ações',
      titulo: '',
      largura: '12rem',
      ordenavel: false,
      render: (r) => {
        const proximo = PROXIMO[r.status];
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="botao-secundario px-2 py-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                void baixar(r);
              }}
            >
              <IconeBaixar /> Baixar
            </button>
            {proximo && podeGerar ? (
              <button
                type="button"
                className="botao-primario px-2 py-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  void avancarStatus(r, proximo.status);
                }}
              >
                {proximo.status === 'ENVIADA' ? 'Enviar' : 'Confirmar'}
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha="Tesouraria"
        titulo="Banco e remessas"
        descricao="A ponte entre o relatório e o crédito na conta do colaborador."
        acoes={
          <button type="button" className="botao-secundario" onClick={() => setConfigurando(true)}>
            <IconeEngrenagem /> Conta pagadora
          </button>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Operacao recusada" aoFechar={acao.limparErro}>{acao.erro}</Alerta> : null}
      {aviso ? <Alerta nivel="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta> : null}
      {conta.erro ? (
        <Alerta
          nivel="atencao"
          titulo="Conta pagadora não configurada"
          acao={
            <button type="button" className="botao-secundario" onClick={() => setConfigurando(true)}>
              Configurar
            </button>
          }
        >
          O CNAB precisa do convenio, da agencia e da conta da empresa para montar o header do arquivo.
        </Alerta>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Remessas geradas" valor={formatarNumero(lista.length, 0)} />
        <Indicador rotulo="Aguardando o banco" valor={formatarNumero(pendentes.length, 0)} apoio="Geradas ou enviadas, sem confirmação" />
        <Indicador
          rotulo="Valor em transito"
          valor={formatarBRL(pendentes.reduce((s, r) => s + r.valorTotal, 0))}
          trilho
          apoio="Ainda não confirmado pelo banco"
        />
        <Indicador
          rotulo="Confirmado"
          valor={formatarBRL(lista.filter((r) => r.status === 'CONFIRMADA').reduce((s, r) => s + r.valorTotal, 0))}
        />
      </div>

      <section className="cartão p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="sobrancelha">Nova remessa</h2>
          <span className="text-xs text-[var(--texto-3)]">Somente folhas fechadas e semanas de comissão fechadas entram no lote.</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[13rem_1fr_auto]">
          <CampoSelect
            rotulo="Origem do pagamento"
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemSelecionavel)}
            opcoes={[
              { valor: 'FOLHA', rotulo: 'Folha fechada' },
              { valor: 'COMISSAO_SEMANAL', rotulo: 'Semana de comissão fechada' },
            ]}
          />
          <CampoSelect
            rotulo={origem === 'FOLHA' ? 'Folha' : 'Semana'}
            value={origemId}
            onChange={(e) => setOrigemId(e.target.value)}
            vazio={fontes.length === 0 ? 'Nenhuma origem fechada disponível' : undefined}
            opcoes={fontes.map((f) => ({ valor: f.id, rotulo: f.rotulo }))}
            dica={
              folhasFechadas.carregando || semanasFechadas.carregando
                ? 'Carregando origens…'
                : fontes.length === 0
                  ? origem === 'FOLHA'
                    ? 'Feche uma folha na tela de Folha para liberar o pagamento.'
                    : 'Feche uma semana na tela de Comissões para liberar o pagamento.'
                  : undefined
            }
          />
          <div className="flex items-end">
            <button type="button" className="botao-trilho w-full" onClick={() => setGerando(true)} disabled={!podeGerar || !origemId}>
              <IconeBanco /> Conferir e gerar
            </button>
          </div>
        </div>
      </section>

      <Tabela
        colunas={colunas}
        dados={lista}
        chaveLinha={(r) => r.id}
        carregando={remessas.carregando}
        erro={remessas.erro}
        denso
        busca
        placeholderBusca="Buscar por descrição ou arquivo"
        legenda="Remessas bancarias"
        ordemInicial={{ chave: 'número', direcao: 'desc' }}
        aoClicarLinha={(r) => setDetalhe(r)}
        vazio={
          <EstadoVazio
            icone={<IconeBanco />}
            titulo="Nenhuma remessa gerada"
            descricao="Feche uma folha ou uma semana de comissão e gere o primeiro lote de pagamento."
          />
        }
        filtros={
          <div className="flex flex-wrap items-center gap-2">
            <label>
              <span className="sr-only">Origem</span>
              <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value as OrigemRemessa | '')} className="campo w-auto">
                <option value="">Todas as origens</option>
                {ORIGENS_REMESSA.map((o) => (
                  <option key={o} value={o}>
                    {ROTULO_ORIGEM[o]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Status</span>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusRemessa | '')} className="campo w-auto">
                <option value="">Todos os status</option>
                {STATUS_REMESSA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_REMESSA[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      {gerando && fonteEscolhida ? (
        <ModalRemessa
          aberto
          aoFechar={() => setGerando(false)}
          origem={origem}
          origemId={origemId}
          descricao={fonteEscolhida.rotulo}
          dataSugerida={fonteEscolhida.data}
          gerar={(dados) =>
            origem === 'FOLHA' ? apiFolhas.gerarRemessa(origemId, dados) : apiComissoes.gerarRemessa(origemId, dados)
          }
          aoGerar={() => {
            remessas.recarregar();
            folhasFechadas.recarregar();
            semanasFechadas.recarregar();
          }}
        />
      ) : null}

      {detalhe ? (
        <Modal
          aberto
          aoFechar={() => setDetalhe(null)}
          largura="largo"
          titulo={`Remessa ${String(detalhe.numeroRemessa).padStart(6, '0')}`}
          subtitulo={`${ROTULO_ORIGEM[detalhe.origem]} · ${ROTULO_LAYOUT[detalhe.layout]} · pagamento em ${formatarDataBR(detalhe.dataPagamento)}`}
          rodape={
            <>
              <button type="button" className="botao-secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
              <button type="button" className="botao-secundario" onClick={() => void baixar(detalhe)}>
                <IconeBaixar /> Baixar arquivo
              </button>
              {podeGerar && detalhe.status !== 'CONFIRMADA' && detalhe.status !== 'CANCELADA' ? (
                <button type="button" className="botao-secundario" onClick={() => void avancarStatus(detalhe, 'REJEITADA')}>
                  Marcar como rejeitada
                </button>
              ) : null}
              {podeGerar && PROXIMO[detalhe.status] ? (
                <button
                  type="button"
                  className="botao-trilho"
                  onClick={() => {
                    const proximo = PROXIMO[detalhe.status];
                    if (proximo) void avancarStatus(detalhe, proximo.status);
                  }}
                >
                  {PROXIMO[detalhe.status]?.rotulo}
                </button>
              ) : null}
            </>
          }
        >
          <div className="space-y-4">
            <TrilhoPagamento etapa={etapaDaRemessa(detalhe.status)} />

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
                <p className="sobrancelha">Pagamentos</p>
                <p className="num mt-0.5 font-display text-lg font-semibold">{detalhe.quantidadePagamentos}</p>
              </div>
              <div className="trilho rounded-md px-3 py-2">
                <p className="sobrancelha">Valor total</p>
                <p className="num mt-0.5 font-display text-lg font-semibold text-ouro-600 dark:text-ouro-200">{formatarBRL(detalhe.valorTotal)}</p>
              </div>
              <div className="rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
                <p className="sobrancelha">Arquivo</p>
                <p className="mt-0.5 truncate font-mono text-xs">{detalhe.nomeArquivo}</p>
              </div>
            </div>

            {detalhe.inconsistencias.length > 0 ? (
              <Alerta nivel="atencao" titulo={`${detalhe.inconsistencias.length} favorecido(s) fora do lote`}>
                <ul className="list-inside list-disc space-y-0.5">
                  {detalhe.inconsistencias.map((texto, i) => (
                    <li key={`${texto}-${i}`}>{texto}</li>
                  ))}
                </ul>
              </Alerta>
            ) : null}

            <section>
              <h3 className="sobrancelha mb-1">Conteudo do arquivo</h3>
              <pre className="rolagem-fina max-h-64 overflow-auto rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] p-3 font-mono text-2xs leading-relaxed">
                {detalhe.conteudo || '(arquivo vazio)'}
              </pre>
            </section>
          </div>
        </Modal>
      ) : null}

      <ModalConta
        aberto={configurando}
        aoFechar={() => setConfigurando(false)}
        atual={conta.dados}
        carregando={conta.carregando}
        somenteLeitura={!podeConfigurar}
        aoSalvar={(salva) => {
          conta.definir(salva);
          setConfigurando(false);
          setAviso('Conta pagadora atualizada.');
        }}
      />
    </div>
  );
}

function ModalConta({
  aberto,
  aoFechar,
  atual,
  carregando,
  somenteLeitura,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  atual: ContaPagadora | null;
  carregando: boolean;
  somenteLeitura: boolean;
  aoSalvar: (conta: ContaPagadora) => void;
}): JSX.Element {
  const [form, setForm] = useState<ContaPagadora>({
    bancoCodigo: '',
    bancoNome: '',
    agencia: '',
    agenciaDigito: '',
    conta: '',
    contaDigito: '',
    convenio: '',
    nomeEmpresa: '',
    cnpj: '',
  });
  const acao = useAcao();
  const bancos = useRequisicao(() => apiBanco.listarBancos(), [], aberto);

  useEffect(() => {
    if (atual) setForm(atual);
  }, [atual]);

  function alterar<K extends keyof ContaPagadora>(campo: K, valor: ContaPagadora[K]): void {
    setForm((a) => ({ ...a, [campo]: valor }));
  }

  async function salvar(): Promise<void> {
    const nomeBanco = bancos.dados?.find((b) => b.codigo === form.bancoCodigo)?.nome ?? form.bancoNome;
    const salva = await acao.executar(() => apiBanco.salvarConta({ ...form, bancoNome: nomeBanco, cnpj: somenteDigitos(form.cnpj) }));
    if (salva) aoSalvar(salva);
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Conta pagadora da empresa"
      subtitulo="Dados que vao no header do arquivo CNAB e identificam o débito."
      rodape={
        <>
          <button type="button" className="botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          {!somenteLeitura ? (
            <button type="button" className="botao-primario" onClick={salvar} disabled={acao.executando}>
              {acao.executando ? <Girando rotulo="Salvando" /> : 'Salvar conta'}
            </button>
          ) : null}
        </>
      }
    >
      {carregando ? (
        <Carregando linhas={6} />
      ) : (
        <div className="space-y-5">
          {acao.erro ? <Alerta nivel="critico" titulo="Não foi possível salvar">{acao.erro}</Alerta> : null}
          <Secao titulo="Empresa" colunas={2}>
            <CampoTexto rotulo="Razão social" value={form.nomeEmpresa} disabled={somenteLeitura} onChange={(e) => alterar('nomeEmpresa', e.target.value.toUpperCase())} />
            <CampoTexto rotulo="CNPJ" mono value={mascararCNPJ(form.cnpj)} disabled={somenteLeitura} onChange={(e) => alterar('cnpj', somenteDigitos(e.target.value))} />
          </Secao>
          <Secao titulo="Conta de débito" colunas={2}>
            <CampoSelect
              rotulo="Banco"
              value={form.bancoCodigo}
              disabled={somenteLeitura}
              onChange={(e) => alterar('bancoCodigo', e.target.value)}
              vazio="Selecione o banco"
              opcoes={(bancos.dados ?? []).map((b) => ({ valor: b.codigo, rotulo: `${b.codigo} — ${b.nome}` }))}
            />
            <CampoTexto
              rotulo="Convênio / contrato de pagamento"
              mono
              value={form.convenio}
              disabled={somenteLeitura}
              onChange={(e) => alterar('convenio', e.target.value)}
              dica="Código que o banco fornece para folha de pagamento."
            />
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <CampoTexto rotulo="Agência" mono value={form.agencia} disabled={somenteLeitura} onChange={(e) => alterar('agencia', somenteDigitos(e.target.value))} />
              <CampoTexto rotulo="Digito" mono maxLength={1} value={form.agenciaDigito} disabled={somenteLeitura} onChange={(e) => alterar('agenciaDigito', e.target.value.slice(0, 1))} />
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <CampoTexto rotulo="Conta" mono value={form.conta} disabled={somenteLeitura} onChange={(e) => alterar('conta', somenteDigitos(e.target.value))} />
              <CampoTexto rotulo="Digito" mono maxLength={1} value={form.contaDigito} disabled={somenteLeitura} onChange={(e) => alterar('contaDigito', e.target.value.slice(0, 1))} />
            </div>
          </Secao>
          {form.cnpj ? <p className="text-xs text-[var(--texto-3)]">CNPJ formatado: {formatarCNPJ(form.cnpj)}</p> : null}
        </div>
      )}
    </Modal>
  );
}
