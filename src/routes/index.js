import { Router } from "express";
import authRoutes from "./auth.routes.js";
import productRoutes from "./product.routes.js";
import orderRoutes from "./order.routes.js";
import clientRoutes from "./client.routes.js";
import userRoutes from "./user.routes.js";
import fiscalRoutes from "./fiscal.routes.js";
import paymentRoutes from "./payment.routes.js";
import cashRoutes from "./cash.routes.js";
import reportRoutes from "./report.routes.js";
import preorderRoutes from "./preorder.routes.js";
import stockRoutes from "./stock.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/orders", orderRoutes);
router.use("/clients", clientRoutes);
router.use("/users", userRoutes);
router.use("/fiscal", fiscalRoutes);
router.use("/payments", paymentRoutes);
router.use("/cash", cashRoutes);
router.use("/reports", reportRoutes);
router.use("/preorders", preorderRoutes);
router.use("/stock", stockRoutes);

export default router;
