import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../context/AuthContext";

export function useAuth(
  redirectTo: string = "",
  redirectIfFound: boolean = false
) {
  const { authState, setAuthState } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/validate`,
          {
            method: "GET",
            credentials: "include",
          }
        );
        if (response.ok) {
          const data = await response.json();

          setAuthState({
            isAuthenticated: data.authenticated,
            canEdit: data.canEdit,
            isChecking: false,
          });

          if (data.authenticated && redirectIfFound) {
            router.push(redirectTo);
          }
        } else {
          throw new Error("Failed to verify authentication status");
        }
      } catch (error) {
        console.error(error);
        setAuthState({
          isAuthenticated: false,
          canEdit: false,
          isChecking: false,
        });
        if (!redirectIfFound) {
          router.push(redirectTo);
        }
      }
    }

    checkAuth();
  }, [router, redirectTo, redirectIfFound, setAuthState]);

  return authState;
}
