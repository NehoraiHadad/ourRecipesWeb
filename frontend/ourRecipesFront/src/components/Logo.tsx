import Image from "next/image";
import { useRouter } from "next/navigation";

const Logo = () => {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push('/')}
      className={`
        cursor-pointer group flex items-center gap-2 transition-all duration-300
        text-2xl text-primary-800 hover:text-primary-600
      `}
    >
      <span className="transform group-hover:-rotate-2 transition-transform">
        המתכונים שלנו
      </span>
      {/* The hand-drawn heart lifted from the app logo, instead of a generic emoji */}
      <Image
        src="/logo-heart.png"
        alt=""
        width={122}
        height={109}
        priority
        className="h-6 w-auto transform transition-transform group-hover:scale-110 group-hover:-rotate-6"
      />
    </div>
  );
};

export default Logo;
