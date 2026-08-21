import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken, requireRole("ADMIN"));

router.get("/", userController.list);
router.post("/", userController.create);

export default router;
