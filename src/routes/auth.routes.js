import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", authController.login);
router.get("/me", verifyToken, authController.me);

export default router;
