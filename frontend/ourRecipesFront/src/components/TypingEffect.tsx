import React, { useEffect, useState } from 'react';

interface TypingEffectProps {
    message: string;
    onComplete: () => void;  // Callback when the typing effect is complete
}

const TypingEffect: React.FC<TypingEffectProps> = ({ message, onComplete }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (isComplete) {
            const timer = setTimeout(() => {
                onComplete();
            }, 3000);  // Wait for 3 seconds before calling onComplete
            return () => clearTimeout(timer);
        }

        if (displayedText.length < message.length) {
            const timeoutId = setTimeout(() => {
                setDisplayedText(message.substring(0, displayedText.length + 1));
            }, 70);  // Delay in ms between each character
            return () => clearTimeout(timeoutId);
        } else {
            setIsComplete(true);
        }
    }, [displayedText, message, onComplete, isComplete]);

    return (
        <div className="text-sm text-gray-600">
            {displayedText}
        </div>
    );
};

export default TypingEffect;
