/**
 * Carga inicial do RH Macaw a partir da planilha de agosto/2025 do cliente.
 *
 * O seed e IDEMPOTENTE: cada entidade e procurada por uma chave natural
 * (CNPJ do tenant, e-mail do usuario, CPF do colaborador, semana do periodo)
 * antes de ser criada. Rodar duas vezes nao duplica nada.
 *
 * Os dados pessoais reais (CPF, banco, PIX) nao vieram na planilha: sao
 * gerados de forma sintetica mas VALIDA (digitos verificadores corretos), para
 * que o cadastro passe pelas mesmas validacoes que um cadastro de producao e a
 * remessa bancaria possa ser gerada de verdade.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ColaboradorEntrada,
  Competencia,
  ContaPagadora,
  DataISO,
  Situacao,
  TipoContrato,
} from '@rhmacaw/shared';
import { arredondar, intervaloDaSemanaISO, somar } from '@rhmacaw/shared';
import { config } from '../config.js';
import { gerarHash } from '../auth/senha.js';
import * as comissaoServico from '../servicos/comissaoServico.js';
import * as folhaServico from '../servicos/folhaServico.js';
import { fecharBanco, obterBanco } from './conexao.js';
import * as repoColaboradores from './repositorios/colaboradores.js';
import * as repoComissoes from './repositorios/comissoes.js';
import * as repoConta from './repositorios/contaPagadora.js';
import * as repoFaltas from './repositorios/faltas.js';
import * as repoFolhas from './repositorios/folhas.js';
import * as repoTenants from './repositorios/tenants.js';
import * as repoUsuarios from './repositorios/usuarios.js';

/* ------------------------------------------------------------------ *
 * Dados de origem
 * ------------------------------------------------------------------ */

interface ColaboradorPlanilha {
  nome: string;
  funcao: string;
  centroCusto: string;
  tipoContrato: TipoContrato;
  situacao: Situacao;
  salarioBase: number;
  salarioHora: number | null;
  valeTransporte: boolean;
  faltasAgosto: number;
  horasTrabalhadas: number | null;
}

interface ReferenciaFolha {
  nome: string;
  comissoes: number;
  liquido: number;
  transferir: number;
}

interface DadosSeed {
  competencia: Competencia;
  origem: string;
  colaboradores: ColaboradorPlanilha[];
  referenciaFolha: ReferenciaFolha[];
}

function carregarDados(): DadosSeed {
  const diretorio = path.dirname(fileURLToPath(import.meta.url));
  // Apos `tsc -b` o arquivo continua apenas em `src`; tenta os dois caminhos.
  const candidatos = [
    path.join(diretorio, 'seed-dados.json'),
    path.resolve(diretorio, '../../src/db/seed-dados.json'),
  ];
  for (const candidato of candidatos) {
    if (fs.existsSync(candidato)) return JSON.parse(fs.readFileSync(candidato, 'utf8')) as DadosSeed;
  }
  throw new Error(`seed-dados.json nao encontrado. Procurado em: ${candidatos.join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * Documentos sinteticos validos
 * ------------------------------------------------------------------ */

/** Digito verificador do CPF: modulo 11 com pesos decrescentes. */
function digitoCPF(parcial: string): number {
  const tamanho = parcial.length;
  let soma = 0;
  for (let i = 0; i < tamanho; i += 1) soma += Number(parcial[i]) * (tamanho + 1 - i);
  return ((soma * 10) % 11) % 10;
}

/** CPF deterministico por indice; o passo primo evita sequencias repetidas. */
function cpfSintetico(indice: number): string {
  const base = String(100_000_000 + indice * 7919).slice(-9);
  const dv1 = digitoCPF(base);
  const dv2 = digitoCPF(`${base}${dv1}`);
  return `${base}${dv1}${dv2}`;
}

const PESOS_PIS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function pisSintetico(indice: number): string {
  const base = String(1_200_000_000 + indice * 6421).slice(-10);
  let soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(base[i]) * (PESOS_PIS[i] as number);
  const resto = soma % 11;
  return `${base}${resto < 2 ? 0 : 11 - resto}`;
}

/** Digito verificador do CNPJ (pesos ciclicos de 2 a 9). */
function digitoCNPJ(parcial: string): number {
  let soma = 0;
  let peso = parcial.length - 7;
  for (let i = 0; i < parcial.length; i += 1) {
    soma += Number(parcial[i]) * peso;
    peso = peso - 1 < 2 ? 9 : peso - 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpjSintetico(base12: string): string {
  const dv1 = digitoCNPJ(base12);
  const dv2 = digitoCNPJ(`${base12}${dv1}`);
  return `${base12}${dv1}${dv2}`;
}

/* ------------------------------------------------------------------ *
 * Cadastro sintetico de banco e contrato
 * ------------------------------------------------------------------ */

const BANCOS_SEED = [
  { codigo: '341', nome: 'ITAU UNIBANCO S.A.' },
  { codigo: '237', nome: 'BANCO BRADESCO S.A.' },
  { codigo: '001', nome: 'BANCO DO BRASIL S.A.' },
  { codigo: '104', nome: 'CAIXA ECONOMICA FEDERAL' },
  { codigo: '260', nome: 'NU PAGAMENTOS S.A.' },
  { codigo: '077', nome: 'BANCO INTER S.A.' },
] as const;

/**
 * Admissoes distribuidas entre 2018 e 2024. Espalhar os anos faz o saldo de
 * ferias e os avos de 13o do seed ficarem realistas (uns vencidos, outros nao).
 */
function admissaoSintetica(indice: number): DataISO {
  const ano = 2018 + (indice % 7);
  const mes = ((indice * 5) % 12) + 1;
  const dia = ((indice * 11) % 28) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function nascimentoSintetico(indice: number): DataISO {
  const ano = 1978 + (indice % 25);
  const mes = ((indice * 7) % 12) + 1;
  const dia = ((indice * 13) % 28) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function cargaHoraria(tipo: TipoContrato): number {
  if (tipo === 'ESTAGIO') return 120; // 6h/dia, art. 10 da Lei 11.788/2008
  return 220; // 44h semanais
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

export const CNPJ_MACAW = cnpjSintetico('486623400001');
export const COMPETENCIA_SEED: Competencia = '2025-08';
/** Semanas ISO inteiramente dentro de agosto/2025 (04/08 a 31/08). */
const SEMANAS_AGOSTO = [32, 33, 34, 35];
/** Como o total de cada colaborador e repartido entre as 4 semanas. */
const PESOS_SEMANA = [0.22, 0.26, 0.24, 0.28];

export interface ResultadoSeed {
  tenantId: string;
  colaboradores: number;
  faltas: number;
  periodosComissao: number;
  totalComissoes: number;
  folhaId: string;
  totalFolha: number;
  totalTransferir: number;
  criado: boolean;
}

export function executarSeed(): ResultadoSeed {
  const dados = carregarDados();
  obterBanco();

  /* ---------- Tenant ---------- */
  const existente = repoTenants.buscarTenantPorCnpj(CNPJ_MACAW);
  const tenant =
    existente ??
    repoTenants.criarTenant({
      nome: 'Macaw Restaurante',
      cnpj: CNPJ_MACAW,
      cnae: '5611201',
      endereco: 'Av. Atlantica, 1702',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '22021001',
    });
  const tenantId = tenant.id;

  /* ---------- Usuario administrador ---------- */
  let adminId: string;
  const adminExistente = repoUsuarios.buscarPorEmail(config.seedAdminEmail);
  if (adminExistente) {
    adminId = adminExistente.id;
  } else {
    adminId = repoUsuarios.criarUsuario(tenantId, {
      nome: 'Administrador Macaw',
      email: config.seedAdminEmail,
      senhaHash: gerarHash(config.seedAdminSenha),
      papel: 'ADMIN',
    }).id;
  }

  /* ---------- Conta pagadora ---------- */
  const conta: ContaPagadora = {
    bancoCodigo: '341',
    bancoNome: 'ITAU UNIBANCO S.A.',
    agencia: '04521',
    agenciaDigito: '2',
    conta: '000000318742',
    contaDigito: '6',
    convenio: '1234567',
    nomeEmpresa: 'MACAW RESTAURANTE LTDA',
    cnpj: CNPJ_MACAW,
  };
  repoConta.salvarContaPagadora(tenantId, conta);

  /* ---------- Colaboradores ---------- */
  // A participacao de cada um no rateio vem da propria planilha: quem recebeu
  // mais comissao em agosto tem mais pontos, o que mantem o criterio PONTOS
  // coerente com a realidade da casa nos proximos rateios.
  const totalComissoesReferencia = somar(...dados.referenciaFolha.map((r) => r.comissoes));
  const idsPorNome = new Map<string, string>();
  let criados = 0;

  dados.colaboradores.forEach((planilha, indice) => {
    const cpf = cpfSintetico(indice);
    const jaCadastrado = repoColaboradores.buscarPorCpf(tenantId, cpf);
    if (jaCadastrado) {
      idsPorNome.set(planilha.nome, jaCadastrado.id);
      return;
    }

    const referencia = dados.referenciaFolha[indice];
    const banco = BANCOS_SEED[indice % BANCOS_SEED.length] as (typeof BANCOS_SEED)[number];
    const pontos =
      totalComissoesReferencia > 0 ? arredondar(((referencia?.comissoes ?? 0) / totalComissoesReferencia) * 100, 4) : 0;

    const entrada: ColaboradorEntrada = {
      nome: planilha.nome,
      cpf,
      pis: pisSintetico(indice),
      dataNascimento: nascimentoSintetico(indice),
      funcao: planilha.funcao,
      setor: planilha.centroCusto,
      centroCusto: planilha.centroCusto,
      tipoContrato: planilha.tipoContrato,
      situacao: planilha.situacao,
      salarioBase: planilha.salarioBase,
      salarioHora: planilha.salarioHora,
      cargaHorariaMensal: cargaHoraria(planilha.tipoContrato),
      valeTransporte: planilha.valeTransporte,
      valeTransporteValorDiario: planilha.valeTransporte ? 9.6 : null,
      pontosComissao: pontos,
      // Dependentes ficticios espalhados para exercitar IRRF e salario-familia.
      dependentesIRRF: indice % 5 === 0 ? 1 : 0,
      dependentesSalarioFamilia: indice % 7 === 0 ? 1 : 0,
      insalubridadePercentual: null,
      periculosidade: false,
      admissao: admissaoSintetica(indice),
      demissao: null,
      observacoes: `Importado de ${dados.origem}`,
      bancoCodigo: banco.codigo,
      bancoNome: banco.nome,
      agencia: String(1000 + ((indice * 37) % 8999)).padStart(5, '0'),
      agenciaDigito: String(indice % 10),
      conta: String(100000 + indice * 1237).padStart(12, '0'),
      contaDigito: String((indice * 3) % 10),
      tipoConta: 'CORRENTE',
      // O CPF e sempre uma chave PIX valida — o caminho mais simples para o seed.
      tipoPix: 'CPF',
      chavePix: cpf,
    };

    idsPorNome.set(planilha.nome, repoColaboradores.criarColaborador(tenantId, entrada).id);
    criados += 1;
  });

  /* ---------- Faltas de agosto/2025 ---------- */
  const faltasExistentes = repoFaltas.listarFaltas(tenantId, { competencia: COMPETENCIA_SEED });
  const chavesFalta = new Set(faltasExistentes.map((f) => `${f.colaboradorId}|${f.data}`));
  let faltasCriadas = 0;

  dados.colaboradores.forEach((planilha) => {
    const colaboradorId = idsPorNome.get(planilha.nome);
    if (!colaboradorId || planilha.faltasAgosto <= 0) return;
    // A planilha trouxe as horas do intermitente na coluna de faltas (105 para
    // 105,5h trabalhadas). Para esse contrato o que vale e `horasTrabalhadas`.
    if (planilha.tipoContrato === 'INTERMITENTE') return;

    for (let i = 0; i < planilha.faltasAgosto; i += 1) {
      // Espaca as faltas em semanas diferentes para exercitar a perda de DSR.
      const dia = 4 + i * 3;
      const data: DataISO = `2025-08-${String(Math.min(dia, 29)).padStart(2, '0')}`;
      if (chavesFalta.has(`${colaboradorId}|${data}`)) continue;
      repoFaltas.criarFalta(tenantId, {
        colaboradorId,
        data,
        tipo: 'FALTA',
        horas: null,
        justificativa: null,
        documento: null,
        registradoPor: adminId,
      });
      chavesFalta.add(`${colaboradorId}|${data}`);
      faltasCriadas += 1;
    }
  });

  /* ---------- Periodos semanais de comissao ---------- */
  // Criterio MANUAL: os valores vieram prontos da planilha do cliente e a soma
  // das 4 semanas precisa bater exatamente com a coluna "comissoes" da
  // referencia — um rateio proporcional deixaria centavos de diferenca.
  let periodosCriados = 0;
  SEMANAS_AGOSTO.forEach((semana, indiceSemana) => {
    if (repoComissoes.buscarPeriodoPorSemana(tenantId, 2025, semana)) return;

    const lancamentos: comissaoServico.LancamentoManual[] = [];
    dados.referenciaFolha.forEach((referencia, indice) => {
      const colaboradorId = idsPorNome.get(referencia.nome);
      if (!colaboradorId || referencia.comissoes <= 0) return;

      const anteriores = somar(
        ...PESOS_SEMANA.slice(0, indiceSemana).map((peso) => arredondar(referencia.comissoes * peso)),
      );
      // A ultima semana absorve o residuo de arredondamento das anteriores.
      const valor =
        indiceSemana === PESOS_SEMANA.length - 1
          ? arredondar(referencia.comissoes - anteriores)
          : arredondar(referencia.comissoes * (PESOS_SEMANA[indiceSemana] as number));

      const colaborador = repoColaboradores.buscarColaborador(tenantId, colaboradorId);
      lancamentos.push({
        colaboradorId,
        pontos: colaborador?.pontosComissao ?? 0,
        horas: 44,
        ajuste: 0,
        valorManual: valor,
        observacao: `Semana ${semana}/2025 - indice ${indice}`,
      });
    });

    const totalSemana = somar(...lancamentos.map((l) => l.valorManual ?? 0));
    const intervalo = intervaloDaSemanaISO(2025, semana);

    const periodo = comissaoServico.criarPeriodo(
      tenantId,
      {
        ano: 2025,
        semana,
        valorArrecadado: totalSemana,
        percentualRetencao: 0,
        criterioRateio: 'MANUAL',
        dataPagamento: intervalo.fim,
        observacoes: `Rateio importado de ${dados.origem}`,
      },
      adminId,
    );
    comissaoServico.lancarManualmente(tenantId, periodo.id, lancamentos, adminId);
    comissaoServico.fecharPeriodo(tenantId, periodo.id, adminId);
    // Historico ja quitado na semana: entra como PAGO para que a folha mensal
    // abata o valor do liquido a transferir, como acontece na casa.
    comissaoServico.marcarComoPago(
      tenantId,
      comissaoServico.exigirPeriodo(tenantId, periodo.id),
      intervalo.fim,
    );
    periodosCriados += 1;
  });

  // Semana de setembro deixada FECHADA e rateada por PONTOS: e o cenario para
  // demonstrar o caminho comissao -> remessa bancaria sem mexer em agosto.
  const SEMANA_DEMO = 36;
  if (!repoComissoes.buscarPeriodoPorSemana(tenantId, 2025, SEMANA_DEMO)) {
    const intervalo = intervaloDaSemanaISO(2025, SEMANA_DEMO);
    const periodo = comissaoServico.criarPeriodo(
      tenantId,
      {
        ano: 2025,
        semana: SEMANA_DEMO,
        valorArrecadado: 7200,
        percentualRetencao: 10,
        criterioRateio: 'PONTOS',
        dataPagamento: intervalo.fim,
        observacoes: 'Semana em aberto para conferencia e pagamento',
      },
      adminId,
    );
    comissaoServico.ratearPeriodo(tenantId, periodo.id, adminId);
    comissaoServico.fecharPeriodo(tenantId, periodo.id, adminId);
    periodosCriados += 1;
  }

  /* ---------- Folha de agosto/2025 em rascunho ---------- */
  const rascunho = folhaServico.processarFolha(
    tenantId,
    { competencia: COMPETENCIA_SEED, tipo: 'MENSAL', dataPagamento: '2025-09-05' },
    adminId,
  );

  // O contrato INTERMITENTE remunera horas, nao dias: a planilha traz as horas
  // do mes e elas entram como ajuste do contracheque depois do processamento.
  // Como o ajuste fica gravado em `entradaManual`, reprocessar a folha no
  // proximo seed nao perde essa informacao.
  for (const planilha of dados.colaboradores) {
    if (planilha.tipoContrato !== 'INTERMITENTE' || !planilha.horasTrabalhadas) continue;
    const colaboradorId = idsPorNome.get(planilha.nome);
    if (!colaboradorId) continue;
    folhaServico.ajustarItem(
      tenantId,
      rascunho.id,
      colaboradorId,
      { horasTrabalhadas: planilha.horasTrabalhadas, observacoes: `${planilha.horasTrabalhadas}h trabalhadas em agosto` },
      false,
      adminId,
    );
  }

  const folha = repoFolhas.detalharFolha(tenantId, rascunho.id);
  if (!folha) throw new Error('Folha do seed nao pode ser recarregada.');

  const totalComissoes = somar(
    ...repoComissoes
      .listarPeriodos(tenantId, { competencia: COMPETENCIA_SEED })
      .map((p) => p.totalDistribuido),
  );

  return {
    tenantId,
    colaboradores: repoColaboradores.listarTodos(tenantId).length,
    faltas: repoFaltas.listarFaltas(tenantId, { competencia: COMPETENCIA_SEED }).length,
    periodosComissao: repoComissoes.listarPeriodos(tenantId, { ano: 2025 }).length,
    totalComissoes,
    folhaId: folha.id,
    totalFolha: folha.totalProventos,
    totalTransferir: folha.totalTransferir,
    criado: criados > 0 || periodosCriados > 0 || faltasCriadas > 0 || !existente,
  };
}

/** Executado por `npm run seed -w @rhmacaw/server`. */
function principal(): void {
  const inicio = Date.now();
  const resultado = executarSeed();

  console.log('--- Seed RH Macaw ---------------------------------------');
  console.log(`Tenant .............. ${resultado.tenantId} (Macaw Restaurante, CNPJ ${CNPJ_MACAW})`);
  console.log(`Usuario admin ....... ${config.seedAdminEmail}`);
  console.log(`Colaboradores ....... ${resultado.colaboradores}`);
  console.log(`Faltas (${COMPETENCIA_SEED}) ..... ${resultado.faltas}`);
  console.log(`Periodos comissao ... ${resultado.periodosComissao}`);
  console.log(`Total comissoes ..... ${resultado.totalComissoes.toFixed(2)} (competencia ${COMPETENCIA_SEED})`);
  console.log(`Folha ${COMPETENCIA_SEED} ........ ${resultado.folhaId}`);
  console.log(`  proventos ......... ${resultado.totalFolha.toFixed(2)}`);
  console.log(`  a transferir ...... ${resultado.totalTransferir.toFixed(2)}`);
  console.log(`Banco ............... ${config.arquivoBanco}`);
  console.log(`${resultado.criado ? 'Dados criados' : 'Nada a criar (seed idempotente)'} em ${Date.now() - inicio}ms.`);
  console.log('---------------------------------------------------------');

  fecharBanco();
}

// Roda sempre que o arquivo e invocado pela CLI (o import nos testes nao dispara).
if (process.argv[1] && path.basename(process.argv[1]).startsWith('seed')) {
  principal();
}
