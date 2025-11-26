import { Router } from "express";
import authRoutes from "./auth.routes";
import uploadRoutes from "./upload.routes";
import jobRoutes from "./job.routes";

const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);
router.use("/jobs", jobRoutes);

export default router;
