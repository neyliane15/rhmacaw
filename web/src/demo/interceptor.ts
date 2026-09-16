/**
 * Redireciona as chamadas `/api/...` do front para o servidor que roda no
 * proprio navegador. O `cliente.ts` continua chamando `fetch` normalmente e
 * nao sabe que nao ha rede.
 */
import { atender } from './servidor.js';

export function instalarInterceptor(): void {
  const original = window.fetch.bind(window);

  window.fetch = async (entrada: RequestInfo | URL, opcoes?: RequestInit): Promise<Response> => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (!url.includes('/api/')) return original(entrada, opcoes);

    const metodo = opcoes?.method ?? (typeof entrada === 'object' && 'method' in entrada ? entrada.method : 'GET');
    const cabecalhos: Record<string, string> = {};
    new Headers(opcoes?.headers ?? {}).forEach((valor, chave) => {
      cabecalhos[chave.toLowerCase()] = valor;
    });

    let corpo: unknown;
    if (typeof opcoes?.body === 'string' && opcoes.body) {
      try {
        corpo = JSON.parse(opcoes.body);
      } catch {
        corpo = opcoes.body;
      }
    }

    const resposta = await atender(metodo, url, corpo, cabecalhos);
    const ehTexto = typeof resposta.corpo === 'string';
    return new Response(ehTexto ? (resposta.corpo as string) : JSON.stringify(resposta.corpo ?? null), {
      status: resposta.status,
      headers: {
        'content-type': ehTexto ? (resposta.cabecalhos['content-type'] ?? 'text/plain; charset=utf-8') : 'application/json; charset=utf-8',
        ...resposta.cabecalhos,
      },
    });
  };
}
