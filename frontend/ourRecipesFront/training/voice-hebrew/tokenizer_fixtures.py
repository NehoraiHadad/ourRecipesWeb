"""Create Python fast-tokenizer references without any user data or test scoring."""
import argparse
import json
from pathlib import Path
from challenge import challenge, fingerprint
from corpus import load_data, ROOT, digest
from engine import expand, encode


def fixtures(model, output):
    from transformers import AutoTokenizer
    tokenizer=AutoTokenizer.from_pretrained(model,local_files_only=True)
    recs,rows=load_data();cr,challenge_rows=challenge()
    cases=[]
    for contract in [1,2]:
        for rr,xx,split in [(recs,rows,'train'),(recs,rows,'validation'),(cr,challenge_rows,'challenge')]:
            for q in expand(rr,xx,split,contract):
                cases.append({'id':f"{contract}:{q['example_id']}:{q['task']}:{q['action_id']}",
                    'text':q['context'],'text_pair':q['utterance'],'expected':dict(encode(tokenizer,q,512))})
    stress=['קמח ½ כוס, מים 1.5 ליטר','עגבנייה ועגבניה','לֶעָרְבֵּב קמח ומים','ג׳ינג׳ר, ג\'ינג\'ר וגינגר',
            'שמן זית + olive oil','קוטג\' 5%','שמתי 250ml מים','<foreign> [UNK] [MASK]',
            '״לא הוספתי״\nאבל כן ערבבתי','יש 🍅 בקערה','שיבולת־שועל','אורז\u200f ומים',
            'כך כתוב: "בצק"','קמח\tמים\r\nמלח','גרם ١٢٣ 123','לערבב אחרי 10–15 דקות']
    for i,text in enumerate(stress):
        for paired in [False,True]:
            q={'example_id':f'stress-{i}','context':text,'utterance':'עוד לא ערבבתי' if paired else ''}
            expected=tokenizer(text,q['utterance'] if paired else None,truncation=False)
            cases.append({'id':f'stress:{i}:{paired}','text':text,'text_pair':q['utterance'] if paired else None,'expected':dict(expected)})
    result={'scope':'Original synthetic train/validation/challenge and tokenizer stress fixtures; no held-out test evaluation',
            'challenge':fingerprint(),'cases':cases,'tokenizer_json_sha256':digest((Path(model)/'tokenizer.json').read_bytes())}
    Path(output).write_text(json.dumps(result,ensure_ascii=False)+'\n')
    print(json.dumps({'cases':len(cases),'output':str(output),'tokenizer_sha256':result['tokenizer_json_sha256']}))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('model');p.add_argument('output');a=p.parse_args();fixtures(a.model,a.output)
