import type { Metadata } from "next";
import "./style.css";
import "./restaurant-designs/design.css";

export const metadata: Metadata = {
  title: "Tab2Serve Alpha — Initial Testing Release",
  description: "Bilingual restaurant operations and personal item share calculator. Initial testing release.",
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

