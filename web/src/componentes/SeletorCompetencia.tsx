import { rotuloCompetencia, type Competencia } from '@rhmacaw/shared';
import { competenciaAtual, deslocarCompetencia } from '../util/formato.js';
import { IconeSeta, IconeSetaEsq } from './Icones.js';

export interface PropsSeletorCompetencia {
  valor: Competencia;
  aoMudar: (competencia: Competencia) => void;
  rotulo?: string;
  compacto?: boolean;
}

/** Navegacao mes a mes com atalho para o mes corrente. */
export function SeletorCompetencia({ valor, aoMudar, rotulo = 'Competencia', compacto = false }: PropsSeletorCompetencia): JSX.Element {
  const atual = competenciaAtual();
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-[var(--borda-forte)] bg-[var(--superficie-alta)]">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={() => aoMudar(deslocarCompetencia(valor, -1))}
        className="px-2 text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]"
      >
        <IconeSetaEsq />
      </button>
      <label className="flex min-w-0 flex-col justify-center border-x border-[var(--borda)] px-2.5 py-1">
        <span className={`sobrancelha leading-none ${compacto ? 'sr-only' : ''}`}>{rotulo}</span>
        <input
          type="month"
          value={valor}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) aoMudar(e.target.value);
          }}
          aria-label={`${rotulo}: ${rotuloCompetencia(valor)}`}
          className="w-[8.5rem] bg-transparent font-mono text-sm font-semibold text-[var(--texto)] outline-none"
        />
      </label>
      <button
        type="button"
        aria-label="Proximo mes"
        onClick={() => aoMudar(deslocarCompetencia(valor, 1))}
        className="px-2 text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]"
      >
        <IconeSeta />
      </button>
      {valor !== atual ? (
        <button
          type="button"
          onClick={() => aoMudar(atual)}
          className="border-l border-[var(--borda)] px-2 text-2xs font-semibold uppercase tracking-wide text-arara-700 hover:bg-[var(--superficie-sutil)] dark:text-arara-300"
        >
          Hoje
        </button>
      ) : null}
    </div>
  );
}
