import React, { useState, useEffect, useRef } from 'react';
import { parseRecipe, isRecipeUpdated } from "../utils/formatChecker";
import useOutsideClick from '../hooks/useOutsideClick';

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
        `${process.env.NEXT_PUBLIC_API_URL}/recipes/${recipeId}/versions`,
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
          // תצוגה למתכון בפורמט החדש
          <>
            <div>
              <h4 className="font-medium text-gray-700">כותרת:</h4>
              <p>{formattedContent.title}</p>
            </div>

            {formattedContent.categories?.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700">קטגוריות:</h4>
                <p>{formattedContent.categories.join(', ')}</p>
              </div>
            )}

            {formattedContent.ingredients?.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700">מצרכים:</h4>
                <ul className="list-disc list-inside">
                  {formattedContent.ingredients.map((ingredient, idx) => (
                    <li key={idx}>{ingredient}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="font-medium text-gray-700">הוראות הכנה:</h4>
              <p className="whitespace-pre-wrap">{formattedContent.instructions}</p>
            </div>
          </>
        ) : (
          // תצוגה למתכון בפורמט הישן
          <>
            <div>
              <h4 className="font-medium text-gray-700">כותרת:</h4>
              <p>{version.content.title}</p>
            </div>

            {version.content.categories?.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700">קטגוריות:</h4>
                <p>{version.content.categories.join(', ')}</p>
              </div>
            )}

            <div>
              <h4 className="font-medium text-gray-700">תוכן המתכון:</h4>
              <p className="whitespace-pre-wrap">
                {rawContent.split('\n').filter(line => line.trim()).join('\n')}
              </p>
            </div>
          </>
        )}

        {version.image && (
          <div>
            <h4 className="font-medium text-gray-700">תמונה:</h4>
            <img 
              src={version.image} 
              alt={`תמונה לגרסה ${version.version_num}`}
              className="mt-2 max-w-full h-auto rounded-lg"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4" ref={modalRef}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 flex items-center gap-1"
          >
            <span>←</span>
            <span>חזור לעריכה</span>
          </button>
          <h2 className="text-xl font-bold">היסטוריית גרסאות</h2>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-2 rounded text-center bg-red-100 text-red-700">
          {error}
        </div>
      )}

      {restoreMessage && (
        <div className={`mb-4 p-2 rounded text-center ${
          restoreMessage.includes('שגיאה') 
          ? 'bg-red-100 text-red-700' 
          : 'bg-green-100 text-green-700'
        }`}>
          {restoreMessage}
        </div>
      )}

      <div className="space-y-4">
        {versions.map((version) => (
          <div
            key={version.id}
            className="bg-white border rounded-lg p-4 hover:shadow-md transition-all duration-200"
          >
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <h3 className="font-semibold">
                  גרסה {version.version_num} 
                  {version.change_description && (
                    <span className="text-sm text-gray-500 mr-2">
                      ({version.change_description})
                    </span>
                  )}
                  {version.is_current && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full mr-2">
                      נוכחי
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(version.created_at).toLocaleString('he-IL')}
                </p>
              </div>
              <div className="space-x-2 rtl:space-x-reverse">
                <button
                  onClick={() => setExpandedVersion(expandedVersion === version.id ? null : version.id)}
                  className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
                    expandedVersion === version.id 
                    ? 'bg-gray-100 text-gray-700 border border-gray-300' 
                    : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {expandedVersion === version.id ? 'הסתר תוכן' : 'הצג תוכן'}
                </button>
                {!version.is_current && (
                  <button
                    onClick={() => handleRestore(version.id)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors duration-200"
                  >
                    שחזר גרסה זו
                  </button>
                )}
              </div>
            </div>

            {expandedVersion === version.id && (
              <div className="mt-4 pt-4 border-t border-gray-100">
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