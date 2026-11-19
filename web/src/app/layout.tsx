import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_KEY } from "@/components/site/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DronAI",
  description: "Del video de un dron a un mundo 3D explorable en el navegador.",
};

// El tema que eligió el visitante se guarda en localStorage. Este script lo aplica mientras el navegador lee el
// HTML, antes de pintar, para que la portada no parpadee en claro si eligió oscuro.
const applyTheme = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyTheme }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
