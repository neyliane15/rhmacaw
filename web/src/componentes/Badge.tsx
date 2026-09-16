import type { ReactNode } from 'react';
import type { Tom } from '../util/rotulos.js';

const CLASSES: Record<Tom, string> = {
  neutro: 'bg-tinta-100 text-tinta-700 border-tinta-200 dark:bg-tinta-800 dark:text-tinta-200 dark:border-tinta-700',
  positivo: 'bg-bom/10 text-[#046904] border-bom/35 dark:text-[#4ed04e] dark:border-bom/50',
  atencao: 'bg-aviso/15 text-[#7a5300] border-aviso/45 dark:text-[#f0c66a] dark:border-aviso/50',
  critico: 'bg-critico/10 text-[#a52424] border-critico/40 dark:text-[#f08a8a] dark:border-critico/50',
  info: 'bg-arara-500/10 text-arara-800 border-arara-500/35 dark:text-arara-200 dark:border-arara-400/45',
  trilho: 'bg-ouro-100 text-ouro-700 border-ouro-300 dark:bg-ouro-700/25 dark:text-ouro-200 dark:border-ouro-500',
};

export interface PropsBadge {
  tom?: Tom;
  children: ReactNode;
  /** Ponto colorido antes do texto — o rotulo sempre acompanha a cor. */
  ponto?: boolean;
  titulo?: string;
}

export function Badge({ tom = 'neutro', children, ponto = true, titulo }: PropsBadge): JSX.Element {
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-2xs font-semibold uppercase tracking-[0.06em] ${CLASSES[tom]}`}
    >
      {ponto ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}
