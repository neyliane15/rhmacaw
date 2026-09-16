import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contextos/AuthContext.js';
import { Alerta } from './Alerta.js';
import { Girando } from './Carregando.js';

/** Bloqueia rotas sem sessao e, opcionalmente, sem a permissao exigida. */
export function Guarda({ permissao, children }: { permissao?: string; children: ReactNode }): JSX.Element {
  const { sessao, carregando, pode } = useAuth();
  const local = useLocation();

  if (carregando && !sessao) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Girando rotulo="Verificando sua sessao" />
      </div>
    );
  }

  if (!sessao) return <Navigate to="/login" replace state={{ de: local.pathname }} />;

  if (permissao && !pode(permissao)) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alerta nivel="atencao" titulo="Acesso restrito">
          Seu perfil nao tem permissao para abrir esta tela. Fale com um administrador se precisar deste acesso.
        </Alerta>
      </div>
    );
  }

  return <>{children}</>;
}
