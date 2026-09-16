import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatarBRL } from '@rhmacaw/shared';
import { formatarNumero } from '../util/formato.js';

/** Paleta categorica validada; os valores trocam sozinhos no tema escuro. */
export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)'] as const;

function compacto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${formatarNumero(valor / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${formatarNumero(valor / 1_000, 0)}k`;
  return formatarNumero(valor, 0);
}

interface LinhaTooltip {
  nome: string;
  valor: number;
  cor: string;
}

function CaixaTooltip({ titulo, linhas }: { titulo: string; linhas: LinhaTooltip[] }): JSX.Element {
  return (
    <div className="rounded-md border border-[var(--borda-forte)] bg-[var(--superficie-alta)] px-2.5 py-2 text-xs shadow-flutuante">
      <p className="mb-1 font-semibold text-[var(--texto)]">{titulo}</p>
      <ul className="space-y-0.5">
        {linhas.map((l) => (
          <li key={l.nome} className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: l.cor }} />
            <span className="text-[var(--texto-3)]">{l.nome}</span>
            <span className="num ml-auto font-semibold tabular-nums text-[var(--texto)]">{formatarBRL(l.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TooltipMoeda({ active, payload, label }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const linhas: LinhaTooltip[] = payload.map((p, i) => ({
    nome: String(p.name ?? ''),
    valor: typeof p.value === 'number' ? p.value : 0,
    cor: String(p.color ?? p.stroke ?? SERIES[i % SERIES.length] ?? SERIES[0]),
  }));
  return <CaixaTooltip titulo={String(label ?? '')} linhas={linhas} />;
}

/** Envelope comum: titulo, legenda e alternancia grafico/tabela. */
export function Figura({
  titulo,
  descricao,
  children,
  tabela,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  tabela?: ReactNode;
  acoes?: ReactNode;
}): JSX.Element {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <figure className="cartao flex min-w-0 flex-col p-4">
      <figcaption className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold leading-tight">{titulo}</h3>
          {descricao ? <p className="mt-0.5 text-xs text-[var(--texto-3)]">{descricao}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {acoes}
          {tabela ? (
            <button
              type="button"
              onClick={() => setVerTabela((v) => !v)}
              aria-pressed={verTabela}
              className="rounded border border-[var(--borda-forte)] px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]"
            >
              {verTabela ? 'Ver grafico' : 'Ver tabela'}
            </button>
          ) : null}
        </div>
      </figcaption>
      <div className="min-w-0 flex-1">{verTabela && tabela ? tabela : children}</div>
    </figure>
  );
}

export interface PontoBarra {
  rotulo: string;
  valor: number;
  detalhe?: string;
}

/**
 * Barras horizontais: a forma certa quando os rotulos sao nomes (centros de
 * custo) e a comparacao e de magnitude.
 */
export function GraficoBarras({ dados, altura = 220 }: { dados: PontoBarra[]; altura?: number }): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} strokeDasharray="0" />
        <XAxis type="number" tickFormatter={compacto} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis type="category" dataKey="rotulo" width={120} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'var(--superficie-sutil)' }} />
        <Bar dataKey="valor" name="Custo" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {dados.map((ponto, i) => (
            <Cell key={ponto.rotulo} fill={SERIES[i % SERIES.length]} stroke="var(--superficie)" strokeWidth={2} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface SerieLinha {
  chave: string;
  nome: string;
}

/** Evolucao mensal. Uma unica escala de valor — nunca dois eixos y. */
export function GraficoLinhas({
  dados,
  series,
  altura = 240,
}: {
  dados: Record<string, string | number>[];
  series: SerieLinha[];
  altura?: number;
}): JSX.Element {
  return (
    <div>
      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickFormatter={compacto} tickLine={false} axisLine={false} fontSize={11} width={46} />
          <Tooltip content={<TooltipMoeda />} cursor={{ stroke: 'var(--eixo)', strokeWidth: 1 }} />
          {series.map((serie, i) => (
            <Line
              key={serie.chave}
              type="monotone"
              dataKey={serie.chave}
              name={serie.nome}
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, stroke: 'var(--superficie)' }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--superficie)' }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length > 1 ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--texto-2)]">
          {series.map((serie, i) => (
            <li key={serie.chave} className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[2px]" style={{ background: SERIES[i % SERIES.length] }} />
              {serie.nome}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Barras verticais agrupadas para admissoes x demissoes (contagens, nao moeda). */
export function GraficoMovimento({
  dados,
  altura = 220,
}: {
  dados: { rotulo: string; admissoes: number; demissoes: number }[];
  altura?: number;
}): JSX.Element {
  return (
    <div>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={30} />
          <Tooltip
            cursor={{ fill: 'var(--superficie-sutil)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <div className="rounded-md border border-[var(--borda-forte)] bg-[var(--superficie-alta)] px-2.5 py-2 text-xs shadow-flutuante">
                  <p className="mb-1 font-semibold">{String(label ?? '')}</p>
                  {payload.map((p, i) => (
                    <p key={String(p.name)} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: SERIES[i % SERIES.length] }} />
                      <span className="text-[var(--texto-3)]">{String(p.name)}</span>
                      <span className="num ml-auto font-semibold">{String(p.value ?? 0)}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Bar dataKey="admissoes" name="Admissoes" fill={SERIES[0]} radius={[4, 4, 0, 0]} stroke="var(--superficie)" strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="demissoes" name="Demissoes" fill={SERIES[1]} radius={[4, 4, 0, 0]} stroke="var(--superficie)" strokeWidth={2} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--texto-2)]">
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ background: SERIES[0] }} /> Admissoes
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ background: SERIES[1] }} /> Demissoes
        </li>
      </ul>
    </div>
  );
}
