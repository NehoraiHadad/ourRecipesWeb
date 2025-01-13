import React, { useState, useEffect, useMemo } from "react";
import { useTimer } from '@/context/TimerContext';
import type { Timer } from '@/context/TimerContext';
import IngredientList from "./IngredientList";
import CategoryTags from './CategoryTags';
import { difficultyDisplay } from '@/utils/difficulty';
import { recipe } from '@/types';
import { shareRecipe } from '@/utils/share';
import { Button } from './ui/Button';
import { Typography } from './ui/Typography';
import { useFont } from '@/context/FontContext';

interface RecipeDisplayProps {
  recipe: recipe;
  onPrepTimeClick?: () => void;
  showTimer?: boolean;
}

interface WaitInstruction {
  stepNumber: number;
  minutes: number;
  description: string;
}

const RecipeDisplay: React.FC<RecipeDisplayProps> = ({ recipe, onPrepTimeClick, showTimer }) => {
  const { 
    getRecipeTimers,
    addTimer, 
    removeTimer, 
    updateTimer, 
    pauseTimer, 
    resumeTimer,
    isSoundMuted,
    toggleSound
  } = useTimer();
  const [multiplier, setMultiplier] = useState(1);
  const [selectedIngredients, setSelectedIngredients] = useState<boolean[]>([]);
  const [ingredients, setIngredients] = useState<(string | JSX.Element)[]>([]);
  const { currentFont } = useFont();
  const [newTimerMinutes, setNewTimerMinutes] = useState(recipe.preparation_time || 0);
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [autoTimersAdded, setAutoTimersAdded] = useState(false);

  const activeTimers = getRecipeTimers(recipe.id.toString());

  const adjustMultiplier = (delta: number) => {
    setMultiplier(prev => {
      const newValue = Math.round((prev + delta) * 2) / 2; // Round to nearest 0.5
      return Math.min(Math.max(newValue, 0.5), 4); // Clamp between 0.5 and 4
    });
  };

  useEffect(() => {
    if (recipe.ingredients) {
      const adjustedIngredients = recipe.ingredients.map(ingredient => {
        // Searching for numbers, fractions, or quantity words in English at the beginning of the string
        const match = ingredient.match(/^([\d./]+|\d*\s*[½¼¾]|\d*\s*(חצי|רבע|שלושת רבעי|שליש|שני שליש|רבעי|שמינית))\s*/);
        if (match) {
          const quantity = match[1];
          const rest = ingredient.slice(match[0].length);
          
          // Converting the fraction or word to a number
          let numericQuantity = 0;
          
          // Converting Hebrew words to numbers
          if (typeof quantity === 'string') {
            switch(quantity.trim()) {
              case 'חצי':
                numericQuantity = 0.5;
                break;
              case 'רבע':
                numericQuantity = 0.25;
                break;
              case 'שלושת רבעי':
                numericQuantity = 0.75;
                break;
              case 'שליש':
                numericQuantity = 1/3;
                break;
              case 'שני שליש':
                numericQuantity = 2/3;
                break;
              case 'שמינית':
                numericQuantity = 0.125;
                break;
              default:
                // Checking for fractions
                if (quantity.includes('½')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.5 : 
                    0.5;
                } else if (quantity.includes('¼')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.25 : 
                    0.25;
                } else if (quantity.includes('¾')) {
                  numericQuantity = quantity.includes(' ') ? 
                    parseInt(quantity) + 0.75 : 
                    0.75;
                } else if (quantity.includes('/')) {
                  const [numerator, denominator] = quantity.split('/');
                  numericQuantity = parseInt(numerator) / parseInt(denominator);
                } else {
                  numericQuantity = parseFloat(quantity);
                }
            }
          }

          // Calculating the new quantity
          let newQuantity = (numericQuantity * multiplier).toFixed(2);
          const numValue = parseFloat(newQuantity);

          // Conversion back to the appropriate format
          if (numValue % 1 === 0) {
            // Integer
            newQuantity = numValue.toString();
          } else if (numValue === 0.5) {
            newQuantity = 'חצי';
          } else if (numValue === 0.25) {
            newQuantity = 'רבע';
          } else if (numValue === 0.75) {
            newQuantity = 'שלושת רבעי';
          } else if (numValue === 1/3) {
            newQuantity = 'שליש';
          } else if (numValue === 2/3) {
            newQuantity = 'שני שליש';
          } else if (numValue === 0.125) {
            newQuantity = 'שמינית';
          } else if (numValue % 0.5 === 0) {
            // Number and half
            const whole = Math.floor(numValue);
            newQuantity = whole === 0 ? 'חצי' : `${whole} וחצי`;
          } else if (numValue % 0.25 === 0) {
            // Number and quarter/three quarters
            const whole = Math.floor(numValue);
            const fraction = numValue - whole;
            if (fraction === 0.25) {
              newQuantity = whole === 0 ? 'רבע' : `${whole} ורבע`;
            } else if (fraction === 0.75) {
              newQuantity = whole === 0 ? 'שלושת רבעי' : `${whole} ושלושת רבעי`;
            }
          } else {
            // If we didn't find a nice representation, leave it as a decimal
            newQuantity = numValue.toFixed(2);
          }

          return `${newQuantity} ${rest}`;
        }
        return ingredient;
      });
      setIngredients(adjustedIngredients);
      setSelectedIngredients(new Array(recipe.ingredients.length).fill(false));
    }
  }, [recipe.ingredients, multiplier]);

  const handleIngredientClick = (index: number) => {
    setSelectedIngredients(prev => {
      const newSelected = [...prev];
      newSelected[index] = !newSelected[index];
      return newSelected;
    });
  };

  // Parse instructions for wait times
  const waitInstructions = useMemo(() => {
    if (!recipe.instructions) return [];
    
    const instructions = Array.isArray(recipe.instructions) 
      ? recipe.instructions 
      : recipe.instructions.split('\n');

    const waitTimes: WaitInstruction[] = [];
    const waitPatterns = [
      // זיהוי פעולות המתנה ישירות
      /(?:להמתין|לחכות|להשהות|לתת לנוח|להתפיח|לצנן)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי פעולות פסיביות שדורשות המתנה
      /(?:מניחים|משרים|משהים|מתפיחים|מצננים|מקררים|מחכים)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי ביטויי זמן
      /(?:במשך|למשך|ל|עד)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי זמן בתחילת המשפט
      /^(\d+)\s*(?:דקות|דק'|שעות|שעה)\s+(?:של\s+)?(?:המתנה|השהייה|הפסקה|צינון|קירור|התפחה)/i,
      
      // זיהוי זמן בסוף המשפט
      /(?:ממתינים|מחכים|משאירים|משהים)\s+(?:בצד\s+)?(?:ל|עוד\s+)?(\d+)\s*(?:דקות|דק'|שעות|שעה)$/i,
      
      // זיהוי פעולות מורכבות
      /(?:להניח ל|לתת ל|משאירים ל)(?:התקרר|התפיח|נוח|צנן)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי ביטויי זמן עם תיאור פעולה
      /(\d+)\s*(?:דקות|דק'|שעות|שעה)\s+(?:עד ש|על מנת ש|כדי ש)/i,

      // זיהוי פעולות אחרי זמן מסוים
      /(?:לכבות|להוציא|לערבב|לבדוק|לטפל|לבשל|לאפות)\s+(?:את\s+)?(?:ה|זה\s+)?(?:אחרי|לאחר|כעבור|בתום)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי פעולות עם מילת "אחרי/לאחר" בתחילת המשפט
      /^(?:אחרי|לאחר|כעבור|בתום)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
      
      // זיהוי ביטויי "להמשיך" עם זמן
      /(?:להמשיך|ממשיכים|נמשיך)\s+(?:לבשל|לאפות|לערבב)?\s+(?:עוד|ל|למשך)?\s*(\d+)\s*(?:דקות|דק'|שעות|שעה)/i
    ];

    instructions.forEach((instruction, index) => {
      for (const pattern of waitPatterns) {
        const match = instruction.match(pattern);
        if (match) {
          let minutes = parseInt(match[1]);
          
          // Convert hours to minutes if needed
          if (instruction.includes('שעה') || instruction.includes('שעות')) {
            // אם מצוין "חצי שעה"
            if (instruction.includes('חצי שעה')) {
              minutes = 30;
            }
            // אם מצוין "רבע שעה"
            else if (instruction.includes('רבע שעה')) {
              minutes = 15;
            }
            // אם לא צוין מספר מפורש אבל יש "שעה"
            else if (!match[1] && (instruction.includes('שעה') && !instruction.includes('שעות'))) {
              minutes = 60;
            }
            // אחרת, המר שעות לדקות
            else if (minutes) {
              minutes *= 60;
            }
          }
          
          // אם לא זוהה מספר אבל יש ביטוי זמן
          if (!minutes) {
            if (instruction.includes('כמה דקות') || instruction.includes('מספר דקות')) {
              minutes = 5; // ברירת מחדל ל"כמה דקות"
            } else if (instruction.includes('זמן קצר')) {
              minutes = 3;
            }
          }

          if (minutes) {
            // בדוק אם כבר יש טיימר לשלב זה עם אותו זמן
            const existingTimer = waitTimes.find(
              t => t.stepNumber === index + 1 && t.minutes === minutes
            );
            
            if (!existingTimer) {
              waitTimes.push({
                stepNumber: index + 1,
                minutes,
                description: instruction.slice(0, 50) + (instruction.length > 50 ? '...' : '')
              });
            }
          }
          break;
        }
      }
    });

    return waitTimes;
  }, [recipe.instructions]);

  // Remove the auto-start effect
  useEffect(() => {
    if (showTimer && !autoTimersAdded && waitInstructions.length > 0) {
      setAutoTimersAdded(true);
    }
  }, [showTimer, autoTimersAdded, waitInstructions]);

  // Update timer actions to use context
  const handleAddTimer = (timerData: Omit<Timer, 'id' | 'isPaused'>) => {
    addTimer({
      ...timerData,
      recipeId: recipe.id.toString(),
      recipeName: recipe.title
    });
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      {recipe.image && (
        <img
          src={
            recipe.image.startsWith("data:")
              ? recipe.image
              : `data:image/jpeg;base64,${recipe.image}`
          }
          alt={recipe.title}
          className="rounded-lg w-full h-auto mb-4"
        />
      )}
      <div className="p-4">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-center">{recipe.title}</h2>
          <Button
            variant="ghost"
            onClick={() => shareRecipe(recipe)}
            className="p-1.5 hover:bg-secondary-50"
            title="שתף מתכון"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
        </div>

        <div className="flex flex-col items-center mb-4">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-2 text-xs sm:text-sm text-gray-600">
            {recipe.preparation_time && (
              <div 
                className={`flex items-center gap-1 cursor-pointer transition-colors
                  ${showTimer ? 'text-primary-600' : 'hover:text-primary-600'}`}
                onClick={onPrepTimeClick}
                role="button"
                title="לחץ להפעלת טיימר"
              >
                <span>⏱️</span>
                <span className="break-words">{recipe.preparation_time} דקות</span>
              </div>
            )}
            {recipe.difficulty && (
              <div className="flex items-center gap-1">
                <span>📊</span>
                <span className="break-words">{difficultyDisplay[recipe.difficulty.toUpperCase() as keyof typeof difficultyDisplay]}</span>
              </div>
            )}
          </div>
          
          {/* Timer Section */}
          {(showTimer || activeTimers.length > 0) && (
            <div className="w-full">
              {/* Active Timers */}
              {activeTimers.length > 0 && (
                <div className="mb-3 space-y-2">
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center justify-center w-8 h-8 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
                      onClick={toggleSound}
                      title={isSoundMuted ? 'הפעל צליל' : 'השתק צליל'}
                    >
                      {isSoundMuted ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </Button>
                  </div>
                  {activeTimers.map(timer => (
                    <div 
                      key={timer.id} 
                      className={`flex items-center gap-3 bg-secondary-50/50 rounded-lg p-2 border border-secondary-100
                        ${timer.timeLeft <= 10 && !timer.isPaused ? 'animate-pulse border-red-200 bg-red-50/50' : ''}`}
                    >
                      <div className={`font-mono text-base font-medium bg-white px-2 py-1 rounded-md shadow-sm
                        ${timer.isPaused ? 'text-secondary-600' : timer.timeLeft <= 10 ? 'text-red-600' : 'text-primary-600'}`}
                      >
                        {Math.floor(timer.timeLeft / 60)}:{(timer.timeLeft % 60).toString().padStart(2, '0')}
                      </div>
                      {editingTimerId === timer.id ? (
                        <form 
                          className="flex-1 min-w-0"
                          onSubmit={(e) => {
                            e.preventDefault();
                            // @ts-ignore
                            window.updateActiveTimer?.(timer.id, { description: editingName });
                            setEditingTimerId(null);
                          }}
                        >
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary-300"
                            autoFocus
                            onBlur={() => setEditingTimerId(null)}
                          />
                        </form>
                      ) : (
                        <Typography 
                          variant="body" 
                          className={`font-handwriting-${currentFont} text-sm text-secondary-700 flex-1 min-w-0 line-clamp-1`}
                        >
                          <div 
                            className="cursor-pointer hover:text-primary-600"
                            onClick={() => {
                              setEditingTimerId(timer.id);
                              setEditingName(timer.description);
                            }}
                          >
                            {timer.description}
                          </div>
                        </Typography>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors
                            ${timer.isPaused 
                              ? 'text-primary-600 hover:bg-primary-50' 
                              : 'text-secondary-600 hover:bg-secondary-50'}`}
                          onClick={() => {
                            if (timer.isPaused) {
                              resumeTimer(timer.id);
                            } else {
                              pauseTimer(timer.id);
                            }
                          }}
                          title={timer.isPaused ? 'המשך' : 'השהה'}
                        >
                          {timer.isPaused ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center justify-center w-8 h-8 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-50"
                          onClick={() => removeTimer(timer.id)}
                          title="מחק טיימר"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* New Timer Form */}
              {showTimer && (
                <div className="animate-in slide-in-from-top duration-300">
                  <div className="bg-secondary-50/50 rounded-lg p-3 border border-secondary-100">
                    <div className="flex flex-col gap-3">
                      {/* Manual Timer Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newTimerMinutes}
                          onChange={(e) => setNewTimerMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-20 px-3 py-2 text-lg font-mono text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
                          min="1"
                          placeholder="דקות"
                        />
                        <Button
                          variant="primary"
                          onClick={() => {
                            if (newTimerMinutes > 0) {
                              handleAddTimer({
                                stepNumber: activeTimers.length + 1,
                                timeLeft: newTimerMinutes * 60,
                                description: `טיימר ${activeTimers.length + 1}`,
                                recipeId: recipe.id.toString(),
                                recipeName: recipe.title
                              });
                            }
                          }}
                          className="px-4"
                          disabled={newTimerMinutes <= 0}
                        >
                          <Typography variant="body" className="font-handwriting-amit">הפעל טיימר</Typography>
                        </Button>
                      </div>

                      {/* Detected Timers Section */}
                      {waitInstructions.length > 0 && (
                        <div className="space-y-2">
                          <Typography variant="body" className="text-sm text-secondary-600">
                            נמצאו {waitInstructions.length} זמני המתנה בהוראות ההכנה:
                          </Typography>
                          <div className="space-y-2">
                            {waitInstructions.map((instruction, index) => {
                              // Check if this timer is already active
                              const isActive = activeTimers.some(
                                timer => timer.description === instruction.description
                              );

                              return (
                                <div 
                                  key={index}
                                  className="flex items-center gap-2 bg-white/50 rounded-lg p-2 border border-secondary-100"
                                >
                                  <div className="flex-1 min-w-0">
                                    <Typography variant="body" className="text-sm text-secondary-700 line-clamp-1">
                                      {instruction.description}
                                    </Typography>
                                    <Typography variant="body" className="text-xs text-secondary-500">
                                      {instruction.minutes} דקות
                                    </Typography>
                                  </div>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      if (!isActive) {
                                        handleAddTimer({
                                          stepNumber: instruction.stepNumber,
                                          timeLeft: instruction.minutes * 60,
                                          description: instruction.description,
                                          recipeId: recipe.id.toString(),
                                          recipeName: recipe.title
                                        });
                                      }
                                    }}
                                    disabled={isActive}
                                    className="whitespace-nowrap"
                                  >
                                    {isActive ? (
                                      <Typography variant="body" className="text-sm text-secondary-500">
                                        נוסף ✓
                                      </Typography>
                                    ) : (
                                      <Typography variant="body" className="text-sm">
                                        הפעל טיימר
                                      </Typography>
                                    )}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {recipe.categories && recipe.categories.length > 0 && (
          <div className="mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            <CategoryTags categories={recipe.categories} />
          </div>
        )}

        <div className="relative">
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="absolute sm:left-1 -left-4 -top-8 flex flex-col sm:flex-row items-center gap-0.5 bg-white/95 backdrop-blur 
                          border border-primary-100 rounded-lg sm:rounded-full sm:py-1 sm:pl-1 sm:pr-2 p-1
                          shadow-sm hover:shadow-md transition-all duration-300 z-10">
              <button
                onClick={() => adjustMultiplier(-0.5)}
                className="text-primary-600 hover:text-primary-700 hover:bg-primary-50/50
                  w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center
                  transition-all duration-200 relative
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-300/50
                  disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={multiplier <= 0.5}
                title="הקטן כמויות"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round"/>
                </svg>
              </button>
              <div className="w-8 sm:w-12 text-center font-medium text-primary-700 text-sm tabular-nums">
                {multiplier}X
              </div>
              <button
                onClick={() => adjustMultiplier(0.5)}
                className="text-primary-600 hover:text-primary-700 hover:bg-primary-50/50
                  w-6 h-6 rounded-full flex items-center justify-center
                  transition-all duration-200 relative
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-300/50
                  disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={multiplier >= 4}
                title="הגדל כמויות"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="7" x2="12" y2="17" strokeLinecap="round"/>
                  <line x1="7" y1="12" x2="17" y2="12" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          )}
          <div>
            <IngredientList
              ingredients={ingredients}
              selectedIngredients={selectedIngredients}
              onIngredientClick={handleIngredientClick}
              multiplier={multiplier}
            />
          </div>
        </div>

        <div className="whitespace-pre-line my-4">
          {recipe.raw_content ? (
            recipe.raw_content.split("\n").map((line: string, index: number) => (
              <p key={index}>{line}</p>
            ))
          ) : recipe.instructions ? (
            Array.isArray(recipe.instructions) ? (
              recipe.instructions.map((instruction: string, index: number) => (
                <p key={index}>{instruction}</p>
              ))
            ) : (
              recipe.instructions.split("\n").map((line: string, index: number) => (
                <p key={index}>{line}</p>
              ))
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecipeDisplay;
