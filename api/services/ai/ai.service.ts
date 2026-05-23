import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AiContextBuilder } from "./context.builder.js";
import { RulesEngine } from "./rules.engine.js";
import { AiPromptBuilder } from "./prompt.builder.js";
import { prisma } from "../../db/prisma.js"; // Only for AI key if stored there, but we can stick to process.env

export class AiDiagnosticService {
  /**
   * Run a full AI Diagnosis combining rule-based checks and LLM inference.
   * Leverages Gemini Structured Outputs via @google/genai.
   */
  static async runDiagnosis(accountId: string) {
    // 1. Build Context
    const context = await AiContextBuilder.buildDiagnosticContext(accountId);

    // 2. We need the raw data for rule engine (requires fetching again or extracting from context, let's proxy)
    // For now we'll fetch explicitly to pass to rules
    const today = new Date();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const insights =
      await import("../../repositories/insight.repository.js").then((m) =>
        m.InsightRepository.findByAccountAndDateRange(
          accountId,
          fourteenDaysAgo.toISOString().split("T")[0],
          today.toISOString().split("T")[0],
        ),
      );

    // Sort ascending for rule engine (oldest to newest)
    const sortedInsights = insights.sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    // 3. Rule Engine Pre-Check
    const { score: baseScore, anomalies } =
      RulesEngine.analyzeTrends(sortedInsights);

    // 4. Construct Prompt
    const prompt = AiPromptBuilder.buildDiagnosticPrompt(
      context.accountName,
      context.historyTable,
      anomalies,
    );

    // 5. Setup LLM structured schema
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description:
            "A cohesive paragraph summarizing the 14-day trend and overall account health.",
        },
        fatigueStatus: {
          type: Type.OBJECT,
          properties: {
            creativeFatigueDetected: { type: Type.BOOLEAN },
            audienceFatigueDetected: { type: Type.BOOLEAN },
            reasoning: { type: Type.STRING },
          },
          required: [
            "creativeFatigueDetected",
            "audienceFatigueDetected",
            "reasoning",
          ],
        },
        riskLevel: {
          type: Type.STRING,
          description: "Must be SAFE, WARNING, or CRITICAL.",
          enum: ["SAFE", "WARNING", "CRITICAL"],
        },
        aiAdjustedScore: {
          type: Type.INTEGER,
          description:
            "Adjust the rule-engine base score based on hidden trends. Return an integer between 0-100.",
        },
        actionableSuggestions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "Short command like 'Refresh Creatives'",
              },
              description: {
                type: Type.STRING,
                description: "Detailed manual action the user should take.",
              },
              priority: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
            },
            required: ["title", "description", "priority"],
          },
        },
      },
      required: [
        "summary",
        "fatigueStatus",
        "riskLevel",
        "aiAdjustedScore",
        "actionableSuggestions",
      ],
    };

    // 6. Execute LLM Call
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // We use gemini-2.5-flash as default for fast structured inference unless heavy reasoning needed
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, // Low temp for deterministic analytical outputs
      },
    });

    const aiResultStr = response.text || "{}";

    let parsedResult;
    try {
      parsedResult = JSON.parse(aiResultStr);
    } catch (e) {
      console.error("AI JSON Parse Error", e);
      parsedResult = { error: "Failed to parse AI output." };
    }

    return {
      accountId,
      accountName: context.accountName,
      ruleBasedScore: baseScore,
      hardAnomalies: anomalies,
      aiDiagnosis: parsedResult,
      analyzedAt: new Date().toISOString(),
    };
  }
}
