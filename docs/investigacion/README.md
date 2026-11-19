# Investigación inicial (1 de noviembre de 2026)

Antes de escribir código, seis agentes investigaron en paralelo el estado del arte a esa fecha, cada uno sobre un
frente. Luego tres verificadores debían intentar refutar las afirmaciones clave de cada informe.

| Informe | Estado |
| --- | --- |
| 1. Reconstrucción rápida (modelos feed-forward y COLMAP) | Completo |
| 2. Gaussian Splatting de alta calidad | **No se ejecutó** (límite de uso) |
| 3. Visor web | Completo |
| 4. Cómputo e infraestructura | Completo (cubre parte del informe 2: gsplat, Brush, licencias) |
| 5. Capa de IA con Groq | Completo |
| 6. Datos de entrada y fase de RL | Completo |
| Verificación cruzada (hardware, licencias, servicios) | **No se ejecutó** (límite de uso) |

## Cómo leerlo

- [informes-2026-11-01.md](informes-2026-11-01.md) tiene los cinco informes completos: resumen, recomendación,
  opciones evaluadas, riesgos, preguntas abiertas y las afirmaciones clave con su fuente.
- Las decisiones que salieron de aquí están en [../arquitectura.md](../arquitectura.md).
- Cada agente citó fuentes primarias (repositorios, documentación, páginas de precios, papers), pero nadie las
  revisó después. Antes de depender de una cifra, versión, precio o licencia, hay que confirmarla en la fuente.
- Lo que ya se confirmó al instalar: Next.js 16.4.5, React 19.3.0, React Three Fiber 9.8.2, drei 10.7.9,
  three 0.187.0 y Spark 2.4.0 existen y funcionan juntos.
