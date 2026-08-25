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
    async function checkAuth() {
      try {
        // apiService enforces its own timeout for validate (see authService).
        const response = await authService.validate();
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
            // `name` is optional on the wire (tokens minted before the claim
            // existed carry none) — never assert it into `undefined`.
            name: authData.name ?? '',
            type: authData.type ?? null
          } : null
        });

        if (authData.authenticated && redirectIfFound) {
            router.push(redirectTo);
        }
      } catch (error) {
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
    }

    checkAuth();
  }, [redirectIfFound, redirectTo, router, setAuthState]);

  return { ...authState, logout };
}
