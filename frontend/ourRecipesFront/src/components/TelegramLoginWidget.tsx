import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

const TelegramLoginWidget: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.setAttribute(
      "data-telegram-login",
      process.env.NEXT_PUBLIC_TELEGRAM_BOT || "default_bot"
    );
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "handleTelegramAuth(user)");
    script.async = true;

    const container = document.getElementById("telegram-widget-container");
    container?.appendChild(script);

    return () => {
      container?.removeChild(script);
    };
  }, [router]);

  useEffect(() => {
    (window as any).handleTelegramAuth = (user: any) => {
      console.log(user);
      handleContinue(user)
    };
  }, []);

  const handleContinue = async (user: {}) => {
    try {
      // Sending user data to the backend for verification
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        throw new Error("Login failed");
      }

      router.push("/");
    } catch (error: unknown) {
      console.error("Error posting data:", error);
    }
  };


  return (
    <div className="flex flex-col items-center justify-center my-2">
      <div id="telegram-widget-container" />
    </div>
  );
};

export default TelegramLoginWidget;