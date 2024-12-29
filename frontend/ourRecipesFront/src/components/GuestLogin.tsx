import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useNotification } from "@/context/NotificationContext";

const GuestLogin = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useNotification();
  const maxRetries = 3;

  const handleGuestLogin = async (retryCount = 0) => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(response.status === 429 ? "נסיונות רבים מדי, אנא נסה שוב מאוחר יותר" : "התחברות כאורח נכשלה");
      }
      
      router.push("/");
    } catch (error) {
      console.error("Error:", error);
      
      // Retry logic for network errors
      if (retryCount < maxRetries && error instanceof Error && error.message.includes('fetch')) {
        setTimeout(() => handleGuestLogin(retryCount + 1), 1000 * (retryCount + 1));
        return;
      }

      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : "אירעה שגיאה בהתחברות",
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    handleGuestLogin(0);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isLoading}
        variant="secondary"
        className="w-full"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 ml-2" />
            מתחבר...
          </div>
        ) : (
          "הכנס כאורח"
        )}
      </Button>
    </>
  );
};

export default GuestLogin;
