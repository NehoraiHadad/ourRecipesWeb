"use client";

import { useState } from "react";
import GuestLogin from "../../../components/GuestLogin";
import TelegramLoginWidget from "../../../components/TelegramLoginWidget";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Typography } from "@/components/ui/Typography";
import  Modal  from "@/components/Modal";

const Page = () => {
  const [showTerms, setShowTerms] = useState(false);

  const termsContent = [
    {
      title: "שמחה ואושר במטבח",
      content: "אנו מאמינים שהמטבח הוא מקום של שמחה, יצירה ואהבה. כל מתכון הוא הזדמנות להביא אושר לשולחן המשפחתי ולחלוק רגעים מתוקים עם אהובינו. הבישול הוא לא רק על האוכל, אלא על החוויה המשותפת והזכרונות שנוצרים סביב השולחן.",
      icon: "💝"
    },
    {
      title: "בריאות ואיזון בחיים",
      content: "מזון הוא מקור החיים והאנרגיה שלנו. אנו מעודדים תזונה מאוזנת ובריאה, תוך שמירה על הנאה וטעם. זכרו שארוחה טובה היא כזו שמזינה גם את הגוף וגם את הנשמה. השתדלו לבחור חומרי גלם איכותיים ולהקפיד על מידתיות.",
      icon: "🌱"
    },
    {
      title: "קהילה וחיבורים",
      content: "המתכונים שלנו הם הגשר שמחבר בין אנשים, תרבויות ומסורות. שיתוף מתכון הוא מתנה של אהבה לקהילה. עודדו אחרים, תנו טיפים מניסיונכם, והיו חלק מקהילה תומכת ומעשירה. יחד אנחנו יוצרים מרחב של למידה והתפתחות.",
      icon: "🤝"
    },
    {
      title: "מסורת וחדשנות",
      content: "אנו מוקירים את המתכונים המשפחתיים שעוברים מדור לדור ובו זמנית מעודדים יצירתיות וחדשנות. כל מתכון הוא סיפור, וכל שינוי קטן יכול להפוך אותו לייחודי. שמרו על המקור אך אל תפחדו להוסיף את הטוויסט האישי שלכם.",
      icon: "👨‍👩‍👧‍👦"
    },
    {
      title: "כבוד והערכה",
      content: "נהגו בכבוד בכל מתכון ובכל יוצר. הכירו תודה למי שחלק את הידע שלו, ושמרו על זכויות היוצרים. זכרו שמאחורי כל מתכון עומד אדם שהשקיע מזמנו ומאהבתו כדי לשתף אותו עם אחרים.",
      icon: "🙏"
    },
    {
      title: "למידה וצמיחה",
      content: "המטבח הוא מקום נפלא ללמידה והתפתחות אישית. כל טעות היא הזדמנות לשיפור, וכל הצלחה היא סיבה לחגיגה. אל תפחדו להתנסות, לשאול שאלות, ולחלוק את הניסיון שלכם עם אחרים.",
      icon: "🌟"
    }
  ];

  return (
    <>
      <div className="w-full space-y-6">
        <div className="text-center space-y-2 mb-8">
          <Typography 
            variant="h1" 
            className="font-savyon text-4xl text-primary-600"
          >
            המתכונים שלנו
          </Typography>
          <Typography 
            variant="body" 
            className="text-secondary-600"
          >
            המקום לשמור ולשתף את המתכונים המשפחתיים
          </Typography>
        </div>

        <Card className="border-0 shadow-warm">
          <CardHeader className="space-y-2 pb-4">
            <Typography 
              variant="h2" 
              className="text-xl font-medium text-center"
            >
              ברוכים הבאים
            </Typography>
            <Typography 
              variant="body" 
              className="text-center text-secondary-600 text-sm"
            >
              התחברו באמצעות טלגרם או המשיכו כאורח
            </Typography>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-secondary-100">
                <TelegramLoginWidget />
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-secondary-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-secondary-500 text-[0.65rem]">
                    או המשיכו כאורח
                  </span>
                </div>
              </div>

              <GuestLogin />
            </div>
          </CardContent>
        </Card>

        <Typography 
          variant="h4" 
          className="text-center text-secondary-500 text-xs mt-6"
        >
          על ידי התחברות, אתם מסכימים{" "}
          <button 
            onClick={() => setShowTerms(true)}
            className="text-primary-600 hover:text-primary-700 transition-colors underline"
          >
            לתנאי השימוש
          </button>
        </Typography>
      </div>

      <Modal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        title="תנאי שימוש והנחיות לחיים טובים יותר"
        size="lg"
      >
        <div className="space-y-8 p-6">
          <Typography variant="body" className="text-center text-lg text-primary-700 font-medium mb-8">
            ברוכים הבאים למשפחת המתכונים שלנו
          </Typography>
          
          {termsContent.map((term, index) => (
            <div key={index} className="space-y-3 bg-secondary-50/50 p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{term.icon}</span>
                <Typography variant="h3" className="text-lg font-medium text-primary-700">
                  {term.title}
                </Typography>
              </div>
              <Typography variant="body" className="text-secondary-600 leading-relaxed">
                {term.content}
              </Typography>
            </div>
          ))}

          <div className="mt-8 pt-6 border-t border-secondary-200">
            <Typography variant="body" className="text-center text-primary-600 font-medium">
              "טעם טוב מתחיל באנשים טובים" 
            </Typography>
            <Typography variant="h4" className="text-center block mt-2 text-secondary-500">
              צוות המתכונים שלנו
            </Typography>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Page;
