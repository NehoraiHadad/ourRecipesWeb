"""Frozen authored challenge: unseen recipes/formulations, no training/selection use."""
from corpus import digest


def challenge():
    specs=[
        ('בצק בדיקה', ['קמח','מים'], [('להוסיף קמח','הוספתי קמח'),('להוסיף מים','הוספתי מים'),('לערבב את הבצק','ערבבתי את הבצק'),('ללוש את הבצק','לשתי את הבצק')]),
        ('מרק גזר לבדיקה', ['גזר','מים'], [('לקלף גזר','קילפתי גזר'),('לחתוך גזר','חתכתי גזר'),('להוסיף מים לסיר','הוספתי מים לסיר'),('להרתיח את המרק','הרתחתי את המרק')]),
        ('משקה בדיקה', ['קפה','מים','סוכר'], [('לשים קפה בכוס','שמתי קפה בכוס'),('להוסיף מים לכוס','הוספתי מים לכוס'),('להוסיף סוכר','הוספתי סוכר'),('לערבב את המשקה','ערבבתי את המשקה')]),
        ('סלט פירות לבדיקה', ['תותים','קיווי','מיץ תפוזים'], [('לשטוף תותים','שטפתי תותים'),('לקלף קיווי','קילפתי קיווי'),('לחתוך את הפירות','חתכתי את הפירות'),('להוסיף מיץ תפוזים','הוספתי מיץ תפוזים')]),
    ]
    recs={};rows=[]
    for i,(title,ingredients,pairs) in enumerate(specs):
        key=f'challenge-{i}'
        actions=[{'id':f'a{j}','step':j,'text':text,'report':past} for j,(text,past) in enumerate(pairs)]
        recipe={'id':key,'split':'challenge','title':title,'ingredients':ingredients,'actions':actions};recs[key]=recipe
        def add(name,text,effects=(),intent='report',completed=(),previous=None):
            rows.append({'id':f'{key}-{name}','recipe_id':key,'split':'challenge','scenario':name,
                'family':'frozen-challenge:'+name,'utterance':text,'previous':previous,
                'state':{'currentStep':0,'completed':list(completed),'remaining':[a['id'] for a in actions if a['id'] not in completed]},
                'gold':{'intent':intent,'changes':[{'actionId':actions[j]['id'],'done':v,'evidence':e} for j,v,e in effects]},
                'provenance':'synthetic_authored','human_review':'pending'})
        pa,pb,pc,pd=[a['report'] for a in actions]
        for j,past in enumerate([pa,pb,pc,pd]):
            add(f'position-{j}', 'רציתי לעדכן ש' + past,[(j,True,past)])
        add('partial-step',pb+' אבל עדיין לא '+pc,[(1,True,pb),(2,False,'עדיין לא '+pc)])
        add('reverse-partial', 'לא '+pa+'; '+pb+' כבר כן',[(0,False,'לא '+pa),(1,True,pb)])
        add('correction', 'רגע, טעיתי. לא '+pa,[(0,False,'לא '+pa)],completed=['a0'],previous={'recipe_id':key,'utterance':pa})
        add('future', 'אני רוצה לבצע את הפעולה האחרונה עוד מעט',intent='clarify')
        add('half',pb+', אבל רק חצי מהכמות הדרושה',intent='clarify')
        add('meta-negation','לא אמרתי ש'+pb,intent='clarify')
        add('conditional','אם '+pa+', אפשר כבר להמשיך?',intent='clarify')
        add('uncertain','יכול להיות ש'+pa+', אני לא זוכר',intent='clarify')
        add('ambiguous','סיימתי את זה, אפשר להמשיך?',intent='clarify')
        add('next','איזה דבר צריך לבצע עכשיו?',intent='next')
        add('missed','מה עוד לא דיווחתי שביצעתי בשלבים הקודמים?',intent='missed')
        add('advice','אפשר להוסיף קינמון למרות שאין במתכון?',intent='advice')
        add('old-recipe', 'עברתי למתכון אחר. מה עושים עכשיו?',intent='next',previous={'recipe_id':'unrelated-old','utterance':pa})
    return recs,rows


def fingerprint():
    recs,rows=challenge()
    return {'sha256':digest({'recipes':recs,'rows':rows}),'examples':len(rows),'recipes':len(recs),
        'role':'Diagnostic challenge frozen before new runs; never training or model/threshold selection',
        'human_reviewed':False}


if __name__=='__main__':
    import json
    print(json.dumps(fingerprint(),indent=2))
