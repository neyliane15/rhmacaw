import { useEffect, useState } from 'react';
import {
  LAYOUTS_BANCARIOS,
  formatarBRL,
  formatarCPF,
  hojeISO,
  type DataISO,
  type LayoutBancario,
  type OrigemRemessa,
  type Remessa,
} from '@rhmacaw/shared';
import * as apiBanco from '../api/banco.js';
import type { PreviaRemessa } from '../api/tipos.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { ROTULO_LAYOUT, ROTULO_ORIGEM } from '../util/rotulos.js';
import { Alerta } from './Alerta.js';
import { Badge } from './Badge.js';
import { CampoSelect, CampoTexto } from './Campo.js';
import { Girando } from './Carregando.js';
import { IconeBanco } from './Icones.js';
import { Modal } from './Modal.js';
import { TrilhoPagamento } from './TrilhoPagamento.js';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  origem: OrigemRemessa;
  origemId: string;
  descricao: string;
  /** Rota especifica do recurso (folha, periodo de comissao, rescisao). */
  gerar: (dados: { layout: LayoutBancario; bancoCodigo: string; dataPagamento: DataISO }) => Promise<Remessa>;
  aoGerar?: (remessa: Remessa) => void;
  dataSugerida?: DataISO;
}

/**
 * A ponte relatorio -> banco. Sempre em dois passos: primeiro a previa
 * (`POST /banco/previa`, que nao grava nada), depois a geracao de verdade.
 */
export function ModalRemessa({ aberto, aoFechar, origem, origemId, descricao, gerar, aoGerar, dataSugerida }: Props): JSX.Element {
  const [layout, setLayout] = useState<LayoutBancario>('CNAB240');
  const [bancoCodigo, setBancoCodigo] = useState('');
  const [dataPagamento, setDataPagamento] = useState<DataISO>(dataSugerida ?? hojeISO());
  const [previa, setPrevia] = useState<PreviaRemessa | null>(null);
  const [gerada, setGerada] = useState<Remessa | null>(null);
  const acao = useAcao();

  const bancos = useRequisicao(() => apiBanco.listarBancos(), [], aberto);
  const conta = useRequisicao(() => apiBanco.obterConta(), [], aberto);

  useEffect(() => {
    if (!bancoCodigo && conta.dados?.bancoCodigo) setBancoCodigo(conta.dados.bancoCodigo);
  }, [conta.dados, bancoCodigo]);

  useEffect(() => {
    if (!aberto) {
      setPrevia(null);
      setGerada(null);
    }
  }, [aberto]);

  async function conferir(): Promise<void> {
    setGerada(null);
    const resultado = await acao.executar(() =>
      apiBanco.previa({ origem, origemId, layout, bancoCodigo, dataPagamento }),
    );
    if (resultado) setPrevia(resultado);
  }

  async function confirmar(): Promise<void> {
    const remessa = await acao.executar(() => gerar({ layout, bancoCodigo, dataPagamento }));
    if (remessa) {
      setGerada(remessa);
      aoGerar?.(remessa);
    }
  }

  const validos = (previa?.favorecidos ?? []).filter((f) => f.valido);
  const invalidos = (previa?.favorecidos ?? []).filter((f) => !f.valido);
  const bancoSuportaPix = bancos.dados?.find((b) => b.codigo === bancoCodigo)?.suportaPix ?? true;

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="largo"
      titulo="Gerar pagamento no banco"
      subtitulo={`${ROTULO_ORIGEM[origem]} · ${descricao}`}
      rodape={
        gerada ? (
          <button type="button" className="botao-primario" onClick={aoFechar}>
            Concluir
          </button>
        ) : (
          <>
            <button type="button" className="botao-secundario" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="button" className="botao-secundario" onClick={conferir} disabled={acao.executando || !bancoCodigo}>
              {acao.executando && !previa ? <Girando rotulo="Conferindo" /> : 'Conferir previa'}
            </button>
            <button
              type="button"
              className="botao-trilho"
              onClick={confirmar}
              disabled={acao.executando || !previa || validos.length === 0}
            >
              <IconeBanco /> {acao.executando && previa ? 'Gerando…' : `Gerar remessa (${validos.length})`}
            </button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <TrilhoPagamento etapa={gerada ? 'gerada' : previa ? 'previa' : 'origem'} />

        {acao.erro ? <Alerta nivel="critico" titulo="Nao foi possivel continuar">{acao.erro}</Alerta> : null}
        {conta.erro ? (
          <Alerta nivel="atencao" titulo="Conta pagadora nao configurada">
            Configure a conta da empresa na tela do banco antes de gerar o arquivo. {conta.erro}
          </Alerta>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <CampoSelect
            rotulo="Layout do arquivo"
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value as LayoutBancario);
              setPrevia(null);
            }}
            opcoes={LAYOUTS_BANCARIOS.map((l) => ({ valor: l, rotulo: ROTULO_LAYOUT[l] }))}
          />
          <CampoSelect
            rotulo="Banco pagador"
            value={bancoCodigo}
            onChange={(e) => {
              setBancoCodigo(e.target.value);
              setPrevia(null);
            }}
            vazio="Selecione o banco"
            opcoes={(bancos.dados ?? []).map((b) => ({ valor: b.codigo, rotulo: `${b.codigo} — ${b.nome}` }))}
          />
          <CampoTexto
            rotulo="Data do pagamento"
            type="date"
            value={dataPagamento}
            onChange={(e) => {
              setDataPagamento(e.target.value);
              setPrevia(null);
            }}
          />
        </div>

        {layout === 'PIX_CSV' && !bancoSuportaPix ? (
          <Alerta nivel="atencao" titulo="Este banco nao aceita PIX em lote">
            Escolha o layout CNAB 240 ou outro banco para este pagamento.
          </Alerta>
        ) : null}

        {gerada ? (
          <Alerta nivel="sucesso" titulo={`Remessa ${gerada.numeroRemessa} gerada`}>
            {gerada.quantidadePagamentos} pagamento(s), total de {formatarBRL(gerada.valorTotal)}. Arquivo{' '}
            <span className="font-mono">{gerada.nomeArquivo}</span> disponivel na tela do banco.
          </Alerta>
        ) : null}

        {previa ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
                <p className="sobrancelha">Favorecidos validos</p>
                <p className="num mt-0.5 font-display text-lg font-semibold">{validos.length}</p>
              </div>
              <div className="trilho rounded-md px-3 py-2">
                <p className="sobrancelha">Valor do lote</p>
                <p className="num mt-0.5 font-display text-lg font-semibold text-ouro-600 dark:text-ouro-200">
                  {formatarBRL(validos.reduce((s, f) => s + f.valor, 0))}
                </p>
              </div>
              <div
                className={`rounded-md border px-3 py-2 ${
                  invalidos.length > 0 ? 'border-critico/45 bg-critico/[0.07]' : 'border-[var(--borda)] bg-[var(--superficie-sutil)]'
                }`}
              >
                <p className="sobrancelha">Inconsistencias</p>
                <p className={`num mt-0.5 font-display text-lg font-semibold ${invalidos.length > 0 ? 'text-critico' : ''}`}>
                  {invalidos.length}
                </p>
              </div>
            </div>

            {previa.inconsistencias.length > 0 ? (
              <Alerta nivel="atencao" titulo="Fora do lote">
                <ul className="list-inside list-disc space-y-0.5">
                  {previa.inconsistencias.map((texto, i) => (
                    <li key={`${texto}-${i}`}>{texto}</li>
                  ))}
                </ul>
              </Alerta>
            ) : null}

            <div className="overflow-hidden rounded-md border border-[var(--borda)]">
              <div className="tabela-rolagem rolagem-fina max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Favorecidos da remessa</caption>
                  <thead className="sticky top-0 bg-[var(--superficie-sutil)]">
                    <tr className="border-b border-[var(--borda-forte)] text-left">
                      <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Favorecido</th>
                      <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Credito em</th>
                      <th className="px-2.5 py-1.5 text-right font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Valor</th>
                      <th className="px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wide text-[var(--texto-3)]">Situacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previa.favorecidos ?? []).map((f) => (
                      <tr
                        key={f.colaboradorId}
                        className={`border-b border-[var(--borda)] last:border-0 ${f.valido ? '' : 'bg-critico/[0.07]'}`}
                      >
                        <td className="px-2.5 py-1.5">
                          <p className="font-medium">{f.nome}</p>
                          <p className="font-mono text-2xs text-[var(--texto-3)]">{f.cpf ? formatarCPF(f.cpf) : 'sem CPF'}</p>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-2xs text-[var(--texto-3)]">
                          {f.chavePix
                            ? `PIX ${f.tipoPix ?? ''} ${f.chavePix}`
                            : f.bancoCodigo
                              ? `${f.bancoCodigo} ag. ${f.agencia ?? '—'} cc ${f.conta ?? '—'}`
                              : 'sem conta cadastrada'}
                        </td>
                        <td className="num px-2.5 py-1.5 text-right font-semibold tabular-nums">{formatarBRL(f.valor)}</td>
                        <td className="px-2.5 py-1.5">
                          {f.valido ? (
                            <Badge tom="positivo">No lote</Badge>
                          ) : (
                            <Badge tom="critico" titulo={(f.motivos ?? []).join('; ')}>
                              {(f.motivos ?? [])[0] ?? 'Fora do lote'}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : !gerada ? (
          <p className="rounded-md border border-dashed border-[var(--borda-forte)] px-3 py-6 text-center text-sm text-[var(--texto-3)]">
            Escolha o layout e o banco e clique em <strong>Conferir previa</strong>. Nada e gravado ate voce confirmar.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
