// hooks/useAuth.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AuthState {
  isAuthenticated: boolean;
  isChecking: boolean;
}

export function useAuth(
  redirectTo: string = "",
  redirectIfFound: boolean = false
) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isChecking: true,
  });
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/validate_session`,
          {
            method: "GET",
            credentials: "include",
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && redirectIfFound) {
            router.push(redirectTo);
          }
          setAuthState({
            isAuthenticated: data.authenticated,
            isChecking: false,
          });
        } else {
          throw new Error("Failed to verify authentication status");
        }
      } catch (error) {
        console.error(error);
        setAuthState({ isAuthenticated: false, isChecking: false });
        if (!redirectIfFound) {
          router.push(redirectTo);
        }
      }
    }

    checkAuth();
  }, [router, redirectTo, redirectIfFound]);

  return authState;
}
