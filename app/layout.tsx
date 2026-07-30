import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarePulse | 证据驱动客服 Copilot",
  description:
    "以证据、风险信号和人工审批为核心的受控消费者共情客服 Copilot。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
