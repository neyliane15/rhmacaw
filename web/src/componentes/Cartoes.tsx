import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface PropsIndicador {
  rotulo: string;
  valor: ReactNode;
  apoio?: ReactNode;
  /** Marca o cartao como parte do trilho de pagamento (dinheiro saindo). */
  trilho?: boolean;
  para?: string;
  icone?: ReactNode;
  tom?: 'neutro' | 'critico';
}

/** Ficha de indicador: rotulo pequeno em cima, número grande, apoio embaixo. */
export function Indicador({ rotulo, valor, apoio, trilho = false, para, icone, tom = 'neutro' }: PropsIndicador): JSX.Element {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="sobrancelha">{rotulo}</span>
        {icone ? <span className="text-base text-[var(--texto-3)]">{icone}</span> : null}
      </div>
      <p
        className={`mt-2 font-display text-2xl font-semibold leading-none tracking-tight ${
          tom === 'critico' ? 'text-critico' : trilho ? 'text-ouro-600 dark:text-ouro-200' : ''
        }`}
      >
        {valor}
      </p>
      {apoio ? <p className="mt-1.5 text-xs text-[var(--texto-3)]">{apoio}</p> : null}
    </>
  );

  const classe = `cartao block p-3.5 ${trilho ? 'trilho rounded-l-none' : ''} ${para ? 'transition-colors hover:bg-[var(--superficie-sutil)]' : ''}`;

  return para ? (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/** Cabecalho de pagina: titulo, apoio e acoes. */
export function CabecalhoPagina({
  titulo,
  sobrancelha,
  descricao,
  acoes,
}: {
  titulo: string;
  sobrancelha?: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}): JSX.Element {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {sobrancelha ? <p className="sobrancelha mb-1">{sobrancelha}</p> : null}
        <h1 className="font-display text-2xl font-semibold leading-tight">{titulo}</h1>
        {descricao ? <div className="mt-1 text-sm text-[var(--texto-3)]">{descricao}</div> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </header>
  );
}
