# Pronunciation Lab

App local para practicar pronunciación en inglés fonema por fonema. Usa el modelo
`wav2vec2-lv-60-espeak-cv-ft` (Meta) dentro de tu navegador: transcribe los **sonidos**
que dices, sin autocorregir hacia palabras, y los compara con la pronunciación esperada
(inglés estadounidense, generada con eSpeak NG). Tu audio nunca sale de tu computador.

## Cómo abrirla

1. Descomprime la carpeta donde quieras.
2. **Windows:** doble clic en `iniciar.bat`. **Mac:** doble clic en `iniciar.command`
   (la primera vez: clic derecho → Abrir). **Linux:** `python3 serve.py`.
3. Se abre `http://localhost:8765` en el navegador (Chrome o Edge recomendados).
4. Pulsa **Cargar modelo**. La primera vez descarga unos 318 MB desde Hugging Face;
   luego queda guardado en el navegador.
5. Permite el micrófono cuando lo pida.

Necesitas Python 3 (ya viene en Mac y Linux; en Windows: https://www.python.org/downloads/,
marcando "Add python.exe to PATH"). Para cerrar la app, cierra la ventana negra o pulsa Ctrl+C.

No abras `index.html` con doble clic: sin el servidor local, el navegador no guarda el modelo
y algunos navegadores bloquean el micrófono.

## Publicarla en GitHub Pages

1. Crea un repositorio público vacío (por ejemplo `pronunciation-lab`).
2. Sube esta carpeta con git (no por el navegador: `vendor/ort/*.wasm` pesa 25,6 MiB y la web
   de GitHub solo acepta archivos de hasta 25 MiB):
   `git init -b main && git add . && git commit -m "Pronunciation Lab" && git remote add origin <url> && git push -u origin main`
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. Abre `https://<usuario>.github.io/pronunciation-lab/`. La primera vez la página se recarga sola:
   `coi-serviceworker.min.js` agrega las cabeceras que GitHub Pages no permite configurar y activa
   el modo multihilo.

## Cómo usarla

1. Elige el paquete (empieza por **Diagnóstico**).
2. Opcional: **▶ Escuchar modelo** para oír una voz sintética de referencia.
3. **● Grabar** (o tecla R), lee el texto en voz alta y vuelve a pulsar para detener.
   Las palabras se detienen solas a los 4 s y las frases a los 10 s.
4. Revisa el resultado: palabras en rojo, el error de cada una y una pista para corregirlo.
5. Al terminar el paquete: **Copiar reporte para Claude** y pégalo en el chat.

También puedes **Subir audio** (un archivo grabado con el celular) en vez de grabar, y usar
**Práctica libre** para escribir tus propias frases.

## Modos del modelo

| Modo | Descarga | Notas |
| --- | --- | --- |
| Rápido (por defecto) | 318 MB | Versión cuantizada (int8). Recomendado. |
| Preciso | 1,26 GB | Versión completa (fp32). Más lenta; úsala para comparar si dudas de un resultado. |
| GPU (experimental) | 632 MB | WebGPU en fp16. Más rápida si tu navegador la soporta; puede fallar. |

## Qué cuenta como error

- **Error:** un sonido cambiado por otro (`ɪ → iː`), un sonido que falta (`t → (omitido)`)
  o uno que sobra (la "e" de "espeak").
- **No es error:** variantes normales del inglés hablado, como la schwa reducida, la t suave
  americana de *water*, o decir *to* y *and* en forma completa.

Límite importante: el modelo se entrenó sobre todo con voces nativas y se equivoca a veces con
acentos no nativos o con ruido. Toma el resultado como indicador, no como veredicto: repite 2 o 3
veces lo que salga mal y fíjate en los errores que se repiten.

## Formato de los paquetes (.json)

Claude te enviará paquetes nuevos con este formato; se cargan con **Cargar paquete (.json)**.

```json
{
  "id": "semana-1",
  "title": "Semana 1 · /ɪ/ vs /iː/",
  "description": "Instrucciones del paquete",
  "items": [
    { "id": "s1-01", "type": "word", "text": "ship", "focus": "/ɪ/ corta" },
    { "id": "s1-02", "type": "sentence", "text": "Please sit in this seat.", "focus": "/ɪ/ vs /iː/" }
  ]
}
```

`ipa` es opcional en cada ítem: si viene, reemplaza la pronunciación generada (una palabra IPA
por cada palabra del texto, separadas por espacios).

## Créditos y licencias

- Modelo: `facebook/wav2vec2-lv-60-espeak-cv-ft`, conversión ONNX de `onnx-community` (Apache-2.0).
  Xu, Baevski y Auli (2021), *Simple and Effective Zero-shot Cross-lingual Phoneme Recognition*.
- coi-serviceworker (MIT), Guido Zuidhof.
- Transformers.js (Apache-2.0), ONNX Runtime Web (MIT), phonemizer.js (Apache-2.0), que incluye eSpeak NG (GPL-3.0).
