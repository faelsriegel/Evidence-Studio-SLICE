import type { Metadata } from "next";
import { Manrope, Petrona, Source_Code_Pro, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code",
  subsets: ["latin"],
});

const petrona = Petrona({
  variable: "--font-petrona",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gerador de Evidencias | SLICE",
  description:
    "Geracao e padronizacao de evidencias corporativas para DPO, LGPD e Seguranca da Informacao.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${sourceCodePro.variable} ${petrona.variable} ${spaceGrotesk.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
