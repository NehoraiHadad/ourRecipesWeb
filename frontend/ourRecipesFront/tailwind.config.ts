import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f2fbf9',   
          100: '#e6f7f3',  
          200: '#d9f3ed',  
          300: '#adeadd',   
          400: '#7edece',  
          500: '#22c7a0',  
          600: '#1eb394', 
          700: '#199f85', 
          800: '#158b76', 
          900: '#107767',  
        },
        secondary: {
          50: '#f8f9fa',   
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#868e96',
          700: '#495057',
          800: '#343a40',
          900: '#212529',
        },
        accent: {
          50: '#f3f9fd',   
          100: '#e7f3fb',
          200: '#d0e7f7',
          300: '#b9dbf3',
          400: '#8bc5ec',
          500: '#5aaae3', 
          600: '#3d8ec7',
          700: '#2072ab',
          800: '#17568f',
          900: '#0e3a73',
        }
      },
      fontFamily: {
        sans: ['var(--font-heebo)'],
        current: ['var(--current-font)', 'var(--font-heebo)'],
        'handwriting-heebo': ['var(--font-heebo)', 'system-ui', 'sans-serif'],
        'handwriting-alemnew': ['var(--font-alemnew)', 'var(--font-heebo)'],
        'handwriting-amit': ['var(--font-amit)', 'var(--font-heebo)'],
        'handwriting-aviya': ['var(--font-aviya)', 'var(--font-heebo)'],
        'handwriting-omer': ['var(--font-omer)', 'var(--font-heebo)'],
        'handwriting-savyon': ['var(--font-savyon)', 'var(--font-heebo)'],
        'handwriting-shilo': ['var(--font-shilo)', 'var(--font-heebo)'],
        'handwriting-shir': ['var(--font-shir)', 'var(--font-heebo)'],
        'handwriting-uriyah': ['var(--font-uriyah)', 'var(--font-heebo)'],
      },
      boxShadow: {
        'warm': '0 2px 8px rgba(0, 0, 0, 0.02)',
        'warm-lg': '0 4px 12px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;