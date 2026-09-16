import type { ReactNode } from 'react';

export interface Aba {
  chave: string;
  rotulo: string;
  distintivo?: ReactNode;
}

export function Abas({ abas, ativa, aoMudar }: { abas: Aba[]; ativa: string; aoMudar: (chave: string) => void }): JSX.Element {
  return (
    <div role="tablist" className="tabela-rolagem rolagem-fina -mb-px flex gap-0.5 border-b border-[var(--borda)]">
      {abas.map((aba) => {
        const selecionada = aba.chave === ativa;
        return (
          <button
            key={aba.chave}
            role="tab"
            type="button"
            aria-selected={selecionada}
            onClick={() => aoMudar(aba.chave)}
            className={`relative whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              selecionada
                ? 'border-arara-600 text-[var(--texto)] dark:border-arara-400'
                : 'border-transparent text-[var(--texto-3)] hover:border-[var(--borda-forte)] hover:text-[var(--texto-2)]'
            }`}
          >
            {aba.rotulo}
            {aba.distintivo ? <span className="ml-1.5">{aba.distintivo}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
