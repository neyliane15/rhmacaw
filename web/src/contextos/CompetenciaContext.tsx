import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Competencia } from '@rhmacaw/shared';
import { competenciaAtual } from '../util/formato.js';

interface ValorCompetencia {
  competencia: Competencia;
  definir: (nova: Competencia) => void;
}

const Contexto = createContext<ValorCompetencia | null>(null);
const CHAVE = 'rhmacaw.competencia';

/** A competência escolhida na topbar vale para dashboard, folha, faltas e relatórios. */
export function ProvedorCompetencia({ children }: { children: ReactNode }): JSX.Element {
  const [competencia, setCompetencia] = useState<Competencia>(() => {
    try {
      const salva = localStorage.getItem(CHAVE);
      if (salva && /^\d{4}-\d{2}$/.test(salva)) return salva;
    } catch {
      /* ignora */
    }
    return competenciaAtual();
  });

  const valor = useMemo<ValorCompetencia>(
    () => ({
      competencia,
      definir: (nova) => {
        setCompetencia(nova);
        try {
          localStorage.setItem(CHAVE, nova);
        } catch {
          /* ignora */
        }
      },
    }),
    [competencia],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCompetencia(): ValorCompetencia {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useCompetencia precisa estar dentro de <ProvedorCompetencia>.');
  return valor;
}
