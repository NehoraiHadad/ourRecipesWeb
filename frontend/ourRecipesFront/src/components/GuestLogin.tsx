import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useNotification } from "@/context/NotificationContext";
import { useAuthContext } from "@/context/AuthContext";

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
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      timestamp: new Date().toISOString()
    });
    
    try {
      console.log('Initiating guest login request to:', `${process.env.NEXT_PUBLIC_API_URL}/auth/guest`);
      console.log('Request Headers:', {
        'Content-Type': 'application/json',
        'User-Agent': navigator.userAgent
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      console.log('Server Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        // Log specific HTTP errors
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
          endpoint: `${process.env.NEXT_PUBLIC_API_URL}/auth/guest`,
          method: 'POST'
        };

        let errorMessage;
        switch (response.status) {
          case 405:
            errorMessage = "שיטת הבקשה אינה נתמכת";
            console.error('Method Not Allowed Error:', {
              ...errorDetails,
              allowedMethods: response.headers.get('Allow'),
              suggestion: 'Check if the endpoint supports POST method'
            });
            break;
          case 429:
            errorMessage = "נסיונות רבים מדי, אנא נסה שוב מאוחר יותר";
            console.error('Rate Limit Error:', {
              ...errorDetails,
              retryAfter: response.headers.get('Retry-After'),
              suggestion: 'Implement exponential backoff'
            });
            break;
          case 401:
            errorMessage = "אין הרשאה להתחבר כאורח";
            console.error('Unauthorized Error:', {
              ...errorDetails,
              suggestion: 'Check guest login configuration'
            });
            break;
          case 403:
            errorMessage = "הגישה נדחתה";
            console.error('Forbidden Error:', {
              ...errorDetails,
              suggestion: 'Check guest permissions'
            });
            break;
          default:
            errorMessage = "התחברות כאורח נכשלה";
            console.error('Guest Login Error:', errorDetails);
        }

        console.error('Login Error:', {
          ...errorDetails,
          message: errorMessage
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Store guest token in localStorage and update auth state
      if (data.token) {
        try {
          localStorage.setItem('guest_token', data.token);
          
          // Update auth state immediately
          setAuthState({
            isAuthenticated: true,
            canEdit: false,
            isLoading: false,
            error: null,
            user: {
              id: data.user.id,
              name: data.user.name,
              type: 'guest'
            }
          });

          addNotification({
            type: 'success',
            message: data.message || "התחברת בהצלחה כאורח",
            duration: 5000
          });
        } catch (e) {
          console.warn('Failed to store guest token:', e);
          // Continue even if localStorage is not available
        }
      }

      console.log('Guest Login Success');
      console.log('Cookies:', {
        raw: document.cookie,
        parsed: document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.split('=').map(c => c.trim());
          return { ...acc, [key]: value };
        }, {})
      });
      
      router.push("/");
    } catch (error) {
      console.error('Guest Login Error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        retryCount,
        timestamp: new Date().toISOString()
      });
      
      // Retry logic for network errors
      if (retryCount < maxRetries && error instanceof Error && error.message.includes('fetch')) {
        console.log('Retrying guest login...', {
          nextRetry: retryCount + 1,
          delay: 1000 * (retryCount + 1)
        });
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
      console.groupEnd();
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('Guest Login Button Clicked');
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
