"""Pre-test frozen alias/implicit-report diagnostic, never model selection."""
from combined_data import row
from corpus import validate,digest


def build():
    recs={};rows=[]
    specs=[('קמח ומים',['קמח','מים','שמן','בלילה'],[
        ('להוסיף קמח','הוספתי קמח'),('להוסיף מים','הוספתי מים'),('לערבב את הבלילה','ערבבתי את הבלילה'),('להוסיף שמן','הוספתי שמן')],
        [('put','שמתי קמח',[(0,True,'שמתי קמח')],'report'),
         ('put-question','שמתי קמח, מה עכשיו?',[(0,True,'שמתי קמח')],'report'),
         ('partial-step','שמתי קמח וגם מים, אבל עוד לא ערבבתי',[(0,True,'שמתי קמח'),(1,True,'מים'),(2,False,'עוד לא ערבבתי')],'report'),
         ('correction','תיקון: לא שמתי קמח',[(0,False,'לא שמתי קמח')],'report'),
         ('uncertain','אני לא זוכר אם שמתי קמח',[],'clarify'),
         ('partial-quantity','שמתי רק חצי מכמות הקמח',[],'clarify'),
         ('future','עוד מעט אשים קמח',[],'clarify'),
         ('meta','לא אמרתי ששמתי קמח',[],'clarify')]),
      ('דבש וסויה',['דבש','רוטב סויה','שמן','רוטב'],[
        ('להוסיף דבש','הוספתי דבש'),('להוסיף רוטב סויה','הוספתי רוטב סויה'),('לערבב את הרוטב','ערבבתי את הרוטב'),('להוסיף שמן','הוספתי שמן')],
        [('insert','הכנסתי דבש',[(0,True,'הכנסתי דבש')],'report'),
         ('inside','הדבש כבר ברוטב',[(0,True,'הדבש כבר ברוטב')],'report'),
         ('negative','את רוטב הסויה עוד לא שמתי',[(1,False,'את רוטב הסויה עוד לא שמתי')],'report'),
         ('two-actions','שמתי דבש, והרוטב כבר מעורבב',[(0,True,'שמתי דבש'),(2,True,'הרוטב כבר מעורבב')],'report'),
         ('correction','בעצם טעיתי: לא הכנסתי דבש',[(0,False,'לא הכנסתי דבש')],'report'),
         ('question','לשים כבר את הדבש?',[],'clarify'),
         ('partial','ערבבתי רק קצת, עוד לא סיימתי',[],'clarify'),
         ('unknown','שמתי את הדבר ההוא',[],'clarify')])]
    for i,(title,ingredients,actions,cases) in enumerate(specs):
        rid=f'combined-probe-{i}';acts=[{'id':f'a{j}','step':j//2,'text':a,'report':b} for j,(a,b) in enumerate(actions)]
        recipe={'id':rid,'split':'probe','title':title,'ingredients':ingredients,'actions':acts};recs[rid]=recipe
        for name,text,effects,intent in cases:
            # For the shared-verb ellipsis, include the complete local clause.
            effects=[(j,value,'שמתי קמח וגם מים' if quote=='מים' else quote) for j,value,quote in effects]
            rows.append(row(recipe,name,text,[(acts[j],v,e) for j,v,e in effects],intent))
    validate(list(recs.values()),rows);return recs,rows


def fingerprint():
    recs,rows=build();return {'sha256':digest({'recipes':recs,'rows':rows}),'examples':len(rows),
        'role':'Frozen before any new primary test scoring; selected-checkpoint-only synthetic diagnostic, never training, threshold/checkpoint/model selection or natural-conversation acceptance',
        'human_reviewed':False}
