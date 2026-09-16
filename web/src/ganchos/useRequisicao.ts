import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemDeErro } from '../api/cliente.js';

export interface EstadoRequisicao<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
  definir: (dados: T) => void;
}

/**
 * Busca dados sempre que as dependencias mudam e entrega os tres estados que
 * toda tela precisa tratar: carregando, erro e vazio.
 */
export function useRequisicao<T>(buscar: () => Promise<T>, deps: unknown[], ativo = true): EstadoRequisicao<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    buscarRef
      .current()
      .then((resultado) => {
        if (vivo) setDados(resultado);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setDados(null);
        setErro(mensagemDeErro(e));
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, gatilho, ativo]);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);
  return { dados, carregando, erro, recarregar, definir: setDados };
}

/** Executa uma acao (POST/PUT/DELETE) controlando pendencia e erro. */
export function useAcao(): {
  executando: boolean;
  erro: string | null;
  limparErro: () => void;
  executar: <R>(acao: () => Promise<R>) => Promise<R | null>;
} {
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const executar = useCallback(async <R,>(acao: () => Promise<R>): Promise<R | null> => {
    setExecutando(true);
    setErro(null);
    try {
      return await acao();
    } catch (e) {
      setErro(mensagemDeErro(e));
      return null;
    } finally {
      setExecutando(false);
    }
  }, []);

  return { executando, erro, limparErro: useCallback(() => setErro(null), []), executar };
}

/** Debounce simples para campos de busca. */
export function useAtraso<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return atrasado;
}
