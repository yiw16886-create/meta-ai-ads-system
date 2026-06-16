import { Router } from "express";
import { generateDiagnosticIssues } from "../services/rule-diagnostic-engine.service.js";

const router = Router();

// STEP 13-A-R2: POST /api/diagnostics/issues
// Generates structured diagnostic issues from the offline rule engine only.
router.post("/issues", async (req, res) => {
  try {
    const result = await generateDiagnosticIssues(req.body ?? {});
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to generate diagnostics/issues",
      details: error?.message ?? "Unknown error",
    });
  }
});

export default router;
