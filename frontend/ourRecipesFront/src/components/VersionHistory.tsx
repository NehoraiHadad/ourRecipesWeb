import React, { useState, useEffect, useRef } from 'react';
import { parseRecipe, isRecipeUpdated } from "../utils/formatChecker";
import useOutsideClick from '../hooks/useOutsideClick';
import { Button } from "@/components/ui/Button";
import { Typography } from '@/components/ui/Typography';
import Spinner from "@/components/ui/Spinner";
import TypingEffect from "@/components/TypingEffect";

interface Version {
  id: number;
  version_num: number;
  content: {
    title: string;
    raw_content: string;
    categories: string[];
    ingredients: string[];
    instructions: string;
  };
  created_at: string;
  created_by: string;
  change_description: string;
  is_current: boolean;
  image: string | null;
}

interface VersionHistoryProps {
  recipeId: number;
  onRestore: (versionId: number) => void;
  onClose: () => void;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({ recipeId, onRestore, onClose }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClick(modalRef, onClose);

  useEffect(() => {
    fetchVersions();
  }, [recipeId]);

  const fetchVersions = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/versions/recipe/${recipeId}`,
        {
          credentials: 'include',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch versions');
      }
      
      const data = await response.json();
      if (Array.isArray(data) && data.length === 0) {
        setError('אין היסטוריית גרסאות למתכון זה');
        return;
      }
      setVersions(data);
    } catch (error) {
      console.error('Error fetching versions:', error);
      setError('שגיאה בטעינת היסטוריית גרסאות');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: number) => {
    try {
      await onRestore(versionId);
      await fetchVersions();
      setRestoreMessage('הגרסה שוחזרה בהצלחה');
      setTimeout(() => setRestoreMessage(null), 3000);
    } catch (error) {
      setRestoreMessage('שגיאה בשחזור הגרסה');
      setTimeout(() => setRestoreMessage(null), 3000);
    }
  };

  const renderVersionContent = (version: Version) => {
    const rawContent = version.content.raw_content;
    const isFormatted = isRecipeUpdated(rawContent);
    let formattedContent = version.content;
    
    if (isFormatted) {
      formattedContent = { ...parseRecipe(rawContent), raw_content: rawContent };
    }

    return (
      <div className="space-y-4">
        {isFormatted ? (
          <>
            <div>
              <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">כותרת:</Typography>
              <Typography variant="body" className="text-sm sm:text-base">{formattedContent.title}</Typography>
            </div>

            {formattedContent.categories?.length > 0 && (
              <div>
                <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">קטגוריות:</Typography>
                <Typography variant="body" className="text-sm sm:text-base">{formattedContent.categories.join(', ')}</Typography>
              </div>
            )}

            {formattedContent.ingredients?.length > 0 && (
              <div>
                <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-2">מצרכים:</Typography>
                <div className="space-y-1 pr-4">
                  {formattedContent.ingredients.map((ingredient, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="min-w-[6px] h-[6px] rounded-full bg-secondary-500 mt-2"></div>
                      <Typography variant="body" className="text-sm sm:text-base leading-relaxed">
                        {ingredient}
                      </Typography>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">הוראות הכנה:</Typography>
              <Typography variant="body" className="whitespace-pre-wrap text-sm sm:text-base">{formattedContent.instructions}</Typography>
            </div>
          </>
        ) : (
          <>
            <div>
              <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">כותרת:</Typography>
              <Typography variant="body" className="text-sm sm:text-base">{version.content.title}</Typography>
            </div>

            {version.content.categories?.length > 0 && (
              <div>
                <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">קטגוריות:</Typography>
                <Typography variant="body" className="text-sm sm:text-base">{version.content.categories.join(', ')}</Typography>
              </div>
            )}

            <div>
              <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">תוכן המתכון:</Typography>
              <Typography variant="body" className="whitespace-pre-wrap text-sm sm:text-base">
                {rawContent.split('\n').filter(line => line.trim()).join('\n')}
              </Typography>
            </div>
          </>
        )}

        {version.image && (
          <div>
            <Typography variant="h4" className="text-gray-700 text-sm sm:text-base mb-1">תמונה:</Typography>
            <img 
              src={version.image} 
              alt={`תמונה לגרסה ${version.version_num}`}
              className="mt-2 max-w-full h-auto rounded-lg shadow-warm"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6" ref={modalRef}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <Button
            variant="secondary"
            onClick={onClose}
            className="shadow-warm hover:shadow-lg transition-all w-full sm:w-auto"
          >
            <Typography variant="body" className="font-handwriting-amit flex items-center gap-1 text-sm sm:text-base">
              <span>←</span>
              <span>חזור למתכון</span>
            </Typography>
          </Button>
          <Typography variant="h2" className="font-handwriting-amit text-lg sm:text-2xl">היסטוריית גרסאות</Typography>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center p-2 sm:p-4">
          <Spinner message="טוען היסטוריית גרסאות..." />
        </div>
      )}

      {error && (
        <div className="mb-4 sm:mb-6 text-center">
          <Typography variant="body" className="text-sm sm:text-base">
            <TypingEffect message={error} onComplete={() => {}} />
          </Typography>
        </div>
      )}

      {restoreMessage && (
        <div className="mb-4 sm:mb-6 text-center">
          <Typography variant="body" className="text-sm sm:text-base">
            <TypingEffect message={restoreMessage} onComplete={() => setRestoreMessage(null)} />
          </Typography>
        </div>
      )}

      <div className="space-y-4 sm:space-y-6">
        {versions.map((version) => (
          <div
            key={version.id}
            className="bg-white rounded-2xl p-3 sm:p-6 shadow-warm hover:shadow-lg transition-all duration-200"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
              <div className="flex-1 w-full sm:w-auto">
                <Typography variant="h3" className="font-handwriting-amit text-base sm:text-lg">
                  גרסה {version.version_num} 
                  {version.change_description && (
                    <span className="block sm:inline text-xs sm:text-sm text-gray-500 mt-1 sm:mt-0 sm:mr-2 font-sans">
                      ({version.change_description})
                    </span>
                  )}
                  {version.is_current && (
                    <span className="block sm:inline bg-secondary-100 text-secondary-800 text-xs px-2 py-0.5 rounded-full mt-1 sm:mt-0 sm:mr-2 font-sans">
                      נוכחי
                    </span>
                  )}
                </Typography>
                <Typography variant="body" className="text-gray-500 mt-1 text-xs sm:text-sm">
                  {new Date(version.created_at).toLocaleString('he-IL')}
                </Typography>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  onClick={() => setExpandedVersion(expandedVersion === version.id ? null : version.id)}
                  className="shadow-warm hover:shadow-lg transition-all flex-1 sm:flex-none"
                >
                  <Typography variant="body" className="font-handwriting-amit text-sm sm:text-base">
                    {expandedVersion === version.id ? 'הסתר תוכן' : 'הצג תוכן'}
                  </Typography>
                </Button>
                {!version.is_current && (
                  <Button
                    variant="primary"
                    onClick={() => handleRestore(version.id)}
                    className="shadow-warm hover:shadow-lg transition-all flex-1 sm:flex-none"
                  >
                    <Typography variant="body" className="font-handwriting-amit text-sm sm:text-base">
                      שחזר גרסה זו
                    </Typography>
                  </Button>
                )}
              </div>
            </div>

            {expandedVersion === version.id && (
              <div className="mt-4 pt-4 sm:mt-6 sm:pt-6 border-t border-secondary-100">
                {renderVersionContent(version)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VersionHistory; 