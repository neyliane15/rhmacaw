/**
 * Substitutos de `node:path`, `node:fs`, `node:url` e `node:os` para a
 * demonstracao que roda inteiramente no navegador.
 *
 * O servidor real usa esses modulos em tres lugares: resolver o caminho do
 * banco, gravar o arquivo de remessa em disco e localizar a raiz do projeto.
 * No navegador nao ha disco — o banco vive em memoria (persistido em
 * localStorage) e a remessa e devolvida pela API, nunca lida de volta do
 * sistema de arquivos. Por isso um `fs` em memoria basta.
 */

/* ------------------------------ path ------------------------------ */

function normalizar(caminho: string): string {
  const absoluto = caminho.startsWith('/');
  const partes: string[] = [];
  for (const parte of caminho.split('/')) {
    if (!parte || parte === '.') continue;
    if (parte === '..') partes.pop();
    else partes.push(parte);
  }
  return (absoluto ? '/' : '') + partes.join('/');
}

export const path = {
  sep: '/',
  isAbsolute: (p: string): boolean => p.startsWith('/'),
  dirname: (p: string): string => {
    const i = p.lastIndexOf('/');
    return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i);
  },
  basename: (p: string): string => p.slice(p.lastIndexOf('/') + 1),
  extname: (p: string): string => {
    const base = p.slice(p.lastIndexOf('/') + 1);
    const i = base.lastIndexOf('.');
    return i <= 0 ? '' : base.slice(i);
  },
  join: (...partes: string[]): string => normalizar(partes.filter(Boolean).join('/')) || '.',
  resolve: (...partes: string[]): string => {
    let resultado = '';
    for (const parte of partes) {
      if (!parte) continue;
      resultado = parte.startsWith('/') ? parte : resultado ? `${resultado}/${parte}` : parte;
    }
    return normalizar(resultado.startsWith('/') ? resultado : `/${resultado}`);
  },
};

export default path;

/* ------------------------------- fs ------------------------------- */

const arquivos = new Map<string, string>();

/**
 * Resolve pelo caminho completo e, se falhar, pelo nome do arquivo.
 *
 * O servidor procura `seed-dados.json` em caminhos derivados de
 * `import.meta.url`, que no navegador viram URLs sem sentido. Casar pelo nome
 * evita ter que adivinhar esses caminhos.
 */
function procurar(p: string): string | undefined {
  const direto = arquivos.get(p);
  if (direto !== undefined) return direto;
  const nome = p.slice(p.lastIndexOf('/') + 1);
  return arquivos.get(nome);
}

export const fs = {
  existsSync: (p: string): boolean => procurar(p) !== undefined,
  mkdirSync: (): void => undefined,
  writeFileSync: (p: string, conteudo: string): void => {
    arquivos.set(p, conteudo);
    arquivos.set(p.slice(p.lastIndexOf('/') + 1), conteudo);
  },
  readFileSync: (p: string): string => {
    const c = procurar(p);
    if (c === undefined) throw new Error(`Arquivo inexistente na demonstracao: ${p}`);
    return c;
  },
  rmSync: (p: string): void => {
    arquivos.delete(p);
  },
  mkdtempSync: (prefixo: string): string => `${prefixo}${Math.random().toString(36).slice(2, 8)}`,
};

/* ------------------------------ url / os ------------------------- */

export const fileURLToPath = (u: string | URL): string => String(u).replace(/^file:\/\//, '');
export const os = { tmpdir: (): string => '/tmp' };
