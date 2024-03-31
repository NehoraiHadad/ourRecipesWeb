"use client";

import Script from "next/script";
import { useEffect } from "react";

const LoginPage = () => {
  useEffect(() => {
    // Define the callback function globally to ensure Telegram can access it
    (window as any).handleTelegramAuth = (userData: any) => {
      console.log(userData); // userData contains information provided by Telegram
      // Here, you'd typically send userData to your backend for validation and further processing
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
    </>
  );
};

export default LoginPage;
