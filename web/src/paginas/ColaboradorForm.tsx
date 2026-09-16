import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  SITUACOES,
  TIPOS_CONTA,
  TIPOS_CONTRATO,
  TIPOS_PIX,
  chavePixValida,
  cpfValido,
  formatarBRL,
  formatarDataBR,
  hojeISO,
  listarBancos,
  pisValido,
  somenteDigitos,
  type ColaboradorEntrada,
  type Situacao,
  type TipoConta,
  type TipoContrato,
  type TipoPix,
} from '@rhmacaw/shared';
import * as apiColaboradores from '../api/colaboradores.js';
import { Abas } from '../componentes/Abas.js';
import { Alerta } from '../componentes/Alerta.js';
import { Badge } from '../componentes/Badge.js';
import { CabecalhoPagina } from '../componentes/Cartoes.js';
import { CampoArea, CampoCheck, CampoSelect, CampoTexto, Secao } from '../componentes/Campo.js';
import { Carregando, Girando } from '../componentes/Carregando.js';
import { EstadoVazio } from '../componentes/EstadoVazio.js';
import { IconeLixeira, IconeSaida } from '../componentes/Icones.js';
import { MoedaInput } from '../componentes/MoedaInput.js';
import { Modal } from '../componentes/Modal.js';
import { SimuladorRescisao } from '../componentes/SimuladorRescisao.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useAcao, useRequisicao } from '../ganchos/useRequisicao.js';
import { mascararCPF, mascararPIS } from '../util/formato.js';
import {
  EXEMPLO_PIX,
  ROTULO_CONTRATO,
  ROTULO_SITUACAO,
  ROTULO_TIPO_CONTA,
  ROTULO_TIPO_PIX,
  TOM_SITUACAO,
} from '../util/rotulos.js';

type Formulario = ColaboradorEntrada;

function formularioVazio(): Formulario {
  return {
    nome: '',
    cpf: '',
    pis: '',
    dataNascimento: null,
    funcao: '',
    setor: '',
    centroCusto: 'FOLHA TOKITO',
    tipoContrato: 'CLT',
    situacao: 'ATIVO',
    salarioBase: 0,
    salarioHora: null,
    cargaHorariaMensal: 220,
    valeTransporte: false,
    valeTransporteValorDiario: null,
    pontosComissao: 0,
    dependentesIRRF: 0,
    dependentesSalarioFamilia: 0,
    insalubridadePercentual: null,
    periculosidade: false,
    admissao: hojeISO(),
    demissao: null,
    observacoes: '',
    bancoCodigo: null,
    bancoNome: null,
    agencia: null,
    agenciaDigito: null,
    conta: null,
    contaDigito: null,
    tipoConta: 'CORRENTE',
    tipoPix: null,
    chavePix: null,
  };
}

const ABAS = [
  { chave: 'pessoais', rotulo: 'Dados pessoais' },
  { chave: 'contrato', rotulo: 'Contrato' },
  { chave: 'beneficios', rotulo: 'Beneficios' },
  { chave: 'bancarios', rotulo: 'Bancarios' },
  { chave: 'historico', rotulo: 'Historico' },
];

const BANCOS = listarBancos();

export function ColaboradorForm(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const { pode } = useAuth();
  const novo = !id;
  const somenteLeitura = !pode(novo ? 'colaboradores:criar' : 'colaboradores:editar');

  const [aba, setAba] = useState('pessoais');
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState(false);
  const [demitindo, setDemitindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const acao = useAcao();

  const registro = useRequisicao(() => apiColaboradores.obter(id as string), [id], !novo);

  useEffect(() => {
    const dados = registro.dados;
    if (!dados) return;
    const { id: _id, tenantId: _t, criadoEm: _c, atualizadoEm: _a, matricula, ...resto } = dados;
    setForm({ ...resto, matricula });
  }, [registro.dados]);

  const historico = useRequisicao(() => apiColaboradores.historico(id as string), [id], !novo && aba === 'historico');

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]): void {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setSalvo(false);
  }

  const ehIntermitente = form.tipoContrato === 'INTERMITENTE';

  const validacao = useMemo(() => {
    const encontrados: Record<string, string> = {};
    if (!form.nome.trim()) encontrados.nome = 'Informe o nome completo.';
    if (!cpfValido(form.cpf)) encontrados.cpf = 'CPF invalido — confira os digitos.';
    if (form.pis && !pisValido(form.pis)) encontrados.pis = 'PIS/PASEP invalido.';
    if (!form.funcao.trim()) encontrados.funcao = 'Informe a funcao exercida.';
    if (!form.centroCusto.trim()) encontrados.centroCusto = 'Informe o centro de custo.';
    if (!form.admissao) encontrados.admissao = 'Informe a data de admissao.';
    if (ehIntermitente) {
      if (!form.salarioHora || form.salarioHora <= 0) encontrados.salarioHora = 'Intermitente precisa de valor por hora.';
    } else if (form.salarioBase <= 0) {
      encontrados.salarioBase = 'Informe o salario base.';
    }
    if (form.cargaHorariaMensal <= 0) encontrados.cargaHorariaMensal = 'Carga horaria mensal deve ser maior que zero.';
    if (form.tipoPix && form.chavePix && !chavePixValida(form.tipoPix, form.chavePix)) {
      encontrados.chavePix = `Chave PIX invalida para o tipo ${ROTULO_TIPO_PIX[form.tipoPix]}.`;
    }
    if (form.tipoPix && !form.chavePix) encontrados.chavePix = 'Informe a chave PIX ou limpe o tipo.';
    return encontrados;
  }, [form, ehIntermitente]);

  const abasComErro = useMemo(() => {
    const mapa: Record<string, string[]> = {
      pessoais: ['nome', 'cpf', 'pis'],
      contrato: ['funcao', 'centroCusto', 'admissao', 'salarioBase', 'salarioHora', 'cargaHorariaMensal'],
      beneficios: [],
      bancarios: ['chavePix'],
      historico: [],
    };
    const resultado = new Set<string>();
    for (const [nomeAba, campos] of Object.entries(mapa)) {
      if (campos.some((campo) => erros[campo])) resultado.add(nomeAba);
    }
    return resultado;
  }, [erros]);

  async function enviar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setErros(validacao);
    if (Object.keys(validacao).length > 0) return;

    const corpo: Formulario = {
      ...form,
      cpf: somenteDigitos(form.cpf),
      pis: form.pis ? somenteDigitos(form.pis) : null,
      salarioBase: ehIntermitente ? 0 : form.salarioBase,
      salarioHora: ehIntermitente ? form.salarioHora : null,
      bancoNome: form.bancoCodigo ? (BANCOS.find((b) => b.codigo === form.bancoCodigo)?.nome ?? form.bancoNome ?? null) : null,
    };

    const resultado = novo
      ? await acao.executar(() => apiColaboradores.criar(corpo))
      : await acao.executar(() => apiColaboradores.atualizar(id as string, corpo));

    if (resultado) {
      setSalvo(true);
      if (novo) navegar(`/colaboradores/${resultado.id}`, { replace: true });
      else registro.definir(resultado);
    }
  }

  if (!novo && registro.carregando && !registro.dados) {
    return (
      <div className="cartao p-4">
        <Carregando linhas={8} />
      </div>
    );
  }

  if (!novo && registro.erro) {
    return (
      <Alerta nivel="critico" titulo="Colaborador nao encontrado" acao={<Link to="/colaboradores" className="botao-secundario">Voltar</Link>}>
        {registro.erro}
      </Alerta>
    );
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        sobrancelha={novo ? 'Novo cadastro' : `Matricula ${registro.dados?.matricula ?? '—'}`}
        titulo={novo ? 'Novo colaborador' : (registro.dados?.nome ?? form.nome)}
        descricao={
          !novo && registro.dados ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tom={TOM_SITUACAO[registro.dados.situacao]}>{ROTULO_SITUACAO[registro.dados.situacao]}</Badge>
              <span>
                {registro.dados.funcao} · {registro.dados.centroCusto} · admitido em {formatarDataBR(registro.dados.admissao)}
              </span>
            </span>
          ) : (
            'Cadastro completo: dados pessoais, contrato, beneficios e conta para pagamento.'
          )
        }
        acoes={
          <>
            <Link to="/colaboradores" className="botao-secundario">
              Voltar a lista
            </Link>
            {!novo && pode('colaboradores:excluir') ? (
              <button type="button" className="botao-secundario" onClick={() => setExcluindo(true)}>
                <IconeLixeira /> Excluir
              </button>
            ) : null}
            {!novo && registro.dados && registro.dados.situacao !== 'DEMITIDO' && pode('rescisoes:criar') ? (
              <button type="button" className="botao-perigo" onClick={() => setDemitindo(true)}>
                <IconeSaida /> Demitir
              </button>
            ) : null}
          </>
        }
      />

      {acao.erro ? <Alerta nivel="critico" titulo="Nao foi possivel salvar">{acao.erro}</Alerta> : null}
      {salvo ? <Alerta nivel="sucesso" titulo="Cadastro salvo">As alteracoes valem a partir da proxima folha processada.</Alerta> : null}
      {Object.keys(erros).length > 0 ? (
        <Alerta nivel="atencao" titulo="Confira os campos destacados">
          {Object.values(erros).join(' ')}
        </Alerta>
      ) : null}

      <Abas
        abas={ABAS.map((a) => ({
          ...a,
          distintivo: abasComErro.has(a.chave) ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-critico" /> : undefined,
        }))}
        ativa={aba}
        aoMudar={setAba}
      />

      <form onSubmit={enviar} noValidate className="space-y-5">
        <div className="cartao p-4">
          {aba === 'pessoais' ? (
            <Secao titulo="Identificacao" descricao="CPF e PIS validados pelos digitos verificadores — o CNAB rejeita o lote com CPF errado.">
              <CampoTexto
                rotulo="Nome completo"
                required
                value={form.nome}
                disabled={somenteLeitura}
                onChange={(e) => alterar('nome', e.target.value.toUpperCase())}
                erro={erros.nome}
                className="sm:col-span-2"
                placeholder="Como consta na carteira de trabalho"
              />
              <CampoTexto
                rotulo="CPF"
                required
                mono
                inputMode="numeric"
                value={mascararCPF(form.cpf)}
                disabled={somenteLeitura}
                onChange={(e) => alterar('cpf', somenteDigitos(e.target.value))}
                erro={erros.cpf}
                placeholder="000.000.000-00"
              />
              <CampoTexto
                rotulo="PIS / PASEP / NIT"
                mono
                inputMode="numeric"
                value={mascararPIS(form.pis ?? '')}
                disabled={somenteLeitura}
                onChange={(e) => alterar('pis', somenteDigitos(e.target.value))}
                erro={erros.pis}
                placeholder="000.00000.00-0"
              />
              <CampoTexto
                rotulo="Data de nascimento"
                type="date"
                value={form.dataNascimento ?? ''}
                disabled={somenteLeitura}
                onChange={(e) => alterar('dataNascimento', e.target.value || null)}
              />
              <CampoTexto
                rotulo="Matricula"
                mono
                value={form.matricula ?? ''}
                disabled={somenteLeitura}
                onChange={(e) => alterar('matricula', e.target.value)}
                dica={novo ? 'Deixe em branco para o sistema gerar.' : undefined}
              />
              <CampoArea
                rotulo="Observacoes"
                value={form.observacoes ?? ''}
                disabled={somenteLeitura}
                onChange={(e) => alterar('observacoes', e.target.value)}
                className="sm:col-span-2 lg:col-span-3"
              />
            </Secao>
          ) : null}

          {aba === 'contrato' ? (
            <div className="space-y-6">
              <Secao titulo="Vinculo">
                <CampoTexto
                  rotulo="Funcao"
                  required
                  value={form.funcao}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('funcao', e.target.value.toUpperCase())}
                  erro={erros.funcao}
                  placeholder="GARCOM, CUMIM, CHEF DE PARTIDA…"
                />
                <CampoTexto
                  rotulo="Setor"
                  value={form.setor ?? ''}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('setor', e.target.value.toUpperCase())}
                  placeholder="SALAO, COZINHA, ADMINISTRATIVO"
                />
                <CampoTexto
                  rotulo="Centro de custo"
                  required
                  value={form.centroCusto}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('centroCusto', e.target.value.toUpperCase())}
                  erro={erros.centroCusto}
                  dica="Agrupa o rateio da folha (ex.: FOLHA TOKITO)."
                />
                <CampoSelect
                  rotulo="Tipo de contrato"
                  value={form.tipoContrato}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('tipoContrato', e.target.value as TipoContrato)}
                  opcoes={TIPOS_CONTRATO.map((t) => ({ valor: t, rotulo: ROTULO_CONTRATO[t] }))}
                />
                <CampoSelect
                  rotulo="Situacao"
                  value={form.situacao}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('situacao', e.target.value as Situacao)}
                  opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] }))}
                />
                <CampoTexto
                  rotulo="Data de admissao"
                  type="date"
                  required
                  value={form.admissao}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('admissao', e.target.value)}
                  erro={erros.admissao}
                />
              </Secao>

              <Secao titulo="Remuneracao">
                {ehIntermitente ? (
                  <MoedaInput
                    rotulo="Valor por hora"
                    valor={form.salarioHora ?? 0}
                    aoMudar={(v) => alterar('salarioHora', v)}
                    desabilitado={somenteLeitura}
                    erro={erros.salarioHora}
                    dica="Contrato intermitente nao tem salario mensal fixo."
                  />
                ) : (
                  <MoedaInput
                    rotulo="Salario base mensal"
                    valor={form.salarioBase}
                    aoMudar={(v) => alterar('salarioBase', v)}
                    desabilitado={somenteLeitura}
                    erro={erros.salarioBase}
                  />
                )}
                <CampoTexto
                  rotulo="Carga horaria mensal"
                  type="number"
                  min={1}
                  value={form.cargaHorariaMensal}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('cargaHorariaMensal', Number(e.target.value))}
                  erro={erros.cargaHorariaMensal}
                  dica="Base do valor da hora extra. Jornada padrao: 220h."
                />
                <div className="rounded-md border border-[var(--borda)] bg-[var(--superficie-sutil)] px-3 py-2">
                  <p className="sobrancelha">Valor da hora</p>
                  <p className="num mt-1 font-display text-lg font-semibold tabular-nums">
                    {formatarBRL(
                      ehIntermitente ? (form.salarioHora ?? 0) : form.cargaHorariaMensal > 0 ? form.salarioBase / form.cargaHorariaMensal : 0,
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--texto-3)]">Calculado a partir do salario e da jornada.</p>
                </div>
              </Secao>
            </div>
          ) : null}

          {aba === 'beneficios' ? (
            <div className="space-y-6">
              <Secao titulo="Vale-transporte" colunas={2}>
                <CampoCheck
                  rotulo="Recebe vale-transporte"
                  descricao="O desconto e limitado a 6% do salario base."
                  marcado={form.valeTransporte}
                  desabilitado={somenteLeitura}
                  aoMudar={(v) => alterar('valeTransporte', v)}
                />
                <MoedaInput
                  rotulo="Custo diario do VT"
                  valor={form.valeTransporteValorDiario ?? 0}
                  aoMudar={(v) => alterar('valeTransporteValorDiario', v)}
                  desabilitado={somenteLeitura || !form.valeTransporte}
                  dica="Soma das passagens de ida e volta por dia trabalhado."
                />
              </Secao>

              <Secao titulo="Dependentes e adicionais">
                <CampoTexto
                  rotulo="Dependentes para IRRF"
                  type="number"
                  min={0}
                  value={form.dependentesIRRF}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('dependentesIRRF', Number(e.target.value))}
                />
                <CampoTexto
                  rotulo="Dependentes para salario-familia"
                  type="number"
                  min={0}
                  value={form.dependentesSalarioFamilia}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('dependentesSalarioFamilia', Number(e.target.value))}
                  dica="Filhos ate 14 anos, dentro do teto da remuneracao."
                />
                <CampoSelect
                  rotulo="Insalubridade"
                  value={String(form.insalubridadePercentual ?? '')}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('insalubridadePercentual', e.target.value ? Number(e.target.value) : null)}
                  vazio="Sem insalubridade"
                  opcoes={[
                    { valor: '10', rotulo: 'Grau minimo — 10%' },
                    { valor: '20', rotulo: 'Grau medio — 20%' },
                    { valor: '40', rotulo: 'Grau maximo — 40%' },
                  ]}
                />
                <CampoCheck
                  rotulo="Periculosidade (30%)"
                  descricao="Adicional sobre o salario base."
                  marcado={form.periculosidade}
                  desabilitado={somenteLeitura}
                  aoMudar={(v) => alterar('periculosidade', v)}
                />
                <CampoTexto
                  rotulo="Pontos de comissao"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.pontosComissao}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('pontosComissao', Number(e.target.value))}
                  dica="Peso deste colaborador no rateio semanal das gorjetas."
                />
              </Secao>
            </div>
          ) : null}

          {aba === 'bancarios' ? (
            <div className="space-y-6">
              <Alerta nivel="info" titulo="Estes dados alimentam a remessa bancaria">
                Sem conta ou chave PIX valida, o colaborador entra na lista de inconsistencias e fica de fora do lote.
              </Alerta>

              <Secao titulo="Conta para credito">
                <CampoSelect
                  rotulo="Banco"
                  value={form.bancoCodigo ?? ''}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('bancoCodigo', e.target.value || null)}
                  vazio="Selecione o banco"
                  opcoes={BANCOS.map((b) => ({ valor: b.codigo, rotulo: `${b.codigo} — ${b.nome}` }))}
                />
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <CampoTexto
                    rotulo="Agencia"
                    mono
                    inputMode="numeric"
                    value={form.agencia ?? ''}
                    disabled={somenteLeitura}
                    onChange={(e) => alterar('agencia', somenteDigitos(e.target.value) || null)}
                  />
                  <CampoTexto
                    rotulo="Digito"
                    mono
                    maxLength={1}
                    value={form.agenciaDigito ?? ''}
                    disabled={somenteLeitura}
                    onChange={(e) => alterar('agenciaDigito', e.target.value.slice(0, 1) || null)}
                  />
                </div>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <CampoTexto
                    rotulo="Conta"
                    mono
                    inputMode="numeric"
                    value={form.conta ?? ''}
                    disabled={somenteLeitura}
                    onChange={(e) => alterar('conta', somenteDigitos(e.target.value) || null)}
                  />
                  <CampoTexto
                    rotulo="Digito"
                    mono
                    maxLength={1}
                    value={form.contaDigito ?? ''}
                    disabled={somenteLeitura}
                    onChange={(e) => alterar('contaDigito', e.target.value.slice(0, 1) || null)}
                  />
                </div>
                <CampoSelect
                  rotulo="Tipo de conta"
                  value={form.tipoConta ?? 'CORRENTE'}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('tipoConta', e.target.value as TipoConta)}
                  opcoes={TIPOS_CONTA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_CONTA[t] }))}
                />
              </Secao>

              <Secao titulo="Chave PIX" descricao="Usada no layout PIX em lote, quando a empresa nao tem convenio de folha.">
                <CampoSelect
                  rotulo="Tipo de chave"
                  value={form.tipoPix ?? ''}
                  disabled={somenteLeitura}
                  onChange={(e) => alterar('tipoPix', (e.target.value || null) as TipoPix | null)}
                  vazio="Sem chave PIX"
                  opcoes={TIPOS_PIX.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_PIX[t] }))}
                />
                <CampoTexto
                  rotulo="Chave PIX"
                  mono
                  value={form.chavePix ?? ''}
                  disabled={somenteLeitura || !form.tipoPix}
                  onChange={(e) => alterar('chavePix', e.target.value || null)}
                  erro={erros.chavePix}
                  placeholder={form.tipoPix ? EXEMPLO_PIX[form.tipoPix] : 'Escolha o tipo primeiro'}
                  dica={form.tipoPix === 'TELEFONE' ? 'Formato E.164: +55 seguido de DDD e numero.' : undefined}
                  className="sm:col-span-2"
                />
              </Secao>
            </div>
          ) : null}

          {aba === 'historico' ? (
            novo ? (
              <EstadoVazio titulo="Sem historico ainda" descricao="Salve o cadastro para comecar a registrar a linha do tempo." />
            ) : historico.carregando ? (
              <Carregando linhas={6} />
            ) : historico.erro ? (
              <Alerta nivel="critico" titulo="Nao foi possivel carregar o historico">
                {historico.erro}
              </Alerta>
            ) : (historico.dados ?? []).length === 0 ? (
              <EstadoVazio titulo="Nada registrado" descricao="Faltas, ferias, folhas e rescisao aparecem aqui conforme acontecem." />
            ) : (
              <ol className="relative space-y-0 border-l-2 border-[var(--borda)] pl-4">
                {(historico.dados ?? []).map((evento, i) => (
                  <li key={`${evento.data}-${i}`} className="relative py-2.5">
                    <span className="absolute -left-[1.42rem] top-4 h-2 w-2 rounded-full bg-arara-500 ring-4 ring-[var(--superficie)]" />
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="font-mono text-xs text-[var(--texto-3)]">{formatarDataBR(evento.data)}</span>
                      <span className="text-sm font-semibold">{evento.titulo}</span>
                      <span className="sobrancelha">{evento.tipo}</span>
                      {typeof evento.valor === 'number' ? (
                        <span className="num ml-auto text-sm font-semibold tabular-nums">{formatarBRL(evento.valor)}</span>
                      ) : null}
                    </div>
                    {evento.detalhe ? <p className="mt-0.5 text-xs text-[var(--texto-3)]">{evento.detalhe}</p> : null}
                  </li>
                ))}
              </ol>
            )
          ) : null}
        </div>

        {aba !== 'historico' && !somenteLeitura ? (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-[var(--borda)] bg-[var(--superficie)]/95 px-3 py-2.5 backdrop-blur">
            <p className="mr-auto text-xs text-[var(--texto-3)]">
              {Object.keys(validacao).length > 0
                ? `${Object.keys(validacao).length} campo(s) ainda precisam de atencao.`
                : 'Tudo certo para salvar.'}
            </p>
            <Link to="/colaboradores" className="botao-secundario">
              Cancelar
            </Link>
            <button type="submit" className="botao-primario" disabled={acao.executando}>
              {acao.executando ? <Girando rotulo="Salvando" /> : novo ? 'Cadastrar colaborador' : 'Salvar alteracoes'}
            </button>
          </div>
        ) : null}
      </form>

      <Modal
        aberto={excluindo}
        aoFechar={() => setExcluindo(false)}
        largura="estreito"
        titulo="Excluir este cadastro?"
        rodape={
          <>
            <button type="button" className="botao-secundario" onClick={() => setExcluindo(false)}>
              Manter cadastro
            </button>
            <button
              type="button"
              className="botao-perigo"
              disabled={acao.executando}
              onClick={async () => {
                const ok = await acao.executar(() => apiColaboradores.remover(id as string));
                if (ok !== null) navegar('/colaboradores');
                else setExcluindo(false);
              }}
            >
              {acao.executando ? <Girando rotulo="Excluindo" /> : 'Excluir definitivamente'}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--texto-2)]">
          A exclusao so e permitida enquanto o colaborador nao tiver folha vinculada. Se ele ja entrou em alguma folha, use{' '}
          <strong>Demitir</strong> — o historico precisa ser preservado.
        </p>
      </Modal>

      {registro.dados ? (
        <SimuladorRescisao
          aberto={demitindo}
          aoFechar={() => setDemitindo(false)}
          colaborador={registro.dados}
          origem="cadastro"
          aoEfetivar={() => {
            registro.recarregar();
            navegar('/rescisoes');
          }}
        />
      ) : null}
    </div>
  );
}
