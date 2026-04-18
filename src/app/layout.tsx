import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Clivi · Dashboard de Cobranza",
  description: "Pacientes con error de pago activo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header style={{ backgroundColor: '#5C2D91' }} className="w-full px-6 py-3 flex items-center gap-3">
          <span className="text-white font-bold text-lg tracking-tight">Clivi</span>
          <span className="text-white/40 text-sm">|</span>
          <span className="text-white/80 text-sm">Dashboard de Cobranza</span>
        </header>
        {children}
      </body>
    </html>
  );
}
