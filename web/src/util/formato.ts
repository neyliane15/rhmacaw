/** Mascaras de digitacao, numeros e geracao de CSV usados nas telas. */
import { competenciaDe, hojeISO, somenteDigitos, type Competencia, type DataISO } from '@rhmacaw/shared';

export function mascararCPF(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascararCNPJ(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function mascararPIS(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 8) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`;
}

export function mascararTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 13);
  if (!d) return '';
  return `+${d}`;
}

export function formatarNumero(valor: number, casas = 2): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(valor);
}

export function formatarPercentual(valor: number, casas = 1): string {
  return `${formatarNumero(valor, casas)}%`;
}

/** Aceita "1.234,56", "1234.56" e "1234,56" — o operador digita como quiser. */
export function paraNumero(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return 0;
  const temVirgula = limpo.includes(',');
  const normalizado = temVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

export function competenciaAtual(): Competencia {
  return competenciaDe(hojeISO());
}

export function deslocarCompetencia(competencia: Competencia, meses: number): Competencia {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const data = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dataDeHoje(): DataISO {
  return hojeISO();
}

/** Primeiro nome + ultimo sobrenome — nomes de folha sao longos demais para a coluna. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? nome;
  if (partes.length < 2) return primeiro;
  const ultimo = partes[partes.length - 1] ?? '';
  return `${primeiro} ${ultimo}`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.charAt(0) ?? '?';
  const b = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? '') : '';
  return `${a}${b}`.toUpperCase();
}

/* ------------------------------- CSV ------------------------------- */

function campoCSV(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV com separador `;` e decimal com virgula — o que o Excel pt-BR espera. */
export function montarCSV(cabecalho: string[], linhas: unknown[][]): string {
  const corpo = linhas.map((linha) =>
    linha
      .map((celula) => (typeof celula === 'number' ? celula.toFixed(2).replace('.', ',') : campoCSV(celula)))
      .join(';'),
  );
  return [cabecalho.map(campoCSV).join(';'), ...corpo].join('\r\n');
}
