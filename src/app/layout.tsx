import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPA API WhatsApp — Admin",
  description: "Extração multi-cliente da API OPA Suite para Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  );
}
