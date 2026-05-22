import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  try {
    const result = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: "Hello",
    });
    console.log(result.text);
  } catch(e) {
    console.error(e.message);
  }
}
run();
