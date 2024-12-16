import type { Metadata } from "next";
import { heebo } from "../../utils/fonts";
import "../(home)/globals.css";
import NavBar from "../../components/NavBar";
import { AuthProvider } from "../../context/AuthContext";

export const metadata: Metadata = {
  title: "ניהול מתכונים",
  description: "מערכת ניהול מתכונים",
};

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <html lang="he" dir="rtl">
        <body className={`${heebo} font-heebo h-dvh`}>
          <NavBar />
          {children}
        </body>
      </html>
    </AuthProvider>
  );
}
