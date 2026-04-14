# Retentissement | A Lover's Discourse

Una experiencia web performática construida alrededor de **"Fragmentos de un discurso amoroso"** de Roland Barthes. La interfaz actúa como una caja de resonancia digital, explorando el dolor subjetivo, el recuerdo y el desmoronamiento de la memoria a través del scroll interactivo, análisis espectral de audio (Web Audio API) y estética brutalista.

## Características

- 🎧 **Experiencia de audio inmersiva**: Cuatro actos narrativos, impulsados por la API de Web Audio.
- 📉 **Espectrograma en tiempo real**: Renderizado dinámico de la frecuencia del Acto I directamente en `<canvas>`.
- 🕹️ **Coreografía de Scroll**: Animaciones vinculadas al nivel de desplazamiento del usuario e interpolación de volumen de audio de transición cruzada (ScrollTrigger de GSAP).
- 📜 **Estética Brutalista**: Colores puros, tipografía serif robusta y sin distracciones visuales ni botones ("Silencio visual").
- ⚡ **Desarrollado con Vite & Vanilla JS**: Sin frameworks que intervengan entre el audio puro y el usuario.

## Tecnologías Utilizadas

- HTML5 (Canvas, Audio)
- Vanilla CSS (Variables, Grid/Flexbox)
- Vanilla JS (DOM & Web Audio API)
- [GSAP](https://gsap.com/) & ScrollTrigger
- [Vite](https://vitejs.dev/)

## Ejecutar en local

1. Clona el repositorio e instala las dependencias:
   ```bash
   npm install
   ```
2. Inicializa el servidor de desarrollo:
   ```bash
   npm run dev
   ```
3. Visita `http://localhost:5173`.

## Autor

Desarrollado por **Sebastian Ibañez**.
