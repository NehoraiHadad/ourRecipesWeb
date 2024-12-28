import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../context/AuthContext";

export function useAuth(
  redirectTo: string = "",
  redirectIfFound: boolean = false
) {
  const { authState, setAuthState } = useAuthContext();
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      
      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isLoading: false,
        error: null,
        user: null
      });
      
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    async function checkAuth() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/validate`,
          {
            method: "GET",
            credentials: "include",
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to verify authentication status");
        }

        const data = await response.json();

        setAuthState({
          isAuthenticated: data.authenticated,
          canEdit: data.canEdit,
          isLoading: false,
          error: null,
          user: {
            id: data.user_id,
            name: data.name,
            type: data.type
          }
        });

        if (data.authenticated && redirectIfFound) {
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
      }
    }

    checkAuth();
  }, [router, redirectTo, redirectIfFound, setAuthState]);

  return { ...authState, logout };
}
