/**
 * Utilitarios de data. Todas as datas do dominio trafegam como `YYYY-MM-DD`
 * (string) para evitar deslocamento de fuso horario entre API, banco e front.
 */

export type DataISO = string; // YYYY-MM-DD
export type Competencia = string; // YYYY-MM

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_COMPETENCIA = /^\d{4}-\d{2}$/;

export function ehDataISO(valor: unknown): valor is DataISO {
  return typeof valor === 'string' && RE_DATA.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

export function ehCompetencia(valor: unknown): valor is Competencia {
  if (typeof valor !== 'string' || !RE_COMPETENCIA.test(valor)) return false;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

/** Converte `YYYY-MM-DD` num Date em UTC (meia-noite), sem surpresa de fuso. */
export function paraData(iso: DataISO): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function paraISO(data: Date): DataISO {
  return data.toISOString().slice(0, 10);
}

export function hojeISO(): DataISO {
  return paraISO(new Date());
}

export function somarDias(iso: DataISO, dias: number): DataISO {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}

export function somarMeses(iso: DataISO, meses: number): DataISO {
  const d = paraData(iso);
  const diaOriginal = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(diaOriginal, ultimoDia));
  return paraISO(d);
}

/** Diferenca em dias corridos (fim - inicio). */
export function diasEntre(inicio: DataISO, fim: DataISO): number {
  return Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 86_400_000);
}

export function competenciaDe(iso: DataISO): Competencia {
  return iso.slice(0, 7);
}

export function primeiroDiaDaCompetencia(competencia: Competencia): DataISO {
  return `${competencia}-01`;
}

export function ultimoDiaDaCompetencia(competencia: Competencia): DataISO {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return paraISO(new Date(Date.UTC(ano, mes, 0)));
}

export function diasNoMes(competencia: Competencia): number {
  return Number(ultimoDiaDaCompetencia(competencia).slice(8, 10));
}

/** 0 = domingo ... 6 = sabado. */
export function diaDaSemana(iso: DataISO): number {
  return paraData(iso).getUTCDay();
}

/** Segunda-feira da semana ISO que contem a data. */
export function inicioDaSemana(iso: DataISO): DataISO {
  const dia = diaDaSemana(iso);
  const recuo = dia === 0 ? 6 : dia - 1;
  return somarDias(iso, -recuo);
}

export function fimDaSemana(iso: DataISO): DataISO {
  return somarDias(inicioDaSemana(iso), 6);
}

/** Numero da semana ISO-8601 e o ano ao qual ela pertence. */
export function semanaISO(iso: DataISO): { ano: number; semana: number } {
  const d = paraData(iso);
  const dia = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dia); // quinta-feira da semana define o ano ISO
  const ano = d.getUTCFullYear();
  const primeiroJaneiro = new Date(Date.UTC(ano, 0, 1));
  const semana = Math.ceil(((d.getTime() - primeiroJaneiro.getTime()) / 86_400_000 + 1) / 7);
  return { ano, semana };
}

/** Datas de inicio/fim da semana ISO informada. */
export function intervaloDaSemanaISO(ano: number, semana: number): { inicio: DataISO; fim: DataISO } {
  const quatroDeJaneiro = `${ano}-01-04`;
  const segundaDaSemana1 = inicioDaSemana(quatroDeJaneiro);
  const inicio = somarDias(segundaDaSemana1, (semana - 1) * 7);
  return { inicio, fim: somarDias(inicio, 6) };
}

export function formatarDataBR(iso: DataISO): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function rotuloCompetencia(competencia: Competencia): string {
  const mes = MESES[Number(competencia.slice(5, 7)) - 1] ?? competencia;
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${competencia.slice(0, 4)}`;
}
