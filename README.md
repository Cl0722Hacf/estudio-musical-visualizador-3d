# Estudio Musical y Visualizador 3D

Estudio de música en el navegador con secuenciador de pasos, rack de efectos en tiempo real y visualizador 3D reactivo al audio. Hecho con React, TypeScript, Vite, Three.js y la Web Audio API.

## Qué incluye

- **Secuenciador de 16 o 32 pasos** con batería, bajo monofónico y lead (Sawtooth, Square, FM Pluck y Sub Bass), Mute/Solo/volumen por canal, swing, generador de beats y velocidad por paso (clic derecho o rueda).
- **4 bancos de patrones (A, B, C, D)** con copiar/pegar y **modo canción** para encadenar bloques (por ejemplo A → B → C → C → D).
- **Glide / portamento** en bajo y lead, para deslizar notas como un 808.
- **Rack de efectos maestros**: filtro (lowpass/highpass), delay estéreo sincronizado al BPM, reverb, saturación y limitador con "Boost comercial".
- **Mini teclado** tocable con el teclado de la computadora y barra espaciadora para Play/Pause.
- **Visualizador 3D** con 4 escenas (Núcleo Orbital, Túnel Cibernético, Singularidad Cósmica, Terreno Espectral), 4 paletas de color, controles de cámara con el mouse y modo pantalla completa (VJ).
- **Fuente de audio externa**: sube un archivo (.mp3, .wav, .ogg) o usa el micrófono para crear videoclips 3D de tus propias canciones.
- **Formatos para redes sociales** (16:9, 9:16 y 1:1), con nombre del artista, título, barras de espectro, sacudida de cámara y destello con el bajo.
- **Samples propios** (.wav) para cada canal de batería, guardados en el navegador (IndexedDB).
- **Exportación**: audio .WAV (bucle o canción completa), MIDI (.mid), video .WEBM en alta calidad y proyecto en .json o enlace compartible.
- **Medidores**: osciloscopio en vivo y medidor de picos (VU) en dB.
- **Biblioteca de ritmos** con 5 presets de fábrica y servidor local de Node que guarda y carga tus ritmos. El proyecto también se respalda solo en `localStorage`.

## Cómo ejecutarlo

Necesitas Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre la dirección que muestra la terminal (normalmente http://localhost:5173). El servidor de ritmos va integrado en Vite, no hay que arrancar nada más.

## Notas

- Los navegadores exigen un clic de la persona usuaria antes de reproducir audio.
- Los samples personalizados se guardan solo en tu navegador, no dentro del proyecto ni del archivo .json.
- La grabación de video usa `MediaRecorder`; funciona mejor en Chrome y Edge.

## Licencia

[MIT](LICENSE). Puedes usarlo, copiarlo, modificarlo y compartirlo libremente, conservando el aviso de copyright.
