import { useRouter } from "next/navigation";

const GuestLogin = () => {
  const router = useRouter();

  const handleGuestLogin = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/login_guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch guest token");
      }
      router.push("/");
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return <button onClick={handleGuestLogin}>הכנס כאורח</button>;
};

export default GuestLogin;
