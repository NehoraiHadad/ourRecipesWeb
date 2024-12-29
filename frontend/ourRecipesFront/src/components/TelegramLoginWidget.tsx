import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/context/NotificationContext";

const TelegramLoginWidget: React.FC = () => {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [isLoading, setIsLoading] = useState(false);

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

  const handleContinue = async (user: any) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      addNotification({
        type: 'success',
        message: 'התחברת בהצלחה!',
        duration: 3000
      });
      
      router.push("/");
    } catch (error) {
      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'שגיאה בהתחברות',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center my-2">
      <div id="telegram-widget-container" />
      {isLoading && (
        <div className="mt-2 text-sm text-secondary-600 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-secondary-600" />
          מתחבר...
        </div>
      )}
    </div>
  );
};

export default TelegramLoginWidget;