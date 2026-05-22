import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({
    apiKey: "AIzaSyCmGmBif-b_vQ5wYADK_hOoxez4nBLDlYg"
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
