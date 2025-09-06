# Práctica para Escuelas de Conducción

Este es un juego educativo diseñado para ayudar a los estudiantes de escuelas de conducción a practicar y aprender sobre el Código Nacional de Tránsito y las señales de tránsito de Colombia. Desarrollado como una aplicación web, permite a los usuarios realizar cuestionarios teóricos y reconocer señales de tránsito mediante imágenes.

## Características
- **Cuestionario Teórico**: Incluye 70 preguntas sobre el Código Nacional de Tránsito.
- **Señales de Tránsito**: Permite practicar con imágenes de señales clasificadas en categorías (Reglamentarias, Preventivas, Informativas).
- **Modo Personalizable**: Elige entre 10 y 50 preguntas por sesión.
- **Resumen de Errores**: Muestra un resumen de las preguntas erradas y sus respuestas correctas al finalizar.
- **Interfaz Moderna**: Diseñada con fuentes 'Roboto' y 'Montserrat' y un esquema de colores oscuro.

## Cómo Jugar
1. Accede al juego en [https://ferchorama.github.io/driving/](https://ferchorama.github.io/driving/).
2. Selecciona un tema: "Cuestionario Teórico", "Código Nacional de Tránsito" o "Señales de Tránsito".
3. Elige la cantidad de preguntas (de 10 a 50 para las categorías personalizables).
4. Responde las preguntas y usa el botón "Siguiente" para avanzar.
5. Revisa tu puntaje final y el resumen de errores al terminar.

## Estructura del Proyecto
- `index.html`: Archivo principal que contiene la estructura de la interfaz.
- `styles.css`: Estilos CSS con un diseño responsivo y moderno.
- `script.js`: Lógica del juego, incluyendo la carga de preguntas y manejo de interacciones.
- `questions.json`: Contiene las preguntas y respuestas del cuestionario teórico.
- `inventario.csv`: Lista de señales de tránsito con sus categorías e imágenes.
- `Informativas/`, `Preventivas/`, `Reglamentarias/`: Carpetas con imágenes de las señales de tránsito.

## Instalación y Uso Local
1. Clona el repositorio:
   ```bash
   git clone https://github.com/ferchorama/driving.git
