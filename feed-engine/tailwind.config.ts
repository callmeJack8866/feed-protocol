import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        // Deep Space Backgrounds
        space: {
          900: '#0A0F1E',
          950: '#020305',
        },
        // Cyberpunk Primary (Cyan)
        cyber: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
        // Rare / Anomaly (Purple)
        anomaly: {
          400: '#c084fc',
          500: '#a855f7',
        },
        // Reward / Master (Amber)
        reward: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        // Danger / Critical (Rose/Red)
        danger: {
          400: '#fb7185',
          500: '#f43f5e',
        }
      },
      animation: {
        'scan-move': 'scan-move 4s linear infinite',
        'pulse-cyan': 'pulse-cyan 3s ease-in-out infinite',
        'subtle-drift': 'drift 20s linear infinite',
      },
      keyframes: {
        'scan-move': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        'pulse-cyan': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        'drift': {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '100% 100%' },
        }
      }
    },
  },
  plugins: [],
} satisfies Config;
