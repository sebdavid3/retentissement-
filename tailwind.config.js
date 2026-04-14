/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./main.js"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        bone: "#e8e0d0",
        blood: "#8b0000"
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"]
      }
    }
  },
  plugins: []
};