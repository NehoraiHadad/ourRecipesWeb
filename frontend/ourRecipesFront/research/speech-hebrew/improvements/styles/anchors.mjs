import {normalize} from '../../metrics.mjs';
export function missing(text,anchors){
  const words=normalize(text).split(' ');
  let next=0; const lost=[];
  for(const anchor of anchors){
    const options=anchor.split('|').map(term=>normalize(term).split(' '));
    let found=false;
    for(let i=next;i<words.length&&!found;i++){
      const match=options.find(option=>option.every((w,j)=>words[i+j]===w));
      if(match){next=i+match.length;found=true;}
    }
    if(!found)lost.push(anchor);
  }
  return lost;
}
