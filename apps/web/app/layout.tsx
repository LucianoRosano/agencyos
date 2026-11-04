import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
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
    { media: "(prefers-color-scheme: dark)", color: "#06070A" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = (await cookies()).get("ag-theme")?.value ?? "dark";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const theme = pref === "light" ? "light" : "dark";
  return (
    <html lang="es-AR" data-theme={theme} data-theme-pref={pref} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
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
        <Toaster
          theme={theme}
          position="bottom-right"
          toastOptions={{ className: "!bg-surface !text-text !border-border", style: { fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
