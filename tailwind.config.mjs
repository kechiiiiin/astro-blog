/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f2f8f3',
          100: '#e6f1e8',
          200: '#cde3d2',
          300: '#a7cbb0',
          400: '#7baf89',
          500: '#559469',
          600: '#437a54',
          700: '#366144',
          800: '#2c4d37',
          900: '#23402d',
          950: '#0d1911',
        }
      },
      // 本文（prose）の色はサイトのトークン（src/styles/site.css の :root・墨）に寄せる。
      // Tailwind 既定の灰色（gray-700 等）は出さない。ライトのみなので dark 版は持たない。
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--fg)',
            '--tw-prose-headings': 'var(--fg)',
            '--tw-prose-lead': 'var(--muted)',
            '--tw-prose-links': 'var(--fg)',
            '--tw-prose-bold': 'var(--fg)',
            '--tw-prose-counters': 'var(--muted)',
            '--tw-prose-bullets': 'var(--muted)',
            '--tw-prose-hr': 'var(--line)',
            '--tw-prose-quotes': 'var(--muted)',
            '--tw-prose-quote-borders': 'var(--line)',
            '--tw-prose-captions': 'var(--muted)',
            '--tw-prose-kbd': 'var(--fg)',
            '--tw-prose-code': 'var(--fg)',
            '--tw-prose-pre-code': 'var(--fg)',
            '--tw-prose-pre-bg': 'var(--soft)',
            '--tw-prose-th-borders': 'var(--line)',
            '--tw-prose-td-borders': 'var(--line)',
            maxWidth: '65ch',
            color: 'var(--fg)',
            lineHeight: '1.75',
            'h1, h2, h3, h4': {
              color: 'var(--fg)',
              fontWeight: '700',
            },
            code: {
              color: 'var(--fg)',
              backgroundColor: 'var(--line)',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
            },
            a: {
              color: 'var(--fg)',
              '&:hover': {
                color: 'var(--fg)',
              },
              overflowWrap: 'break-word',
              wordBreak: 'break-word',
            },
            li: {
              marginTop: '0',
              marginBottom: '0',
            },
            p: {
              marginTop: '0',
              marginBottom: '0',
            },
          },
        },
        lg: {
          css: {
            li: {
              marginTop: '0',
              marginBottom: '0',
            },
            p: {
              marginTop: '0',
              marginBottom: '0',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
