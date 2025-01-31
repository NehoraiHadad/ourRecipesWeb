import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/context/NotificationContext";
import { authService } from "@/services/authService";

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
      console.group('Telegram Auth Process');
      console.log('Telegram Auth Data:', {
        id: user.id,
        first_name: user.first_name,
        username: user.username,
        auth_date: new Date(user.auth_date * 1000).toISOString(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        timestamp: new Date().toISOString()
      });
      handleContinue(user);
      console.groupEnd();
    };
  }, []);

  const handleContinue = async (user: any) => {
    setIsLoading(true);
    console.group('Telegram Login Process');
    
    try {
      const response = await authService.login(user);

      console.log('Login Success');
      console.log('Cookies:', {
        raw: document.cookie,
        parsed: document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.split('=').map(c => c.trim());
          return { ...acc, [key]: value };
        }, {})
      });

      addNotification({
        type: 'success',
        message: 'התחברת בהצלחה!',
        duration: 3000
      });
      
      router.push("/");
    } catch (error) {
      console.error('Login Error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'שגיאה בהתחברות',
        duration: 5000
      });
    } finally {
      setIsLoading(false);
      console.groupEnd();
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