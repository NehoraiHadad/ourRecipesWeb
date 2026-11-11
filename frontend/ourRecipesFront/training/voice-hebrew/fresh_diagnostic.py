"""Sixteen authored cases frozen before the targeted run; not human recordings."""
from corpus import digest


def build():
    recipes={};rows=[]
    specs=[('שומר וקולרבי',['שומר','קולרבי'],['לשטוף שומר','לפרוס שומר','לקלף קולרבי','לחתוך קולרבי']),
           ('רוטב יוגורט לבדיקה',['מלפפון','יוגורט'],['לגרר מלפפון','לסנן מלפפון','להוסיף יוגורט','לערבב את הרוטב'])]
    for i,(title,ingredients,actions) in enumerate(specs):
        rid=f'fresh-targeted-{i}';recipes[rid]={'id':rid,'split':'fresh','title':title,'ingredients':ingredients,
            'actions':[{'id':f'a{j}','step':j,'text':text} for j,text in enumerate(actions)]}
    def add(r,name,text,effects=(),intent='report',completed=(),previous=None,current=0):
        rid=f'fresh-targeted-{r}'
        rows.append({'id':rid+'-'+name,'recipe_id':rid,'split':'fresh','scenario':name,'family':'fresh:'+name,
            'utterance':text,'previous':previous,'state':{'currentStep':current,'completed':list(completed),'remaining':[f'a{i}' for i in range(4) if f'a{i}' not in completed]},
            'gold':{'intent':intent,'changes':[{'actionId':f'a{j}','done':v,'evidence':e} for j,v,e in effects]},
            'provenance':'synthetic_authored','human_review':'pending'})
    add(0,'partial-step','שטפתי את השומר, עוד לא פרסתי אותו',[(0,True,'שטפתי את השומר'),(1,False,'עוד לא פרסתי אותו')])
    add(0,'passive','הקולרבי מקולף, אבל עדיין שלם',[(2,True,'הקולרבי מקולף'),(3,False,'עדיין שלם')])
    add(0,'single','פרסתי את השומר',[(1,True,'פרסתי את השומר')])
    add(0,'next','מה צריך לעשות עכשיו?',intent='next')
    add(0,'ambiguous','סיימתי את הירק',intent='clarify')
    add(0,'belief-correction','חשבתי שקילפתי קולרבי, אבל טעיתי',[(2,False,'חשבתי שקילפתי קולרבי, אבל טעיתי')])
    add(0,'meta-negation','לא אמרתי שפרסתי שומר',intent='clarify')
    add(0,'partial-action','שטפתי רק חלק מהשומר',intent='clarify')
    add(1,'partial-step','גיררתי את המלפפון, אבל הוא עוד לא מסונן',[(0,True,'גיררתי את המלפפון'),(1,False,'עוד לא מסונן')])
    add(1,'object-report','היוגורט בפנים, עוד לא ערבבתי את הרוטב',[(2,True,'היוגורט בפנים'),(3,False,'עוד לא ערבבתי את הרוטב')])
    add(1,'known-question','להוסיף כבר יוגורט?',intent='clarify')
    add(1,'correction','אני מתקן: לא הוספתי יוגורט',[(2,False,'לא הוספתי יוגורט')],completed=['a2'],previous={'recipe_id':'fresh-targeted-1','utterance':'הוספתי יוגורט'})
    add(1,'partial-action','ערבבתי רק קצת, הרוטב עוד לא מוכן',intent='clarify')
    add(1,'last-action','ערבבתי את הרוטב',[(3,True,'ערבבתי את הרוטב')])
    add(1,'recipe-switch','עברתי למתכון הזה, מה עכשיו?',intent='next',previous={'recipe_id':'another-recipe','utterance':'טיגנתי בצל'})
    add(1,'missed','על איזה שלב דילגתי?',intent='missed',current=3)
    return recipes,rows


def fingerprint():
    recs,rows=build()
    return {'sha256':digest({'recipes':recs,'rows':rows}),'examples':len(rows),'human_reviewed':False,
        'role':'Post-selection synthetic diagnostic; never checkpoint, variant or threshold selection; not natural-conversation acceptance'}
