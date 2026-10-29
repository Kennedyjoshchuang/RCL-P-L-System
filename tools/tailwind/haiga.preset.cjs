// HAIGA design system: shared Tailwind tokens for every HAIGA product.
// Canonical copy: haiga-hq/design/tailwind/haiga.preset.cjs. Each repo keeps a copy; edit there, then run design/tailwind/sync.sh.
// All tokens live under `hg` so they never clash with class names a site already uses (.text-muted, .font-display...).
// Colors read CSS vars, so a product re-brands by setting --hg-accent etc. in its own CSS; the fallback is the HAIGA look.
// shortcut: var() colors do not support opacity modifiers (bg-hg-accent/50); switch vars to RGB channels if that is needed.
const c = (name, fallback) => `var(--hg-${name}, ${fallback})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        hg: {
          bg: c('bg', '#06080c'),
          'bg-2': c('bg-2', '#0b0f16'),
          surface: c('surface', '#0f141d'),
          'surface-2': c('surface-2', '#151b26'),
          line: c('line', 'rgba(255,255,255,0.08)'),
          'line-strong': c('line-strong', 'rgba(255,255,255,0.16)'),
          text: c('text', '#eef2f7'),
          muted: c('muted', '#8a94a6'),
          accent: c('accent', '#2ee6c5'),
          'accent-2': c('accent-2', '#4d7cfe'),
          'accent-3': c('accent-3', '#a78bfa'),
          wa: c('wa', '#25d366'),
        },
      },
      fontFamily: {
        'hg-display': ['var(--hg-font-display, "Space Grotesk")', 'system-ui', 'sans-serif'],
        'hg-body': ['var(--hg-font-body, "Inter")', 'system-ui', 'sans-serif'],
      },
      borderRadius: { hg: 'var(--hg-radius, 20px)', 'hg-sm': 'var(--hg-radius-sm, 12px)' },
      maxWidth: { hg: 'var(--hg-max, 1240px)' },
      backgroundImage: { 'hg-grad': 'linear-gradient(120deg, var(--hg-accent, #2ee6c5) 0%, var(--hg-accent-2, #4d7cfe) 60%, var(--hg-accent-3, #a78bfa) 100%)' },
      transitionTimingFunction: { hg: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
};
