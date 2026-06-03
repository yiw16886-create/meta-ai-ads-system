import { Router } from "express";
import { MappingsController } from "../controllers/mappings.controller";

const router = Router();

router.get("/", MappingsController.listMappings);
router.post("/batch", MappingsController.batchUpdate);

export default router;
