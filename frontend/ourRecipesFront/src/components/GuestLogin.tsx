import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useNotification } from "@/context/NotificationContext";
import { useAuthContext } from "@/context/AuthContext";
import { authService } from "@/services/authService";

const GuestLogin = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useNotification();
  const { setAuthState } = useAuthContext();
  const maxRetries = 3;

  const handleGuestLogin = async (retryCount = 0) => {
    setIsLoading(true);
    console.group('Guest Login Process');
    console.log('Attempt Details:', {
      retryCount,
      maxRetries,
      timestamp: new Date().toISOString()
    });
    
    try {
      const authData = await authService.login({ guestName: 'Guest' });
      console.log('Server Response:', authData); // Debug log
      
      // Update auth state immediately with the response data
      setAuthState({
        isAuthenticated: authData.login || false,
        canEdit: authData.canEdit || false,
        isLoading: false,
        error: null,
        user: authData.user || {
          id: 'guest',
          name: 'Guest',
          type: 'guest'
        }
      });

      // Store the token in localStorage if it exists
      if (authData.token) {
        localStorage.setItem('guest_token', authData.token);
      }

      addNotification({
        type: 'success',
        message: authData.message || "התחברת בהצלחה כאורח",
        duration: 5000
      });

      console.log('Guest Login Success');
      router.push("/");
    } catch (error) {
      console.error('Guest Login Error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : '',
        retryCount,
        timestamp: new Date().toISOString()
      });

      if (retryCount < maxRetries) {
        console.log(`Retrying... Attempt ${retryCount + 1} of ${maxRetries}`);
        setTimeout(() => handleGuestLogin(retryCount + 1), 1000);
      } else {
        addNotification({
          type: 'error',
          message: 'שגיאה בהתחברות כאורח. אנא נסה שוב מאוחר יותר.',
          duration: 5000
        });
      }
    } finally {
      setIsLoading(false);
      console.groupEnd();
    }
  };

  const handleClick = () => {
    handleGuestLogin();
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      variant="secondary"
      className="w-full"
    >
      {isLoading ? 'מתחבר...' : 'התחבר כאורח'}
    </Button>
  );
};

export default GuestLogin;
