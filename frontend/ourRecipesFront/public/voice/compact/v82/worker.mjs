import {loadEngine} from './engine.mjs';
let engine;
self.onmessage = async ({data}) => {
  try {
    engine ??= loadEngine();
    const predict = await engine;
    self.postMessage(data.input ? {id:data.id,result:await predict(data.id,data.input)} : {ready:true});
  } catch (error) {
    engine = undefined;
    self.postMessage({id:data.id,error:String(error)});
  }
};
