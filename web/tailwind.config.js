/**
 * Sistema de design do RH Macaw.
 *
 * Direcao: "ficha de folha" — uma ferramenta de escritorio densa, com espinha
 * tabular forte, vestida com a identidade da marca.
 *
 * `arara` e o verde-musgo da logomarca: a cor estrutural (navegacao, cabecalho
 * de tabela, foco). `areia` e o creme do fundo da logo, que sustenta as
 * superficies em vez do cinza-azulado generico. O ouro segue reservado ao
 * TRILHO DE PAGAMENTO: so aparece onde o dinheiro sai da empresa (valor a
 * transferir, remessa, banco), e foi puxado para o ocre para conversar com o
 * creme.
 *
 * `bom` deixou de ser um verde qualquer e virou esmeralda: com o musgo na
 * navegacao, um verde de status proximo demais da marca confundiria "aprovado"
 * com "elemento de interface". Cores de status nunca sao fundo de coluna, e o
 * ouro nunca vira pilula de status — papeis diferentes, formas diferentes.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-tema="escuro"]'],
  theme: {
    extend: {
      colors: {
        tinta: {
          50: '#F8F7F4',
          100: '#EFEDE7',
          200: '#DFDBD1',
          300: '#C0BAAC',
          400: '#948D7E',
          500: '#6B6558',
          600: '#4C473D',
          700: '#38342C',
          800: '#272420',
          900: '#1C1A17',
          950: '#131211',
        },
        arara: {
          50: '#F6F7EC',
          100: '#E8EBC8',
          200: '#D2D795',
          300: '#B7BE63',
          400: '#9AA23C',
          500: '#7E852B',
          600: '#6E7324', // verde-musgo da logomarca
          700: '#585C1F',
          800: '#45491A',
          900: '#2F3213',
        },
        // Creme do fundo da logomarca: sustenta as superficies do tema claro.
        areia: {
          50: '#FCFAF7',
          100: '#F6F1E9',
          200: '#EFE6DB', // creme da logomarca
          300: '#E1D4C3',
          400: '#CBB9A3',
          500: '#AE9878',
        },
        ouro: {
          50: '#FDF6E7',
          100: '#F8E7C2',
          200: '#EFCE8B',
          300: '#E3AC4A',
          400: '#C9871B',
          500: '#A96C13',
          600: '#85530E',
          700: '#633C09',
        },
        // Status: fixos, nunca tematizados, sempre acompanhados de icone/rotulo.
        bom: '#0E8A5F', // esmeralda: nao se confunde com o musgo da marca
        aviso: '#FAB219',
        grave: '#EC835A',
        critico: '#D03B3B',
        // Series de grafico validadas (modo claro / escuro).
        serie: {
          1: '#6E7324',
          2: '#EB6834',
          3: '#1C7FB8',
          4: '#EDA100',
          5: '#E87BA4',
          6: '#008300',
          7: '#4A3AA7',
          8: '#E34948',
        },
      },
      fontFamily: {
        display: ['"Familjen Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        xs: ['0.75rem', { lineHeight: '1.05rem' }],
        sm: ['0.8125rem', { lineHeight: '1.15rem' }],
        base: ['0.875rem', { lineHeight: '1.35rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.1875rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.5rem', { lineHeight: '1.8rem' }],
        '3xl': ['1.9375rem', { lineHeight: '2.2rem' }],
        '4xl': ['2.5rem', { lineHeight: '2.6rem' }],
      },
      borderRadius: {
        DEFAULT: '5px',
        md: '6px',
        lg: '9px',
        xl: '13px',
      },
      boxShadow: {
        carta: '0 1px 2px rgba(16,21,28,0.05), 0 0 0 1px rgba(16,21,28,0.06)',
        flutuante: '0 18px 40px -12px rgba(16,21,28,0.35), 0 0 0 1px rgba(16,21,28,0.08)',
      },
      spacing: {
        barra: '15rem',
        topo: '3.5rem',
      },
      keyframes: {
        entrada: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulsoSuave: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: {
        entrada: 'entrada 160ms ease-out both',
        pulsoSuave: 'pulsoSuave 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
