"""Additional prospective dialogues, after freezing the focused reader. Each arm carries its own state."""
from cases import ask_which, case, done, partial, pending
DIALOGUES = [
    [
        case('milk_add','pancake','שמתי חלב',['חלב'],writes=[['i2','done']]),
        case('milk_revise','pancake','רגע, בעצם שמתי רק חצי מהחלב',[partial,'חלב'],writes=[['i2','partial']]),
        case('milk_state','pancake','האם כבר שמתי חלב?',[partial],no=['כבר סומן.']),
        case('milk_remaining','pancake','כמה חלב נשאר להוסיף?',[partial,'לא (?:תועד|ידוע|צוין)|אין פירוט']),
    ],
    [
        case('soup_intro','soup','כמה מים צריך?',['3 כוסות מים']),
        case('soup_refer','soup','וכמה מהם?',['3 כוסות מים']),
        case('soup_change','soup','שמתי מלח',['מלח'],writes=[['i3','done']]),
        case('soup_refer_new','soup','כמה ממנו צריך?',['1 כפית מלח'],no=['3 כוסות מים']),
        case('soup_informal','soup','רגע, נראה לי שכבר המלחנו, נכון?',[done,'מלח']),
    ],
    [
        case('two_flours','dough','שמתי קמח',['קמח מלא','קמח לבן',ask_which]),
        case('flour_ambiguous','dough','וכמה ממנו?',[ask_which],no=['2 כוסות קמח לבן']),
        case('specify_flour','dough','כמה קמח מלא צריך?',['1 כוס קמח מלא']),
        case('negative_flour','dough','עדיין לא שמתי קמח מלא',['קמח מלא'],writes=[['i1','pending']]),
        case('excluded_flour','dough','הקמח הלבן כבר בפנים?',[pending,'קמח לבן']),
    ],
    [
        case('report_eggs','pancake','שמתי ביצים',['ביצים'],writes=[['i1','done']]),
        case('hypothetical_oil','pancake','אם אגיד ששמתי שמן זה אומר שכבר ערבבתי?',['לא|האם|לאיזה|לאיזו']),
        case('check_oil','pancake','האם שמתי שמן?',[pending]),
        case('longer_report','pancake','את הקמח כבר הכנסתי לקערה, נשאר לי להוסיף חלב ושמן',['חלב','שמן'],writes=[['i0','done']]),
    ],
]
