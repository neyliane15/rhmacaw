/** Esqueleto de carregamento — mantem a altura da tela estavel. */
export function Carregando({ linhas = 5, titulo = 'Carregando' }: { linhas?: number; titulo?: string }): JSX.Element {
  return (
    <div className="space-y-2 p-1" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{titulo}…</span>
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          className="h-8 animate-pulsoSuave rounded bg-[var(--superficie-sutil)] border border-[var(--borda)]"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

export function Girando({ rotulo = 'Carregando' }: { rotulo?: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--texto-3)]" role="status">
      <svg viewBox="0 0 24 24" width="15" height="15" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {rotulo}
    </span>
  );
}
