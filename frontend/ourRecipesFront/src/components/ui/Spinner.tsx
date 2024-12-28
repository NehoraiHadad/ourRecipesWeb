
interface SpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Spinner: React.FC<SpinnerProps> = ({ message, size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`animate-spin rounded-full border-b-2 border-gray-900 ${sizeClasses[size]}`}></div>
      {message && <p className="mt-2 text-gray-700">{message}</p>}
    </div>
  );
};

export default Spinner;