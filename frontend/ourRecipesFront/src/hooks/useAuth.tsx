import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../context/AuthContext";
import { authService } from "../services/authService";

type UserType = "guest" | "telegram" | null;

interface User {
  id: string;
  name: string;
  type: UserType;
}

interface AuthData {
  authenticated: boolean;
  canEdit: boolean;
  user_id?: string;
  name?: string;
  type?: UserType;
}

type ValidateResponse = {
  authenticated: boolean;
  canEdit: boolean;
  user_id?: string;
  name?: string;
  type?: string;
  status: string;
  message: string;
};

export function useAuth(
  redirectTo: string = "",
  redirectIfFound: boolean = false
) {
  const { authState, setAuthState } = useAuthContext();
  const router = useRouter();

  const logout = async () => {
    try {
      console.group('Logout Process');
      console.log('Starting logout...');
      
      await authService.logout();
      
      console.log('Resetting auth state...');
      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isLoading: false,
        error: null,
        user: null
      });
      
      console.log('Redirecting to login page...');
      router.push('/login');
      console.groupEnd();
    } catch (error) {
      console.error('Logout failed:', error);
      console.groupEnd();
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    async function checkAuth() {
      try {
        const response = (await authService.validate() as unknown) as ValidateResponse;
        const authData: AuthData = {
          authenticated: response.authenticated,
          canEdit: response.canEdit,
          user_id: response.user_id,
          name: response.name,
          type: response.type as UserType
        };

        setAuthState({
          isAuthenticated: authData.authenticated,
          canEdit: authData.canEdit,
          isLoading: false,
          error: null,
          user: authData.user_id ? {
            id: authData.user_id,
            name: authData.name!,
            type: authData.type ?? null
          } : null
        });

        if (authData.authenticated && redirectIfFound) {
            router.push(redirectTo);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setAuthState({
            isAuthenticated: false,
            canEdit: false,
            isLoading: false,
            error: "בקשת האימות נכשלה עקב תקשורת איטית",
            user: null
          });
        } else {
          console.error(error);
          setAuthState({
            isAuthenticated: false,
            canEdit: false,
            isLoading: false,
            error: error instanceof Error ? error.message : "An unknown error occurred",
            user: null
          });
          if (!redirectIfFound) {
            router.push(redirectTo);
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    checkAuth();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [redirectIfFound, redirectTo, router, setAuthState]);

  return { ...authState, logout };
}
