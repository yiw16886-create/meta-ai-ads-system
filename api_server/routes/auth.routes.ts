import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";

const router = Router();

router.post("/login", AuthController.login);
router.post("/verify-token", AuthController.verifyToken);
router.post("/register", AuthController.register);

export default router;
