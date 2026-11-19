import { Logo } from "./logo";
import { container } from "./styles";
import { ThemeToggle } from "./theme-toggle";

// Encabezado de las páginas interiores: el logo vuelve a la portada y el botón cambia el tema.
export function SiteHeader() {
  return (
    <header className={`${container} flex items-center justify-between gap-6 pt-3.5`}>
      <Logo />
      <ThemeToggle />
    </header>
  );
}
