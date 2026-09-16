import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PERMISSOES, type Papel, type SessaoUsuario } from '@rhmacaw/shared';
import * as apiAuth from '../api/auth.js';
import { EVENTO_NAO_AUTORIZADO, chaveSessao, definirToken } from '../api/cliente.js';

interface ValorAuth {
  sessao: SessaoUsuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
  /** Checa uma permissao no formato `recurso:acao` contra o papel da sessao. */
  pode: (permissao: string) => boolean;
  papel: Papel | null;
}

const Contexto = createContext<ValorAuth | null>(null);

function lerSessaoSalva(): SessaoUsuario | null {
  try {
    const bruto = localStorage.getItem(chaveSessao);
    if (!bruto) return null;
    const sessao = JSON.parse(bruto) as SessaoUsuario;
    if (!sessao?.token) return null;
    // Token vencido no armazenamento local nao vale revalidar.
    if (sessao.expiraEm && Date.parse(sessao.expiraEm) < Date.now()) return null;
    return sessao;
  } catch {
    return null;
  }
}

export function ProvedorAuth({ children }: { children: ReactNode }): JSX.Element {
  const [sessao, setSessao] = useState<SessaoUsuario | null>(() => {
    const salva = lerSessaoSalva();
    if (salva) definirToken(salva.token);
    return salva;
  });
  const [carregando, setCarregando] = useState(true);

  const sair = useCallback(() => {
    definirToken(null);
    try {
      localStorage.removeItem(chaveSessao);
    } catch {
      /* armazenamento indisponivel (aba anonima) — a sessao em memoria basta */
    }
    setSessao(null);
  }, []);

  const guardar = useCallback((nova: SessaoUsuario) => {
    definirToken(nova.token);
    try {
      localStorage.setItem(chaveSessao, JSON.stringify(nova));
    } catch {
      /* ignora: a sessao segue valida so nesta aba */
    }
    setSessao(nova);
  }, []);

  // Revalida o token guardado contra a API uma vez, na carga.
  useEffect(() => {
    let vivo = true;
    const salva = lerSessaoSalva();
    if (!salva) {
      setCarregando(false);
      return;
    }
    definirToken(salva.token);
    apiAuth
      .sessaoAtual()
      .then((atual) => {
        if (!vivo) return;
        guardar({ ...atual, token: atual.token || salva.token });
      })
      .catch(() => {
        if (vivo) sair();
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [guardar, sair]);

  // Qualquer 401 vindo do cliente derruba a sessao, em qualquer tela.
  useEffect(() => {
    const aoNegar = (): void => sair();
    window.addEventListener(EVENTO_NAO_AUTORIZADO, aoNegar);
    return () => window.removeEventListener(EVENTO_NAO_AUTORIZADO, aoNegar);
  }, [sair]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const nova = await apiAuth.entrar(email, senha);
      guardar(nova);
    },
    [guardar],
  );

  const papel = sessao?.usuario.papel ?? null;

  const pode = useCallback(
    (permissao: string) => {
      if (!papel) return false;
      const concedidas = PERMISSOES[papel];
      const [recurso] = permissao.split(':');
      return concedidas.some((p) => p === '*' || p === permissao || p === `${recurso}:*`);
    },
    [papel],
  );

  const valor = useMemo<ValorAuth>(
    () => ({ sessao, carregando, entrar, sair, pode, papel }),
    [sessao, carregando, entrar, sair, pode, papel],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): ValorAuth {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.');
  return valor;
}
