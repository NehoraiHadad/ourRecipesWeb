import { useState } from 'react';
import { Typography } from './Typography';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ value, onChange, options, placeholder = 'בחר...' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find(option => option.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full px-3 py-2 text-right bg-white border border-secondary-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="block truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-secondary-200 rounded-md shadow-lg">
          <ul className="py-1 overflow-auto text-base">
            {options.map((option) => (
              <li
                key={option.value}
                className={`cursor-pointer select-none relative py-2 px-3 hover:bg-secondary-100 ${
                  value === option.value ? 'bg-primary-50 text-primary-900' : 'text-secondary-900'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <Typography variant="body">
                  {option.label}
                </Typography>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 