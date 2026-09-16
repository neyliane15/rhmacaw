/**
 * Um Express minimo, suficiente para montar os mesmos routers que o servidor
 * real usa.
 *
 * A ideia: em vez de reescrever as 60 rotas para o navegador, reproduzimos a
 * pouca superficie do Express que elas consomem — `Router()`, a cadeia de
 * middlewares com `next`, e `req`/`res` com `params`, `query`, `body`,
 * `status()`, `json()` e `send()`. Assim os arquivos de `server/src/rotas`
 * entram na demonstracao sem uma linha de mudanca, e o que voce clica aqui e
 * exatamente o codigo que roda em producao.
 */

export interface Requisicao {
  method: string;
  originalUrl: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  [chave: string]: unknown;
}

export interface Resposta {
  statusCode: number;
  corpo: unknown;
  cabecalhos: Record<string, string>;
  finalizada: boolean;
  /** Equivalente a `finalizada`; e o nome que o Express usa. */
  headersSent: boolean;
  status(codigo: number): Resposta;
  json(valor: unknown): Resposta;
  send(valor: unknown): Resposta;
  setHeader(nome: string, valor: string): Resposta;
  type(valor: string): Resposta;
  end(): Resposta;
}

export type Proximo = (erro?: unknown) => void;
export type Manipulador = (req: Requisicao, res: Resposta, next: Proximo) => unknown;

/**
 * Uma camada do roteador. O Express nao separa rotas de middlewares: ele
 * mantem UMA lista na ordem de registro e percorre de cima para baixo. Essa
 * ordem e o que faz o `use` de 404 no fim so responder depois de todas as
 * rotas terem sido tentadas — replicar isso e essencial.
 */
type Camada =
  | { tipo: 'rota'; metodo: string; padrao: RegExp; nomes: string[]; manipuladores: Manipulador[] }
  | { tipo: 'filho'; prefixo: string; roteador: RoteadorDemo }
  | { tipo: 'middleware'; prefixo: string; manipulador: Manipulador };

export interface RoteadorDemo {
  get(caminho: string, ...h: Manipulador[]): void;
  post(caminho: string, ...h: Manipulador[]): void;
  put(caminho: string, ...h: Manipulador[]): void;
  delete(caminho: string, ...h: Manipulador[]): void;
  patch(caminho: string, ...h: Manipulador[]): void;
  use(caminho: string, ...itens: (Manipulador | RoteadorDemo)[]): void;
  use(...itens: (Manipulador | RoteadorDemo)[]): void;
  /** Tenta atender a requisicao; devolve `false` se nenhuma camada respondeu. */
  despachar(req: Requisicao, res: Resposta, prefixo: string): Promise<boolean>;
  __camadas: Camada[];
}

/** Converte `/folhas/:id/itens/:colaboradorId` numa expressao com grupos. */
function compilar(caminho: string): { padrao: RegExp; nomes: string[] } {
  const nomes: string[] = [];
  const corpo = caminho
    .replace(/\/$/, '')
    .split('/')
    .map((seg) => {
      if (!seg) return '';
      if (seg.startsWith(':')) {
        nomes.push(seg.slice(1));
        return '/([^/]+)';
      }
      return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { padrao: new RegExp(`^${corpo || '/'}/?$`), nomes };
}

function ehRoteador(valor: unknown): valor is RoteadorDemo {
  return Boolean(valor) && typeof valor === 'object' && '__camadas' in (valor as object);
}

export function Router(): RoteadorDemo {
  const camadas: Camada[] = [];

  const registrar = (metodo: string) => (caminho: string, ...manipuladores: Manipulador[]): void => {
    const { padrao, nomes } = compilar(caminho);
    camadas.push({ tipo: 'rota', metodo, padrao, nomes, manipuladores });
  };

  const roteador: RoteadorDemo = {
    get: registrar('GET'),
    post: registrar('POST'),
    put: registrar('PUT'),
    delete: registrar('DELETE'),
    patch: registrar('PATCH'),
    use(...args: unknown[]): void {
      const prefixo = typeof args[0] === 'string' ? (args[0] as string) : '';
      const resto = typeof args[0] === 'string' ? args.slice(1) : args;
      for (const item of resto) {
        if (ehRoteador(item)) camadas.push({ tipo: 'filho', prefixo, roteador: item });
        else if (typeof item === 'function') camadas.push({ tipo: 'middleware', prefixo, manipulador: item as Manipulador });
      }
    },
    async despachar(req, res, prefixo): Promise<boolean> {
      const restante = req.path.slice(prefixo.length) || '/';

      for (const camada of camadas) {
        if (res.finalizada) return true;

        if (camada.tipo === 'middleware') {
          if (camada.prefixo && !restante.startsWith(camada.prefixo)) continue;
          await executar(camada.manipulador, req, res);
          continue;
        }

        if (camada.tipo === 'filho') {
          if (camada.prefixo && !restante.startsWith(camada.prefixo)) continue;
          const atendido = await camada.roteador.despachar(req, res, prefixo + camada.prefixo);
          if (atendido) return true;
          continue;
        }

        if (camada.metodo !== req.method) continue;
        const casou = camada.padrao.exec(restante);
        if (!casou) continue;
        req.params = {};
        camada.nomes.forEach((nome, i) => {
          req.params[nome] = decodeURIComponent(casou[i + 1] ?? '');
        });
        for (const manipulador of camada.manipuladores) {
          if (res.finalizada) return true;
          await executar(manipulador, req, res);
        }
        return true;
      }
      return res.finalizada;
    },
    __camadas: camadas,
  };
  return roteador;
}

/** Roda um manipulador respeitando o `next(erro)` do Express. */
async function executar(manipulador: Manipulador, req: Requisicao, res: Resposta): Promise<void> {
  let erroDoNext: unknown;
  const next: Proximo = (erro) => {
    if (erro) erroDoNext = erro;
  };
  const retorno = manipulador(req, res, next);
  if (retorno && typeof (retorno as Promise<unknown>).then === 'function') await retorno;
  if (erroDoNext) throw erroDoNext;
}

export function criarResposta(): Resposta {
  const res: Resposta = {
    statusCode: 200,
    corpo: undefined,
    cabecalhos: {},
    finalizada: false,
    headersSent: false,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(valor) {
      this.corpo = valor;
      this.cabecalhos['content-type'] = 'application/json; charset=utf-8';
      this.finalizada = true;
      this.headersSent = true;
      return this;
    },
    send(valor) {
      this.corpo = valor;
      this.finalizada = true;
      this.headersSent = true;
      return this;
    },
    setHeader(nome, valor) {
      this.cabecalhos[nome.toLowerCase()] = valor;
      return this;
    },
    type(valor) {
      this.cabecalhos['content-type'] = valor;
      return this;
    },
    end() {
      this.finalizada = true;
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

/* Tipos que os arquivos de rota importam do express. */
/**
 * O servidor amplia `Express.Request` com `sessao` via `declare global`.
 * Declarar o mesmo namespace aqui faz essa ampliacao valer tambem no shim,
 * entao `req.sessao` continua tipado como no servidor real.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {}
  }
}

export type Request = Requisicao & Express.Request;
export type Response = Resposta;
export type NextFunction = Proximo;
export type RequestHandler = Manipulador;
export type Express = RoteadorDemo;
/** `Router` tambem e usado como tipo nos arquivos de rota do servidor. */
export type Router = RoteadorDemo;

export default { Router };
