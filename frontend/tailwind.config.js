/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#e6f4f5',
                    100: '#cce9eb',
                    200: '#99d3d7',
                    300: '#66bdc3',
                    400: '#33a7af',
                    500: '#20808D',
                    600: '#1a6671',
                    700: '#134d55',
                    800: '#0d3338',
                    900: '#061a1c',
                },
                critical: '#ef4444',
                warning: '#f97316',
                watch: '#eab308',
                success: '#22c55e',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
            }
        },
    },
    plugins: [],
}
