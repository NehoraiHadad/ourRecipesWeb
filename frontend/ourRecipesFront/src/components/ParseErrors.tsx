interface ParseErrorsProps {
  errors: string[] | null;
  className?: string;
  showEmptyMessage?: boolean;
}

const ParseErrors: React.FC<ParseErrorsProps> = ({ 
  errors, 
  className = "", 
  showEmptyMessage = true 
}) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return showEmptyMessage ? (
      <div className="p-3 text-xs text-gray-400">אין שגיאות פרסור</div>
    ) : null;
  }

  return (
    <div className={className}>
      <p>שגיאות פרסור:</p>
      <ul className="list-disc list-inside">
        {errors.map((error, idx) => (
          <li key={idx} className="line-clamp-1">{error}</li>
        ))}
      </ul>
    </div>
  );
};

export default ParseErrors; 