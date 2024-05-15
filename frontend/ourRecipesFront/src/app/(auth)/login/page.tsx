"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GuestLogin from "@/components/GuestLogin";

const Page = () => {
  const router = useRouter();

  useEffect(() => {
    // Define the callback function globally to ensure Telegram can access it
    (window as any).handleTelegramAuth = async (userData: any) => {
      try {
        // Sending userData to the backend for verification
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(userData),
          }
        );

        if (!response.ok) {
          throw new Error("Login failed");
        }

        router.push("/");
      } catch (error: unknown) {
        console.error("Error posting data:", error);
      }
    };
  }, []);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login={process.env.NEXT_PUBLIC_TELEGRAM_BOT}
        data-size="large"
        data-radius="10"
        data-request-access="write"
        data-userpic="false"
        onLoad={() =>
          console.log("Telegram widget script loaded successfully.")
        }
        strategy="afterInteractive"
        data-onauth="handleTelegramAuth(user)"
      />
      <GuestLogin />
      <h2 className="text-center text-xl font-semibold my-2">או</h2>
    </>
  );
};

export default Page;
