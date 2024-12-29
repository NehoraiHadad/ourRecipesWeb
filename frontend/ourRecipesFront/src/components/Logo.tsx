import { useRouter } from "next/navigation";
import { useFont } from '@/context/FontContext';

const Logo = () => {
  const router = useRouter();
  const { currentFont } = useFont();

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
      <span className="text-2xl transform group-hover:scale-110 transition-transform">
        💝
      </span>
    </div>
  );
};

export default Logo;
