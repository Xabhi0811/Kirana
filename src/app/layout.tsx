import type { Metadata } from "next";
import { currentProfile } from "@/lib/auth";
import { configured } from "@/lib/auth";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Kirana — Your neighbourhood, online",
    template: "%s | Kirana",
  },
  description:
    "Find products at nearby shops, compare prices and shop locally. Zero delivery and handling fees.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Shell profile={await currentProfile()} connected={configured()}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
