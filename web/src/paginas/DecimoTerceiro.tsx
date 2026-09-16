import { useMemo, useState } from 'react';
import { formatarBRL, hojeISO, type DecimoTerceiro as DecimoDominio } from '@rhmacaw/shared';
import { baixarTexto } from '../api/cliente.js';
import * as apiDecimo from '../api/decimoTerceiro.js';
import { Alerta } from '../componentes/Alerta.js';
import { CabecalhoPagina, Indicador } from '../componentes/Cartoes.js';
import { CampoTexto } from '../componentes/Campo.js';
import { Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeBaixar, IconePresente } from '../componentes/Icones.js';
import { Tabela, type Coluna } from '../componentes/Tabela.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { formatarNumero, montarCSV } from '../util/formato.js';

export function DecimoTerceiro(): JSX.Element {
  const { pode } = useAuth();
  const podeProcessar = pode('folha:processar');
  const anoAtual = Number(hojeISO().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [dataPrimeira, setDataPrimeira] = useState(`${anoAtual}-11-30`);
  const [dataSegunda, setDataSegunda] = useState(`${anoAtual}-12-20`);
  const [aviso, setAviso] = useState<string | null>(null);
  const acao = useAcao();

  const lista = useRequisicao(() => apiDecimo.listar(ano), [ano]);
  const linhas = lista.dados ?? [];

  const totais = useMemo(
    () => ({
      integral: linhas.reduce((s, l) => s + l.valorIntegral, 0),
      primeira: linhas.reduce((s, l) => s + l.primeiraParcela, 0),
      segunda: linhas.reduce((s, l) => s + l.segundaParcelaLiquida, 0),
      inss: linhas.reduce((s, l) => s + l.inss, 0),
      irrf: linhas.reduce((s, l) => s + l.irrf, 0),
    }),
    [linhas],
  );

  async function processar(parcela: 1 | 2): Promise<void> {
    const folha = await acao.executar(() =>
      apiDecimo.processar({ ano, parcela, dataPagamento: parcela === 1 ? dataPrimeira : dataSegunda }),
    );
    if (folha) {
      setAviso(
        `${parcela === 1 ? '1a' : '2a'} parcela processada em ${folha.competencia} — abra a tela de Folha para conferir, fechar e gerar a remessa.`,
      );
      lista.recarregar();
    }
  }

  function exportar(): void {
    const csv = montarCSV(
      ['Colaborador', 'Avos', 'Media comissoes', 'Base', 'Integral', '1a parcela', '2a bruta', 'INSS', 'IRRF', '2a liquida', 'Total liquido'],
      linhas.map((l) => [
        l.colaboradorNome,
        l.avos,
        l.mediaComissoes,
        l.baseCalculo,
        l.valorIntegral,
        l.primeiraParcela,
        l.segundaParcelaBruta,
        l.inss,
        l.irrf,
        l.segundaParcelaLiquida,
        l.totalLiquido,
      ]),
    );
    baixarTexto(`decimo-terceiro-${ano}.csv`, csv, 'text/csv;charset=utf-8');
  }

  const colunas: Coluna<DecimoDominio>[] = [
    { chave: 'nome', titulo: 'Colaborador', valor: (l) => l.colaboradorNome, render: (l) => <span className="font-medium">{l.colaboradorNome}</span> },
    {
      chave: 'avos',
      titulo: 'Avos',
      alinhar: 'direita',
      largura: '5rem',
      valor: (l) => l.avos,
      titulo2: 'Meses com 15 dias ou mais trabalhados',
      render: (l) => <span className="font-mono">{l.avos}/12</span>,
      rodape: `${linhas.length} colab.`,
    },
    {
      chave: 'media',
      titulo: 'Media comissoes',
      alinhar: 'direita',
      valor: (l) => l.mediaComissoes,
      render: (l) => (l.mediaComissoes > 0 ? formatarBRL(l.mediaComissoes) : <span className="text-[var(--texto-3)]">—</span>),
    },
    { chave: 'base', titulo: 'Base', alinhar: 'direita', valor: (l) => l.baseCalculo, render: (l) => formatarBRL(l.baseCalculo) },
    {
      chave: 'integral',
      titulo: 'Integral',
      alinhar: 'direita',
      valor: (l) => l.valorIntegral,
      render: (l) => formatarBRL(l.valorIntegral),
      rodape: formatarBRL(totais.integral),
    },
    {
      chave: 'primeira',
      titulo: '1a parcela',
      alinhar: 'direita',
      valor: (l) => l.primeiraParcela,
      render: (l) => formatarBRL(l.primeiraParcela),
      rodape: formatarBRL(totais.primeira),
      titulo2: 'Metade do valor integral, sem descontos',
    },
    { chave: 'inss', titulo: 'INSS', alinhar: 'direita', valor: (l) => l.inss, render: (l) => formatarBRL(l.inss), rodape: formatarBRL(totais.inss) },
    { chave: 'irrf', titulo: 'IRRF', alinhar: 'direita', valor: (l) => l.irrf, render: (l) => formatarBRL(l.irrf), rodape: formatarBRL(totais.irrf) },
    {
      chave: 'segunda',
      titulo: '2a parcela',
      alinhar: 'direita',
      classe: 'trilho',
      valor: (l) => l.segundaParcelaLiquida,
      render: (l) => <span className="font-semibold text-ouro-600 dark:text-ouro-200">{formatarBRL(l.segundaParcelaLiquida)}</span>,
      rodape: formatarBRL(totais.segunda),
      titulo2: 'Liquido da segunda parcela, ja com INSS e IRRF',
    },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha={`Gratificacao natalina ${ano}`}
        titulo="Decimo terceiro"
        descricao="Avos por colaborador, base com media de comissoes e as duas parcelas."
        acoes={
          <>
            <label>
              <span className="sr-only">Ano</span>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="campo w-auto">
                {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="botao-secundario" onClick={exportar} disabled={linhas.length === 0}>
              <IconeBaixar /> Exportar CSV
            </button>
          </>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Nao foi possivel processar" aoFechar={acao.limparErro}>{acao.erro}</Alerta> : null}
      {aviso ? <Alerta nivel="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Colaboradores com direito" valor={formatarNumero(linhas.length, 0)} />
        <Indicador rotulo="13o integral" valor={formatarBRL(totais.integral)} apoio="Antes dos descontos" />
        <Indicador rotulo="1a parcela" valor={formatarBRL(totais.primeira)} apoio="Sem INSS e sem IRRF" />
        <Indicador rotulo="2a parcela liquida" valor={formatarBRL(totais.segunda)} trilho apoio="O que sai da conta em dezembro" />
      </div>

      <section className="cartao p-4">
        <h2 className="sobrancelha mb-3">Processar parcelas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoTexto
            rotulo="Pagamento da 1a parcela"
            type="date"
            value={dataPrimeira}
            onChange={(e) => setDataPrimeira(e.target.value)}
            dica="Ate 30 de novembro (art. 2o, Lei 4.749/65)."
          />
          <div className="flex items-end">
            <button type="button" className="botao-primario w-full" onClick={() => processar(1)} disabled={!podeProcessar || acao.executando || linhas.length === 0}>
              {acao.executando ? <Girando rotulo="Processando" /> : 'Processar 1a parcela'}
            </button>
          </div>
          <CampoTexto
            rotulo="Pagamento da 2a parcela"
            type="date"
            value={dataSegunda}
            onChange={(e) => setDataSegunda(e.target.value)}
            dica="Ate 20 de dezembro, com INSS e IRRF."
          />
          <div className="flex items-end">
            <button type="button" className="botao-primario w-full" onClick={() => processar(2)} disabled={!podeProcessar || acao.executando || linhas.length === 0}>
              {acao.executando ? <Girando rotulo="Processando" /> : 'Processar 2a parcela'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--texto-3)]">
          Processar gera uma folha do tipo 13o na competencia correspondente. O fechamento e a remessa acontecem na tela de Folha.
        </p>
      </section>

      <Tabela
        colunas={colunas}
        dados={linhas}
        chaveLinha={(l) => l.colaboradorId}
        carregando={lista.carregando}
        erro={lista.erro}
        busca
        placeholderBusca="Buscar colaborador"
        denso
        comRodape
        legenda="Decimo terceiro por colaborador"
        ordemInicial={{ chave: 'nome', direcao: 'asc' }}
        vazio={
          <EstadoVazio
            icone={<IconePresente />}
            titulo={`Nenhum colaborador com direito a 13o em ${ano}`}
            descricao="O calculo considera os colaboradores ativos com pelo menos um avo no ano."
          />
        }
      />
    </div>
  );
}
