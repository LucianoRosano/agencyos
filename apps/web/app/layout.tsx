import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "@/components/toaster";
import { inter, serif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AGENCYOS", template: "%s · AGENCYOS" },
  description: "Centro de mando de la agencia, los proyectos y el conocimiento de Luciano.",
  applicationName: "AGENCYOS",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "AGENCYOS", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#171411" },
    { media: "(prefers-color-scheme: light)", color: "#F7F4EE" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = (await cookies()).get("ag-theme")?.value ?? "light";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const theme = pref === "dark" ? "dark" : "light";
  return (
    <html lang="es-AR" data-theme={theme} data-theme-pref={pref} className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {pref === "system" ? (
          <script
            nonce={nonce}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: script de tema sin datos de usuario
            dangerouslySetInnerHTML={{
              __html: "document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'",
            }}
          />
        ) : null}
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
        <Toaster theme={theme} />
      </body>
    </html>
  );
}
