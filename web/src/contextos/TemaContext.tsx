import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tema = 'claro' | 'escuro';
const CHAVE = 'rhmacaw.tema';

interface ValorTema {
  tema: Tema;
  alternar: () => void;
}

const Contexto = createContext<ValorTema | null>(null);

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch {
    /* ignora */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function ProvedorTema({ children }: { children: ReactNode }): JSX.Element {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute('data-tema', tema);
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* ignora */
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === 'claro' ? 'escuro' : 'claro')), []);
  const valor = useMemo(() => ({ tema, alternar }), [tema, alternar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): ValorTema {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useTema precisa estar dentro de <ProvedorTema>.');
  return valor;
}
