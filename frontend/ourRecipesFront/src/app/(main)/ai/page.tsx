import type { Metadata } from 'next';
import { Container } from '@/components/ui/Container';
import { Typography } from '@/components/ui/Typography';
import { CopyBlock } from '@/components/ai-access/CopyBlock';

export const metadata: Metadata = {
  title: 'חיבור סוכני AI | Our Recipes',
  description: 'איך לחבר את Claude, ChatGPT וסוכני AI אחרים לספר המתכונים המשפחתי'
};

const MCP_URL = 'https://recipes.nehoraihadad.com/api/mcp';
const KEY_PLACEHOLDER = '<המפתח>';

const CLAUDE_CODE_CMD = `claude mcp add --transport http our-recipes ${MCP_URL} --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`;

const JSON_CONFIG = `{
  "mcpServers": {
    "our-recipes": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer ${KEY_PLACEHOLDER}" }
    }
  }
}`;

const MCP_REMOTE_CMD = `npx mcp-remote ${MCP_URL} --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`;

/**
 * Public instructions page ("/ai") — the link the family gets, together with
 * the shared key (sent privately, never shown here). No auth guard on purpose:
 * it contains no secrets and no recipe data.
 */
export default function AiAccessPage() {
  return (
    // The root body is overflow-hidden; pages own their scroll area
    // (52px = header height, same as the menus page).
    <div className="h-[calc(100dvh-52px)] overflow-y-auto">
      <Container className="py-8 max-w-3xl">
        <Typography variant="h1" className="text-2xl mb-2">
          חיבור סוכני AI לספר המתכונים
        </Typography>
        <Typography variant="body" className="text-secondary-700 mb-6">
          אפשר לחבר את Claude, ChatGPT או כל סוכן AI אחר ישירות למאגר המתכונים המשפחתי, ולבקש ממנו
          דברים כמו &quot;תרכיב לי תפריט לשבת עם עיקרית בשרית וקינוח פרווה&quot; או &quot;מה אפשר להכין
          בפחות מחצי שעה?&quot;. הגישה היא לקריאה בלבד — אי אפשר לשנות או למחוק מתכונים דרכה.
        </Typography>

        <section className="mb-8">
          <Typography variant="h2" className="text-xl mb-2">מה צריך?</Typography>
          <ul className="list-disc pr-5 space-y-1 text-secondary-800">
            <li>
              כתובת השרת: <code dir="ltr" className="bg-secondary-100 rounded px-1 break-all">{MCP_URL}</code>
            </li>
            <li>מפתח גישה — נשלח אליכם בהודעה נפרדת. בכל מקום שכתוב {KEY_PLACEHOLDER} מדביקים אותו.</li>
          </ul>
        </section>

        <section className="mb-8">
          <Typography variant="h2" className="text-xl mb-2">Claude Code (טרמינל)</Typography>
          <Typography variant="body" className="text-secondary-700">
            מריצים פעם אחת את הפקודה, ומאותו רגע לקלוד יש כלים לחיפוש מתכונים:
          </Typography>
          <CopyBlock text={CLAUDE_CODE_CMD} />
        </section>

        <section className="mb-8">
          <Typography variant="h2" className="text-xl mb-2">
            אפליקציות עם קובץ הגדרות MCP (Claude Desktop, Cursor ועוד)
          </Typography>
          <Typography variant="body" className="text-secondary-700">
            מוסיפים את הקטע הבא לקובץ ההגדרות של האפליקציה (למשל{' '}
            <code dir="ltr" className="bg-secondary-100 rounded px-1">claude_desktop_config.json</code>{' '}
            או <code dir="ltr" className="bg-secondary-100 rounded px-1">.cursor/mcp.json</code>):
          </Typography>
          <CopyBlock text={JSON_CONFIG} />
        </section>

        <section className="mb-8">
          <Typography variant="h2" className="text-xl mb-2">אפליקציה שלא תומכת בכותרת Authorization?</Typography>
          <Typography variant="body" className="text-secondary-700">
            יש כלי גישור רשמי בשם mcp-remote. מגדירים את השרת כפקודת הרצה מקומית:
          </Typography>
          <CopyBlock text={MCP_REMOTE_CMD} />
        </section>

        <section className="mb-8">
          <Typography variant="h2" className="text-xl mb-2">מה הסוכן יכול לעשות?</Typography>
          <ul className="list-disc pr-5 space-y-1 text-secondary-800">
            <li>
              <b>search_recipes</b> — חיפוש לפי טקסט חופשי, קטגוריות, רמת קושי וזמן הכנה כולל.
            </li>
            <li>
              <b>get_recipe_details</b> — רשימת מצרכים והוראות הכנה למתכונים שנמצאו.
            </li>
            <li>
              <b>list_categories</b> — כל הקטגוריות במאגר עם כמות המתכונים בכל אחת.
            </li>
          </ul>
          <Typography variant="body" className="text-secondary-700 mt-3">
            דוגמאות לבקשות: &quot;תמצא לי מתכוני קינוחים קלים&quot;, &quot;בנה רשימת קניות לתפריט של
            ארוחת חג ל-10 סועדים&quot;, &quot;אילו מתכונים צמחוניים יש שלוקחים פחות מ-45 דקות?&quot;.
          </Typography>
        </section>

        <section className="mb-4 text-sm text-secondary-500">
          המפתח משותף לכל המשפחה — אין צורך בהרשמה. אם המפתח לא עובד או שמשהו לא ברור, דברו עם נהוראי.
        </section>
      </Container>
    </div>
  );
}
