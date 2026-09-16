import type { ReactNode } from 'react';
import { IconeAtencao, IconeCheck, IconeCritico, IconeInfo } from './Icones.js';

export type NivelAlerta = 'info' | 'sucesso' | 'atencao' | 'critico';

const ESTILO: Record<NivelAlerta, { caixa: string; icone: JSX.Element }> = {
  info: {
    caixa: 'border-arara-500/35 bg-arara-500/8 text-arara-900 dark:text-arara-100',
    icone: <IconeInfo className="text-arara-600 dark:text-arara-300" />,
  },
  sucesso: {
    caixa: 'border-bom/40 bg-bom/8 text-[#0a5c0a] dark:text-[#7ede7e]',
    icone: <IconeCheck className="text-bom" />,
  },
  atencao: {
    caixa: 'border-aviso/50 bg-aviso/12 text-[#6b4900] dark:text-[#f2cd7c]',
    icone: <IconeAtencao className="text-[#b98505] dark:text-aviso" />,
  },
  critico: {
    caixa: 'border-critico/45 bg-critico/8 text-[#8f1f1f] dark:text-[#f3a1a1]',
    icone: <IconeCritico className="text-critico" />,
  },
};

export interface PropsAlerta {
  nivel?: NivelAlerta;
  titulo?: string;
  children?: ReactNode;
  acao?: ReactNode;
  aoFechar?: () => void;
}

/** Cor nunca carrega o significado sozinha: sempre icone + rotulo. */
export function Alerta({ nivel = 'info', titulo, children, acao, aoFechar }: PropsAlerta): JSX.Element {
  const estilo = ESTILO[nivel];
  return (
    <div role={nivel === 'critico' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-md border px-3 py-2.5 ${estilo.caixa}`}>
      <span className="mt-[2px] shrink-0 text-base">{estilo.icone}</span>
      <div className="min-w-0 flex-1 text-sm">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className={titulo ? 'mt-0.5 opacity-90' : ''}>{children}</div> : null}
      </div>
      {acao ? <div className="shrink-0 self-center">{acao}</div> : null}
      {aoFechar ? (
        <button type="button" onClick={aoFechar} aria-label="Fechar aviso" className="shrink-0 self-start opacity-60 hover:opacity-100">
          ×
        </button>
      ) : null}
    </div>
  );
}
