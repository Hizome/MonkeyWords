/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#323437',
                main: '#e2b714',
                caret: '#e2b714',
                sub: '#646669',
                text: '#d1d0c5',
                error: '#ca4754',
            },
            fontFamily: {
                mono: ['Roboto Mono', 'monospace'],
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
