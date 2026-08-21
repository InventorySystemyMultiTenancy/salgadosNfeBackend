import { Router } from "express";
import authRoutes from "./auth.routes.js";
import productRoutes from "./product.routes.js";
import orderRoutes from "./order.routes.js";
import clientRoutes from "./client.routes.js";
import userRoutes from "./user.routes.js";
import fiscalRoutes from "./fiscal.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/clients", clientRoutes);
router.use("/users", userRoutes);
router.use("/fiscal", fiscalRoutes);

export default router;
