import { useEffect, useState, useId } from 'react';
import { formatarNumero, paraNumero } from '../util/formato.js';

export interface PropsMoeda {
  rotulo?: string;
  valor: number;
  aoMudar: (valor: number) => void;
  dica?: string;
  erro?: string | null;
  desabilitado?: boolean;
  className?: string;
  /** Deixa o campo compacto para uso dentro de grades editaveis. */
  emGrade?: boolean;
  prefixo?: string;
  alinharDireita?: boolean;
}

/**
 * Entrada monetaria em Reais. Mantem o texto livre enquanto o operador digita e
 * so normaliza para o formato brasileiro quando o campo perde o foco.
 */
export function MoedaInput({
  rotulo,
  valor,
  aoMudar,
  dica,
  erro,
  desabilitado,
  className,
  emGrade = false,
  prefixo = 'R$',
  alinharDireita = true,
}: PropsMoeda): JSX.Element {
  const id = useId();
  const [texto, setTexto] = useState(() => formatarNumero(valor));
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) setTexto(formatarNumero(valor));
  }, [valor, focado]);

  const entrada = (
    <div className="relative">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-2xs ${
          desabilitado ? 'text-[var(--texto-3)] opacity-50' : 'text-[var(--texto-3)]'
        }`}
      >
        {prefixo}
      </span>
      <input
        id={id}
        inputMode="decimal"
        disabled={desabilitado}
        value={texto}
        onFocus={(e) => {
          setFocado(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          aoMudar(paraNumero(e.target.value));
        }}
        onBlur={() => {
          setFocado(false);
          setTexto(formatarNumero(paraNumero(texto)));
        }}
        aria-invalid={erro ? true : undefined}
        className={`campo num pl-8 ${alinharDireita ? 'text-right' : ''} ${emGrade ? 'px-2 py-1 text-sm' : ''} ${
          erro ? 'campo-inválido' : ''
        }`}
      />
    </div>
  );

  if (!rotulo) return <div className={className}>{entrada}</div>;

  return (
    <div className={className}>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {entrada}
      {erro ? <p className="mt-1 text-xs font-medium text-critico">{erro}</p> : dica ? <p className="mt-1 text-xs text-[var(--texto-3)]">{dica}</p> : null}
    </div>
  );
}
