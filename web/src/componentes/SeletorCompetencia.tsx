import { rotuloCompetencia, type Competencia } from '@rhmacaw/shared';
import { competenciaAtual, deslocarCompetencia } from '../util/formato.js';
import { IconeSeta, IconeSetaEsq } from './Icones.js';

export interface PropsSeletorCompetencia {
  valor: Competencia;
  aoMudar: (competencia: Competencia) => void;
  rotulo?: string;
  compacto?: boolean;
}

/** Navegacao mês a mês com atalho para o mês corrente. */
export function SeletorCompetencia({ valor, aoMudar, rotulo = 'Competência', compacto = false }: PropsSeletorCompetencia): JSX.Element {
  const atual = competenciaAtual();
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-[var(--borda-forte)] bg-[var(--superficie-alta)]">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => aoMudar(deslocarCompetencia(valor, -1))}
        className="px-2 text-[var(--texto-2)] hover:bg-[var(--superficie-sutil)]"
      >
        <IconeSetaEsq />
      </button>
      <label className="relative flex min-w-0 cursor-pointer flex-col justify-center border-x border-[var(--borda)] px-2.5 py-1 focus-within:ring-2 focus-within:ring-arara-500">
        <span className={`sobrancelha leading-none ${compacto ? 'sr-only' : ''}`}>{rotulo}</span>
        {/* O mes visivel vem de `rotuloCompetencia`, sempre em portugues. O input
            nativo fica por cima, transparente, so para abrir o calendario:
            `type="month"` desenha o nome do mes no idioma do NAVEGADOR, e num
            navegador em ingles apareceria "August 2025". */}
        <span className="w-[8.5rem] font-mono text-sm font-semibold text-[var(--texto)]">{rotuloCompetencia(valor)}</span>
        <input
          type="month"
          value={valor}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) aoMudar(e.target.value);
          }}
          aria-label={`${rotulo}: ${rotuloCompetencia(valor)}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        aria-label="Próximo mês"
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
