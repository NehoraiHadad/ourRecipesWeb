import type { Metadata } from "next";
import { heebo } from "../../../utils/fonts";
import "../../(home)/globals.css";

export const metadata: Metadata = {
  title: "recipes web app",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html  lang="he" dir="rtl">
      <body  className={`${heebo} font-heebo h-dvh flex items-center justify-center` }>
        {children}</body>
    </html>
  );
}
