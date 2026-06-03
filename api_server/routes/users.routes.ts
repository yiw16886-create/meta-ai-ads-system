import { Router } from "express";
import { UsersController } from "../controllers/users.controller";

const router = Router();

router.post("/", UsersController.createInvitation);
router.put("/:id", UsersController.updateUserRole);
router.get("/", UsersController.listUsersAndInvitations);
router.delete("/:id", UsersController.deleteUserOrInvitation);

export default router;
