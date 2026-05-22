import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({});
  
  try {
    const list = await ai.models.listModels({});
    let hasFlash = false;
    for await (const m of list) {
        if (m.name.includes('flash')) {
            console.log(m.name);
            hasFlash = true;
        }
    }
  } catch(e) {
    console.error(e.message);
  }
}
run();
