import { Request, Response } from "express";
import { AiDiagnosticService } from "../services/ai/ai.service.js";

export class AiController {
  /**
   * Generates a fully structured diagnostic report via external AI Service
   */
  static generateDiagnosis = async (req: Request, res: Response) => {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "accountId is required" });
    }

    try {
      // Defer to the new AI Service Layer
      const result = await AiDiagnosticService.runDiagnosis(accountId);

      // Optionally save result to DB here asynchronously
      // await AiDiagnosisRepository.save(...)

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error("[AiController] Error:", error);
      res.status(500).json({ error: "Failed to generate AI diagnosis" });
    }
  };
}
