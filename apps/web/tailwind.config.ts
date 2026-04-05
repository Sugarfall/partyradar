import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#04040d',
          card: '#07071a',
          elevated: '#0d0d28',
        },
        border: '#1a1a40',
        accent: '#00e5ff',
        neon: {
          cyan: '#00e5ff',
          green: '#00ff88',
          blue: '#3d5afe',
        },
        party: {
          pink: '#ff006e',
          cyan: '#00e5ff',
          blue: '#3d5afe',
          gold: '#ffd600',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-cyan': '0 0 16px rgba(0,229,255,0.4), 0 0 40px rgba(0,229,255,0.15)',
        'neon-green': '0 0 16px rgba(0,255,136,0.4), 0 0 40px rgba(0,255,136,0.15)',
        'neon-blue': '0 0 16px rgba(61,90,254,0.4), 0 0 40px rgba(61,90,254,0.15)',
        'neon-sm': '0 0 8px rgba(0,229,255,0.3)',
        'card': '0 0 30px rgba(0,229,255,0.04), inset 0 1px 0 rgba(0,229,255,0.06)',
      },
      animation: {
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'fade-up': 'fade-up 0.3s ease forwards',
      },
      keyframes: {
        'neon-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'fade-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
