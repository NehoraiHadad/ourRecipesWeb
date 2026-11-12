"""Reject explicit recipe/evidence contradictions; no new/rebound action IDs.
Partial lexical coverage, not a Hebrew parser or proof of factuality. Runtime
fields only: recipe ingredients/action.text and quoted utterance evidence.
Unknown words/anaphora defer to existing learned extraction, not blanket veto.
"""
import re,unicodedata
from copy import deepcopy
FAMILIES={
 'cut':({'לחתוך','לקצוץ'},{'חתכתי','חתכנו','חתכת','חתכו','חותך','חותכת','קצצתי','קצצנו','קצצו','קוצץ','קוצצת','חתוך','חתוכה','קצוץ','קצוצה'}),
 'wash':({'לשטוף','לרחוץ'},{'שטפתי','שטפנו','שטפו','שוטף','שוטפת','רחצתי','רחצנו','רוחץ','רוחצת','שטוף','שטופה'}),
 'scatter':({'לפזר','לזרות'},{'פיזרתי','פזרתי','פיזרנו','פזרנו','פיזרו','פזרו','מפזר','מפזרת','זריתי','זרינו','פוזר','פוזרה'}),
 'add':({'להוסיף'},{'הוספתי','הוספנו','הוסיפו','מוסיף','מוסיפה','נוסף','נוספה'}),
 'mix':({'לערבב'},{'ערבבתי','ערבבנו','ערבבו','מערבב','מערבבת','מעורבב','מעורבבת'})}
PREFIXES=('','ה','ו','ב','ל','מ','כ','ש','וה','בה','לה','מה','שה','וכש','כש')


def normalize(text):
 text=''.join(c for c in text if unicodedata.category(c)!='Mn').lower()
 return ' '.join(re.sub(r'[^\w\s]',' ',text).split())


def token_matches(token,word):return any(token==prefix+word for prefix in PREFIXES)


def mentions(text,ingredients):
 tokens=list(re.finditer(r'\w+',text));found=[]
 for ingredient in ingredients:
  words=normalize(ingredient).split()
  if not words:continue
  for i in range(len(tokens)-len(words)+1):
   if token_matches(tokens[i].group(),words[0]) and all(tokens[i+j].group()==w for j,w in enumerate(words[1:],1)):
    found.append((tokens[i].start(),tokens[i+len(words)-1].end(),normalize(ingredient)))
 return [m for m in found if not any(n[0]<=m[0] and n[1]>=m[1] and n[1]-n[0]>m[1]-m[0] for n in found)]


def families(text,canonical=False):
 words=normalize(text).split();out=set()
 for family,(infinitives,reports) in FAMILIES.items():
  vocab=infinitives if canonical else reports
  if any(token_matches(word,form) for word in words for form in vocab):out.add(family)
 return out


def validate(recipe,utterance,proposal):
 original=deepcopy(proposal);out=deepcopy(proposal);out['changes']=[];rejected=[];actions={a['id']:a for a in recipe['actions']};u=normalize(utterance);ingredients=recipe.get('ingredients',[])
 if not all(isinstance(i,str) for i in ingredients):ingredients=[]
 all_mentions=mentions(u,ingredients)
 for change in original.get('changes',[]):
  reason=None;action=actions.get(change.get('actionId'));evidence=change.get('evidence');quoted=normalize(evidence) if isinstance(evidence,str) else ''
  if action is None:reason='action_not_in_recipe'
  elif not quoted or quoted not in u:reason='nonlocal_evidence'
  else:
   spans=[(m.start(),m.end()) for m in re.finditer(re.escape(quoted),u)];actual={name for start,end,name in all_mentions if any(start<b and end>a for a,b in spans)};target={name for _,_,name in mentions(normalize(action['text']),ingredients)}
   if actual and target and not actual&target:reason='contradictory_ingredient'
   canonical=families(action['text'],True);spoken=families(evidence)
   if reason is None and canonical and spoken and not canonical&spoken:reason='contradictory_verb'
  if reason:rejected.append({'change':change,'reason':reason})
  else:out['changes'].append(change)
 if original.get('changes') and not out['changes']:out['intent']='clarify'
 return {'proposal':out,'rejected':rejected,'requires_clarification':bool(rejected and not out['changes'])}
