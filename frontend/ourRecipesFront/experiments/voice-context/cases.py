"""Frozen synthetic checkpoints. Each history pair is (user, assistant), oldest first."""
RECIPES = {
    'pancake': ['פנקייק', ['לערבב הכל', 'לטגן', 'להגיש עם מייפל'],
                ['1 כוס קמח', '2 ביצים', '2 כוסות חלב', '1 כף שמן']],
    'soup': ['מרק', ['לקצוץ בצל', 'להוסיף עדשים ומים', 'לבשל עד שהעדשים מתרככות'],
             ['1 בצל', '1 כוס עדשים', '3 כוסות מים', '1 כפית מלח']],
    'dough': ['בצק', ['לערבב קמח ושמרים', 'ללוש', 'לאפות במשך 20 דקות'],
              ['2 כוסות קמח לבן', '1 כוס קמח מלא', '1 כפית שמרים']],
}
milk = ('כמה חלב צריך?', 'במתכון המקורי רשום 2 כוסות חלב.')
oil = ('כמה שמן צריך?', 'במתכון המקורי רשום 1 כף שמן.')
both = ('מה חסר?', 'עדיין לא סומנו חלב ושמן.')
old = [('שמתי חלב', 'רשמתי שהוספת חלב.')]
smalltalk = [('איפה אנחנו?', 'אנחנו בשלב הטיגון.'), ('מה עכשיו?', 'לטגן את התערובת.')]
# Longer than the encoder window with the full conversation, while the last four messages fit.
long = old + [('אפשר להזכיר לי שוב מה עושים בשלב הראשון של המתכון הזה?',
               'השלב הראשון הוא לערבב יחד את המצרכים בקערה עד שהתערובת מוכנה לשלב הבא.')] * 24

def case(id, recipe, text, yes, *, no=(), writes=(), state=None, history=(), step=0):
    return dict(id=id, recipe=recipe, text=text, yes=yes, no=no, writes=writes,
                state=state or {}, history=[dict(role=role, content=content)
                for pair in history for role, content in zip(('user','assistant'),pair)], step=step)

ask_which = 'איזה|באיזה|לאיזה|על איזה|לא ברור|למה התכוונ'
partial = 'חלק|חצי'
done = 'כבר סומן|סומן במלוא|כבר הוספת|כל הכמות|אין עוד'
pending = 'לא סומן|לא הוספת|טרם|ממתין'
CASES = [
    case('explicit_amount','pancake','כמה חלב צריך?', ['2 כוסות חלב']),
    case('named_status_done','pancake','האם כבר שמתי חלב?', [done],state={'i2':'done'}),
    case('named_status_partial','pancake','האם שמתי חלב?', [partial],state={'i2':'partial'}),
    case('report_two','pancake','שמתי קמח וביצים',['קמח','ביצים'],writes=[['i0','done'],['i1','done']]),
    case('next_after_mixing','pancake','מה עכשיו?', ['לטגן'],state={'s0a0':'done'}),
    case('stated_duration','dough','כמה זמן לאפות?', ['20 דקות'],step=2),
    case('unstated_duration','pancake','כמה זמן לטגן?', ['לא מצוין|לא מפורט'],step=1),
    case('ambiguous_flour','dough','שמתי קמח',['קמח מלא','קמח לבן',ask_which]),
    case('pronoun_milk','pancake','וכמה ממנו?', ['2 כוסות חלב'],history=[milk]),
    case('pronoun_oil','pancake','וכמה ממנו?', ['1 כף שמן'],history=[milk,oil]),
    case('pronoun_multiple','pancake','וכמה ממנו?', [ask_which],no=['2 כוסות חלב','1 כף שמן'],history=[both]),
    case('pronoun_no_topic','pancake','וכמה ממנו?', [ask_which],no=['2 כוסות חלב']),
    case('corrected_current','pancake','החלב כבר בפנים?', [partial],no=['כבר סומן במלואו'],state={'i2':'partial'},history=old+smalltalk),
    case('old_report_overridden','pancake','החלב כבר בפנים?', [pending],no=['כבר סומן במלואו'],history=long+smalltalk),
    case('old_report_still_true','pancake','החלב כבר בפנים?', [done],no=['לא סומן'],state={'i2':'done'},history=long+smalltalk),
    case('unspecified_partial','pancake','כמה חלב נשאר להוסיף?', [partial,'לא (?:תועד|ידוע|צוין)|חסר פירוט|אין פירוט'],no=['נשארה כוס','נותרה כוס'],state={'i2':'partial'}),
    case('nothing_left','pancake','כמה חלב נשאר להוסיף?', [done],state={'i2':'done'}),
    case('whole_left','pancake','כמה חלב נשאר להוסיף?', ['2 כוסות חלב'],history=old,state={'i2':'pending'}),
    case('combined_report','pancake','שמתי קמח וביצים, מה עוד נשאר להוסיף?', ['חלב','שמן'],writes=[['i0','done'],['i1','done']]),
    case('correct_report','pancake','רגע, בעצם שמתי רק חצי מהחלב', [partial,'חלב'],writes=[['i2','partial']],state={'i2':'done'},history=old),
    case('ambiguous_correction','pancake','בעצם שמתי רק חצי ממנו', [ask_which],history=[both]),
    case('named_unseen_form','soup','תזכירי לי, את העדשים כבר הוספתי לסיר?', [done],state={'i1':'done'}),
    case('new_recipe_reference','soup','ומה הכמות שלהן?', ['1 כוס עדשים'],history=[('העדשים כבר בפנים?', 'עדשים סומנו חלקית.')],state={'i1':'partial'}),
    case('qualified_question','pancake','אם אשים חצי מהחלב, זה יספיק?', ['לא (?:כתוב|מפורט|ברור|צוין)|אין (?:במתכון|מידע)|המתכון מציין'],no=['רשמתי שהוספת']),
    case('long_substitution_control','pancake','אפשר להחליף את החלב במים?', ['אין|לא (?:כתוב|מופיע|מצוין|מפורט)|חסר'],history=long+smalltalk),
    case('old_topic_not_current','pancake','כמה ממנו צריך?', [ask_which],no=['2 כוסות חלב'],history=[milk]+smalltalk),
]
