import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alerta } from '../componentes/Alerta.js';
import { Girando } from '../componentes/Carregando.js';
import { useAuth } from '../contextos/AuthContext.js';
import { useTema } from '../contextos/TemaContext.js';
import { mensagemDeErro } from '../api/cliente.js';
import { IconeLua, IconeSol } from '../componentes/Icones.js';

const CREDENCIAIS_SEED = { email: 'admin@rhmacaw.com.br', senha: 'Macaw@2025' };

/** Etapas do fluxo que o produto resolve — o argumento da tela de entrada. */
const FLUXO = [
  { rotulo: 'Semana de comissao', nota: 'gorjeta rateada por pontos' },
  { rotulo: 'Folha do mes', nota: 'INSS, IRRF, faltas e DSR' },
  { rotulo: 'Valor a transferir', nota: 'liquido menos adiantamentos' },
  { rotulo: 'Remessa no banco', nota: 'CNAB 240 ou PIX em lote' },
];

export function Login(): JSX.Element {
  const { sessao, entrar } = useAuth();
  const { tema, alternar } = useTema();
  const navegar = useNavigate();
  const local = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sessao) {
    const destino = (local.state as { de?: string } | null)?.de ?? '/';
    return <Navigate to={destino} replace />;
  }

  async function enviar(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar((local.state as { de?: string } | null)?.de ?? '/', { replace: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_minmax(24rem,0.95fr)]">
      {/* Painel do argumento: o caminho do dinheiro, que e o que o produto faz. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-arara-900 p-10 text-arara-50 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(230,184,92,0.9) 0 1px, transparent 1px 88px), repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 44px)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-ouro-300 font-display text-xl font-bold text-arara-900">R</span>
            <div className="leading-tight">
              <p className="font-display text-xl font-semibold tracking-tight">RH Macaw</p>
              <p className="font-mono text-2xs uppercase tracking-[0.18em] text-ouro-200">Gestao de pessoas e folha</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Do rateio da gorjeta
            <br />
            <span className="text-ouro-300">ate o credito na conta.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-arara-100/85">
            O RH Macaw fecha a semana de comissao, processa a folha do restaurante e gera o arquivo que o banco aceita — sem
            planilha no meio do caminho.
          </p>

          <ol className="mt-8 space-y-px">
            {FLUXO.map((passo, i) => (
              <li key={passo.rotulo} className="flex items-baseline gap-3 border-l-2 border-ouro-400/70 bg-white/[0.04] py-2.5 pl-4">
                <span className="font-mono text-2xs tabular-nums text-ouro-300">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-sm font-semibold">{passo.rotulo}</span>
                <span className="text-xs text-arara-100/65">{passo.nota}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative font-mono text-2xs uppercase tracking-[0.15em] text-arara-200/60">
          CLT · Intermitente · PJ · Socio · Estagio — todos na mesma folha
        </p>
      </section>

      <section className="flex flex-col justify-center bg-[var(--plano)] px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-start justify-between gap-3">
            <div>
              <p className="sobrancelha">Acesso</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Entrar no RH Macaw</h2>
            </div>
            <button
              type="button"
              onClick={alternar}
              className="botao-secundario px-2 py-1.5 text-base"
              aria-label={tema === 'claro' ? 'Ativar tema escuro' : 'Ativar tema claro'}
            >
              {tema === 'claro' ? <IconeLua /> : <IconeSol />}
            </button>
          </div>

          <form onSubmit={enviar} className="space-y-4" noValidate>
            {erro ? <Alerta nivel="critico" titulo="Nao foi possivel entrar">{erro}</Alerta> : null}

            <div>
              <label htmlFor="email" className="rotulo">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@restaurante.com.br"
                className="campo"
              />
            </div>

            <div>
              <label htmlFor="senha" className="rotulo">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="campo"
              />
            </div>

            <button type="submit" disabled={enviando} className="botao-primario w-full py-2">
              {enviando ? <Girando rotulo="Entrando" /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 rounded-md border border-dashed border-ouro-300 bg-ouro-50 p-3 text-xs dark:border-ouro-500 dark:bg-ouro-700/15">
            <p className="sobrancelha text-ouro-600 dark:text-ouro-200">Ambiente de demonstracao</p>
            <p className="mt-1 text-[var(--texto-2)]">
              O seed cria um administrador com estas credenciais:
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-2xs">
              <dt className="text-[var(--texto-3)]">e-mail</dt>
              <dd className="truncate">{CREDENCIAIS_SEED.email}</dd>
              <dt className="text-[var(--texto-3)]">senha</dt>
              <dd>{CREDENCIAIS_SEED.senha}</dd>
            </dl>
            <button
              type="button"
              onClick={() => {
                setEmail(CREDENCIAIS_SEED.email);
                setSenha(CREDENCIAIS_SEED.senha);
              }}
              className="mt-2 text-xs font-semibold text-ouro-700 underline underline-offset-2 dark:text-ouro-200"
            >
              Preencher com as credenciais do seed
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
