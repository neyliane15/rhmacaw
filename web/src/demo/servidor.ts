/**
 * O servidor do RH Macaw rodando dentro do navegador.
 *
 * Nao e uma simulacao: sao os mesmos routers, servicos, repositorios,
 * migracoes e seed que rodam em producao, montados sobre um SQLite de verdade
 * (compilado para WebAssembly) e um Express minimo. O que voce clica aqui
 * executa o mesmo SQL e o mesmo motor de calculo.
 *
 * A unica diferenca de comportamento: o banco vive em memoria e e persistido
 * em `localStorage`, entao os dados sobrevivem ao recarregamento da pagina mas
 * ficam so neste navegador.
 */
import initSqlJs from 'sql.js';
import { criarRoteador, tratadorDeErros } from '../../../server/src/rotas/index.js';
import { envolver, type BancoCompativel } from './shims/sqlite.js';
import { criarResposta, type Requisicao, type RoteadorDemo } from './shims/express.js';

const CHAVE_BANCO = 'rhmacaw.demo.banco';
/** Sobe a versao para descartar um banco salvo de um build anterior. */
const VERSAO = 'v1';

let roteador: RoteadorDemo | null = null;
let banco: BancoCompativel | null = null;

/** Recupera os bytes do banco salvos no navegador, se houver. */
function carregarSalvo(): Uint8Array | undefined {
  try {
    const bruto = localStorage.getItem(`${CHAVE_BANCO}.${VERSAO}`);
    if (!bruto) return undefined;
    const binario = atob(bruto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

/** Grava o banco no navegador. Silencioso em falha: sem espaco, a demo segue em memoria. */
function salvar(): void {
  if (!banco) return;
  try {
    const bytes = banco.serializar();
    let binario = '';
    const bloco = 8192;
    for (let i = 0; i < bytes.length; i += bloco) {
      binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
    }
    localStorage.setItem(`${CHAVE_BANCO}.${VERSAO}`, btoa(binario));
  } catch {
    /* quota estourada: a demonstracao continua funcionando em memoria */
  }
}

export function reiniciarDados(): void {
  try {
    localStorage.removeItem(`${CHAVE_BANCO}.${VERSAO}`);
  } catch {
    /* ignora */
  }
  location.reload();
}

/**
 * Sobe o banco, aplica migracoes, semeia os dados da planilha e monta as rotas.
 * Chamado uma unica vez, antes do React montar.
 */
export async function iniciarDemo(): Promise<void> {
  const SQL = await initSqlJs({
    // O WebAssembly viaja junto com a pagina: sem CDN, sem rede, sem surpresa
    // se o ambiente de quem abre bloquear dominio externo.
    locateFile: (arquivo: string) => new URL(arquivo, document.baseURI).href,
  });

  const salvo = carregarSalvo();
  const db = salvo ? new SQL.Database(salvo) : new SQL.Database();
  banco = envolver(db as never);

  // `conexao.ts` pede o banco por uma funcao; injetamos o nosso antes de
  // qualquer repositorio ser tocado.
  const conexao = await import('../../../server/src/db/conexao.js');
  (conexao as unknown as { __definirBanco?: (b: unknown) => void }).__definirBanco?.(banco);

  const { aplicarMigracoes } = await import('../../../server/src/db/migracoes.js');
  aplicarMigracoes(banco as never);

  if (!salvo) {
    // O seed le a planilha convertida de um arquivo; no navegador ele e
    // empacotado no bundle e colocado no `fs` em memoria antes da chamada.
    const { fs } = await import('./shims/node.js');
    const dados = (await import('../../../server/src/db/seed-dados.json')).default;
    fs.writeFileSync('seed-dados.json', JSON.stringify(dados));

    const { executarSeed } = await import('../../../server/src/db/seed.js');
    executarSeed();
  }

  roteador = criarRoteador() as unknown as RoteadorDemo;
  salvar();
}

export interface RespostaDemo {
  status: number;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

/** Atende uma requisicao `/api/...` como o Express faria. */
export async function atender(metodo: string, url: string, corpo: unknown, cabecalhos: Record<string, string>): Promise<RespostaDemo> {
  if (!roteador) throw new Error('A demonstracao ainda nao terminou de carregar.');

  const endereco = new URL(url, location.origin);
  const consulta: Record<string, string> = {};
  endereco.searchParams.forEach((valor, chave) => {
    consulta[chave] = valor;
  });

  const req: Requisicao = {
    method: metodo.toUpperCase(),
    originalUrl: endereco.pathname + endereco.search,
    path: endereco.pathname.replace(/^\/api/, '') || '/',
    params: {},
    query: consulta,
    body: corpo,
    headers: cabecalhos,
  };
  const res = criarResposta();

  try {
    const atendido = await roteador.despachar(req, res, '');
    if (!atendido && !res.finalizada) {
      res.status(404).json({ erro: 'nao_encontrado', mensagem: `Rota ${req.method} ${req.originalUrl} nao existe.` });
    }
  } catch (erro) {
    tratadorDeErros(erro, req as never, res as never, () => undefined);
  }

  // Toda escrita bem-sucedida persiste o banco.
  if (req.method !== 'GET' && res.statusCode < 400) salvar();

  return { status: res.statusCode, corpo: res.corpo, cabecalhos: res.cabecalhos };
}
