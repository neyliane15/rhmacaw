import type { ReactNode } from 'react';

export interface PropsEstadoVazio {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  icone?: ReactNode;
}

/** Tela vazia e convite para agir, nunca um beco sem saida. */
export function EstadoVazio({ titulo, descricao, acao, icone }: PropsEstadoVazio): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icone ? <div className="mb-1 text-2xl text-[var(--texto-3)]">{icone}</div> : null}
      <p className="font-display text-lg font-semibold">{titulo}</p>
      {descricao ? <p className="max-w-md text-sm text-[var(--texto-3)]">{descricao}</p> : null}
      {acao ? <div className="mt-3">{acao}</div> : null}
    </div>
  );
}
