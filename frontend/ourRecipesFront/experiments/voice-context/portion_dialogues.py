"""Additional synthetic conversations reserved for the portion reader comparison."""
from cases import case, pending, ask_which

FRESH_RECIPES = {'cookies':['עוגיות',['לערבב הכל','ליצור כדורים','לאפות'],
                            ['200 גרם שוקולד','100 גרם חמאה','1 ביצה']]}
def line(key,recipe,text,terms, *, writes=(), no=()):
    return case(key,recipe,text,terms,writes=writes,no=no)

FRESH = [
    [
        line('cup_not_recipe_half','pancake','מזגתי חצי כוס חלב',['חלב'],writes=[['i2','partial']]),
        line('cup_remainder','pancake','כמה חלב עוד נשאר לשים?',['1[.]5 כוסות|כוס וחצי','חלב']),
        line('another_cup','pancake','הוספתי עוד כוס חלב',['חלב'],writes=[['i2','partial']]),
        line('cup_after_increment','pancake','כמה עוד נשאר לי להוסיף מהחלב?',['0[.]5 כוס|חצי כוס','חלב']),
    ],
    [
        line('grams','cookies','שמתי 50 גרם שוקולד',['שוקולד'],writes=[['i0','partial']]),
        line('grams_change_topic','cookies','כמה חמאה צריך?',['100 גרם חמאה']),
        line('grams_amount','cookies','כמה שוקולד נשאר להוסיף?',['150 גרם שוקולד']),
        line('grams_correction','cookies','תיקון, הוספתי חצי מהשוקולד',['חצי','שוקולד'],writes=[['i0','partial']]),
        line('grams_amount_corrected','cookies','אז כמה נשאר מהשוקולד?',['100 גרם שוקולד']),
    ],
    [
        line('unknown_partial','soup','שמתי רק חלק מהמים',['חלק','מים'],writes=[['i2','partial']]),
        line('unknown_increment','soup','הוספתי עוד רבע מהמים',['כמה|לא תועד'],no=['רשמתי שהוספת']),
        line('still_unknown','soup','כמה מים נשאר להוסיף?',['חלקית','לא תועד|לא ידוע']),
        line('explicit_total','soup','בעצם שמתי רק חצי מהמים',['חצי','מים'],writes=[['i2','partial']]),
        line('known_now','soup','וכמה נשאר להוסיף?',['1[.]5 כוסות|כוס וחצי','מים']),
    ],
    [
        line('fronted_soup','soup','את הבצל הכנסנו לסיר',['בצל'],writes=[['i0','done']]),
        line('did_not_chop','soup','מה עושים עכשיו?',['לקצוץ בצל']),
        line('fronted_mix','soup','את המלח כבר שמתי בקערה, עוד נשאר לי להוסיף עדשים ומים',['עדשים','מים'],writes=[['i3','done']]),
    ],
    [
        line('question_about_putting','pancake','את הקמח כבר הכנסתי לקערה?',[pending]),
        line('flour_unchanged','pancake','האם שמתי קמח?',[pending]),
        line('measure_question','pancake','שמתי חצי כוס חלב?',['האם|לא סומן|לא הוספת']),
        line('measure_unchanged','pancake','האם שמתי חלב?',[pending]),
    ],
    [
        line('partial_before_reset','cookies','שמתי רבע מהחמאה',['רבע','חמאה'],writes=[['i1','partial']]),
        line('negative_repair','cookies','לא שמתי חמאה',['לא הוספת','חמאה'],writes=[['i1','pending']]),
        line('after_reset','cookies','כמה חמאה נשאר להוסיף?',['100 גרם חמאה'],no=['75 גרם']),
        line('measurement_wrong_unit','cookies','הוספתי 2 כפיות חמאה',['כמות|כמה','חמאה'],writes=[]),
    ],
    [
        line('natural_spoken','pancake','שנייה, נראה לי שהקמח כבר אצלי בקערה, שמת לב?',['קמח',pending+'|לא בטוח|האם']),
        line('natural_disambiguation','pancake','רק שלא נתבלבל, הכנסתי את הקמח אבל עוד לא ערבבתי',['קמח'],writes=[['i0','done']]),
        line('natural_followup','pancake','מה עכשיו?',['לערבב']),
    ],
    [
        line('butter_only','cookies','שמתי חמאה',['חמאה'],writes=[['i1','done']]),
        line('backtrack','cookies','בעצם שמתי רק חצי ממנה',['חצי','חמאה'],writes=[['i1','partial']]),
        line('follow_topic','cookies','כמה נשאר ממנה?',['50 גרם חמאה']),
        line('many_topics','cookies','מה נשאר להוסיף?',['שוקולד','ביצה']),
        line('ambiguous_topic','cookies','כמה עוד נשאר לי לשים?',[ask_which],no=['50 גרם חמאה']),
    ],
]
