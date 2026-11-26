"use client";

import { useLayoutEffect } from "react";
import { THEME_KEY } from "./theme";

// Botón de tema claro/oscuro, el mismo en todas las páginas. El claro es el tema por defecto; el oscuro solo se usa
// si el visitante lo elige, y se recuerda en este navegador. Los dos íconos están siempre en el HTML y el tema decide cuál se ve, así el
// servidor y el navegador dibujan lo mismo.
export function ThemeToggle() {
  // En desarrollo React vuelve a montar la página una vez y borra el data-theme que puso el script de layout.tsx.
  useLayoutEffect(() => {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
  }, []);

  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Sin almacenamiento (modo privado estricto): el tema cambia igual, solo que no se recuerda.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch between light and dark theme"
      className="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4.5 dark:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="hidden size-4.5 dark:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" />
      </svg>
    </button>
  );
}
