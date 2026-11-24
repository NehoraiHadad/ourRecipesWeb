"""Written after freezing the second portion reader; ordinary typed/ASR-like text."""
from cases import case

HOLDOUT = [
    [
        case('large_increment_start','soup','מזגתי רבע מהמים',['רבע','מים'],writes=[['i2','partial']]),
        case('large_increment_end','soup','מזגתי עוד שלושה רבעים מהמים',['כל הכמות','מים'],writes=[['i2','done']]),
        case('no_water_left','soup','כמה מים נשאר להוסיף',['כל הכמות|אין עוד']),
        case('still_chop','soup','מה עכשיו',['לקצוץ בצל']),
    ],
    [
        case('add_25','cookies','הוספתי 25 גרם חמאה',['חמאה'],writes=[['i1','partial']]),
        case('duplicate_or_add','cookies','הוספתי 25 גרם חמאה',['תוספת|בסך|כוללת']),
        case('no_double_count','cookies','כמה נשאר מהחמאה',['75 גרם חמאה']),
        case('total_explicit','cookies','שמתי בסך הכול 40 גרם חמאה',['חמאה'],writes=[['i1','partial']]),
        case('total_correct','cookies','כמה חמאה נשאר לשים',['60 גרם חמאה']),
    ],
    [
        case('named_flour_full','dough','את הקמח המלא הכנסתי לקערה',['קמח מלא'],writes=[['i1','done']]),
        case('other_flour','dough','הקמח הלבן כבר בפנים',['קמח לבן','עדיין לא סומן|טרם']),
        case('bowl_not_mixed','dough','מה צריך לעשות עכשיו',['לערבב קמח ושמרים']),
    ],
    [
        case('two_topics_left','cookies','מה נשאר להוסיף',['שוקולד','חמאה','ביצה']),
        case('ambiguous_last_item','cookies','בעצם שמתי רבע ממנה',['איזה|לאיזה|מה הכוונה']),
        case('unmodified_butter','cookies','האם שמתי חמאה',['חמאה','לא סומן']),
    ],
    [
        case('begin_known','pancake','שמתי רבע מהחלב',['חלב','רבע'],writes=[['i2','partial']]),
        case('reset_knowledge','pancake','שמתי רק חלק מהחלב',['חלב','חלק'],writes=[['i2','partial']]),
        case('no_invented_fraction','pancake','כמה עוד נשאר מהחלב',['חלקית','לא תועד|לא ידוע'],no=['1.5','חצי כוס']),
        case('reestablish','pancake','תיקון, שמתי רק חצי כוס חלב',['חלב'],writes=[['i2','partial']]),
        case('reestablished_amount','pancake','כמה חלב נשאר להוסיף',['1[.]5 כוסות חלב|כוס וחצי חלב']),
    ],
    [
        case('colloquial_add','cookies','טוב אז זרקתי לקערה בערך חצי מכמות השוקולד',['שוקולד','בערך|כמות|כמה|חצי']),
    ],
    [
        case('plan_only','soup','עוד מעט אוסיף מים ומלח ואז אבשל',['מים|פעולה|כשת|כבר|שלב|הבנ']),
        case('read_after_plan','soup','האם שמתי מים',['מים','לא סומן']),
    ],
]
