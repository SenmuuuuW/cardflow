import type { Metadata } from "next";
import { cardflowProject } from "@/lib/cardflow-project";
import "./globals.css";

export const metadata: Metadata = {
  title: cardflowProject.name,
  description: cardflowProject.metadataDescription,
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
