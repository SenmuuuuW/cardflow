import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CardFlow",
  description: "Phase 0 application foundation for CardFlow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
