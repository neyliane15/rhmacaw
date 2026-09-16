import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface Envoltorio {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  obrigatorio?: boolean;
  className?: string;
  children: (id: string, invalido: boolean) => ReactNode;
}

function Envolver({ rotulo, dica, erro, obrigatorio, className, children }: Envoltorio): JSX.Element {
  const id = useId();
  const invalido = Boolean(erro);
  return (
    <div className={className}>
      <label htmlFor={id} className="rotulo">
        {rotulo}
        {obrigatorio ? <span className="ml-0.5 text-critico">*</span> : null}
      </label>
      {children(id, invalido)}
      {erro ? (
        <p id={`${id}-erro`} className="mt-1 text-xs font-medium text-critico">
          {erro}
        </p>
      ) : dica ? (
        <p className="mt-1 text-xs text-[var(--texto-3)]">{dica}</p>
      ) : null}
    </div>
  );
}

type PropsTexto = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  className?: string;
  mono?: boolean;
};

export function CampoTexto({ rotulo, dica, erro, className, mono, required, ...resto }: PropsTexto): JSX.Element {
  return (
    <Envolver rotulo={rotulo} dica={dica} erro={erro} obrigatorio={required} className={className}>
      {(id, invalido) => (
        <input
          {...resto}
          id={id}
          required={required}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? `${id}-erro` : undefined}
          className={`campo ${mono ? 'font-mono' : ''} ${invalido ? 'campo-inválido' : ''}`}
        />
      )}
    </Envolver>
  );
}

type PropsSelect = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  className?: string;
  opcoes: { valor: string; rotulo: string }[];
  vazio?: string;
};

export function CampoSelect({ rotulo, dica, erro, className, opcoes, vazio, required, ...resto }: PropsSelect): JSX.Element {
  return (
    <Envolver rotulo={rotulo} dica={dica} erro={erro} obrigatorio={required} className={className}>
      {(id, invalido) => (
        <select
          {...resto}
          id={id}
          required={required}
          aria-invalid={invalido || undefined}
          className={`campo pr-7 ${invalido ? 'campo-inválido' : ''}`}
        >
          {vazio !== undefined ? <option value="">{vazio}</option> : null}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      )}
    </Envolver>
  );
}

type PropsArea = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  className?: string;
};

export function CampoArea({ rotulo, dica, erro, className, required, ...resto }: PropsArea): JSX.Element {
  return (
    <Envolver rotulo={rotulo} dica={dica} erro={erro} obrigatorio={required} className={className}>
      {(id, invalido) => <textarea {...resto} id={id} rows={resto.rows ?? 3} className={`campo resize-y ${invalido ? 'campo-inválido' : ''}`} />}
    </Envolver>
  );
}

export function CampoCheck({
  rotulo,
  descricao,
  marcado,
  aoMudar,
  desabilitado,
}: {
  rotulo: string;
  descricao?: string;
  marcado: boolean;
  aoMudar: (valor: boolean) => void;
  desabilitado?: boolean;
}): JSX.Element {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-[var(--borda)] bg-[var(--superficie-alta)] px-3 py-2.5">
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-arara-600"
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-medium">{rotulo}</span>
        {descricao ? <span className="block text-xs text-[var(--texto-3)]">{descricao}</span> : null}
      </label>
    </div>
  );
}

/** Bloco de formulario com titulo e grade responsiva. */
export function Secao({ titulo, descricao, children, colunas = 3 }: { titulo: string; descricao?: string; children: ReactNode; colunas?: 1 | 2 | 3 | 4 }): JSX.Element {
  const grade =
    colunas === 1
      ? 'grid-cols-1'
      : colunas === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : colunas === 4
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <section className="space-y-3">
      <div>
        <h3 className="sobrancelha">{titulo}</h3>
        {descricao ? <p className="mt-1 text-xs text-[var(--texto-3)]">{descricao}</p> : null}
      </div>
      <div className={`grid gap-3 ${grade}`}>{children}</div>
    </section>
  );
}
