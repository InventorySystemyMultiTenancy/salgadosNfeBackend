import { Router } from "express";
import * as reportController from "../controllers/report.controller.js";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyToken);

router.get("/sales", requireRole("ADMIN"), reportController.sales);

export default router;
