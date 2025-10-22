'use client'

import { useFeatureAnnouncement } from '@/context/FeatureAnnouncementContext';
import { cn } from '@/utils/cn';

interface FeatureIndicatorProps {
  featureId: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function FeatureIndicator({ featureId, className, children, onClick }: FeatureIndicatorProps) {
  const { hasSeenFeature, showFeature } = useFeatureAnnouncement();
  const hasNotSeen = !hasSeenFeature(featureId);

  if (!hasNotSeen) {
    return <>{children}</>;
  }

  const handleIndicatorClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const features = {
      'recipe-timer': {
        title: 'טיימר חכם למתכונים',
        description: 'לחץ על זמן ההכנה כדי להפעיל טיימר. המערכת תזהה אוטומטית זמני המתנה במתכון!'
      },
      'recipe-optimizer': {
        title: 'ייעול זמני הכנה חכם',
        description: 'מערכת הייעול החכמה תנתח את שלבי ההכנה במתכון ותציע דרך יעילה יותר להכין אותו! המערכת תזהה אילו שלבים אפשר לבצע במקביל, מה ניתן להכין מראש, ותחשב כמה זמן תחסכו.'
      },
      'advanced-search': {
        title: 'חיפוש מתקדם',
        description: 'גלה את יכולות החיפוש המתקדמות! סנן לפי זמן הכנה, רמת קושי, רכיבים ספציפיים ועוד. לחץ על כפתור הסינון כדי להתחיל.'
      },
      'ai-recipe': {
        title: 'יצירת מתכונים עם AI',
        description: 'תן ל-AI שלנו ליצור מתכונים מותאמים אישית! הזן את המצרכים הזמינים, העדפות והדרישות שלך, ותן למערכת להציע לך מתכון מושלם. שים לב: יצירת תמונה למתכון עשויה לקחת כ-2 דקות.'
      },
      'font-selection': {
        title: 'פונטים מפרויקט "אות חיים"',
        description: 'האתר משתמש בפונטים מפרויקט "אות חיים" - מיזם להנצחת זכרם של הנרצחים והנופלים במלחמת חרבות ברזל. הפונטים נוצרו מכתב ידם של הנופלים, בשיתוף המשפחות השכולות, כדי להשאיר בעולמנו משהו מהאישיות והייחודיות של יקירינו. כל הפונטים נקראים על שם המונצחים, ונוצרו בהתנדבות כדי להאיר את זכרם בכל בית בישראל.'
      },
      'places-info': {
        title: 'המלצות על מקומות',
        description: 'כאן תוכלו למצוא המלצות על מסעדות, בתי קפה ומקומות אהובים שאנחנו אוהבים לבקר בהם. כל המלצה מגיעה עם תיאור מפורט וטיפים שימושיים. אתם מוזמנים להוסיף את ההמלצות שלכם ולשתף מקומות שאתם אוהבים!'
      },
      'menu-planner': {
        title: 'מתכנן תפריטים חכם',
        description: 'צרו תפריטים מלאים לארועים עם בינה מלאכותית! המערכת תבחר מתכונים מתאימים לשבת, חגים או אירועים משפחתיים, תדאג לאיזון נכון בין המנות, תקפיד על תאימות כשרות (בשר/חלב), ותיצור אוטומטית רשימת קניות מסודרת לפי קטגוריות. פשוט בחרו את סוג האירוע, מספר הסועדים והעדפות תזונתיות - והמערכת תדאג לשאר!'
      }
    };

    const feature = features[featureId as keyof typeof features];
    if (feature) {
      showFeature({
        id: featureId,
        ...feature
      });
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Original component with pointer-events-none until feature is seen */}
      <div className="pointer-events-none opacity-60">
        {children}
      </div>

      {/* Clickable indicator overlay */}
      <button
        onClick={handleIndicatorClick}
        className="absolute inset-0 cursor-pointer"
        aria-label="הצג הסבר על התכונה החדשה"
      >
        {/* Indicator dot container */}
        <div className="absolute -top-1 -right-1">
          {/* Main dot */}
          <span 
            className={cn(
              "relative block w-2 h-2 rounded-full",
              "bg-gradient-to-r from-primary-400 to-primary-500",
              "animate-pulse shadow-lg shadow-primary-500/30",
              className
            )}
          />
          
          {/* Inner glow */}
          <span 
            className={cn(
              "absolute inset-0 rounded-full",
              "bg-primary-400 opacity-40 blur-[1px]",
              "animate-pulse delay-75"
            )}
          />
          
          {/* Outer ring 1 */}
          <span 
            className={cn(
              "absolute -inset-1 rounded-full",
              "border border-primary-400/30",
              "animate-[ping_2s_ease-in-out_infinite]"
            )}
          />
          
          {/* Outer ring 2 */}
          <span 
            className={cn(
              "absolute -inset-2 rounded-full",
              "border border-primary-400/20",
              "animate-[ping_2.5s_ease-in-out_infinite]",
              "delay-500"
            )}
          />
          
          {/* Sparkle effect */}
          <span 
            className={cn(
              "absolute -inset-0.5 rounded-full",
              "bg-gradient-to-r from-primary-200/40 to-transparent",
              "animate-[pulse_1.5s_ease-in-out_infinite]",
              "rotate-45 transform origin-center"
            )}
          />
        </div>
      </button>
    </div>
  );
} 