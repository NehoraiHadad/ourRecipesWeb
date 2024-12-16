import { useRouter } from "next/navigation";

const Logo = () => {
  const router = useRouter();

  return (
    <div 
      onClick={() => router.push('/')}
      className="cursor-pointer hover:opacity-80 transition-opacity"
    >
      המתכונים שלנו 💕
    </div>
  );
};

export default Logo;
