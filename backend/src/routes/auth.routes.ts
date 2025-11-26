import { Router, Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { validateRequest } from "../middleware/validateRequest";
import { authenticate } from "../middleware/auth";
import { authValidators } from "../utils/validators";
import { prisma } from "../config/database";

const router = Router();

router.post(
  "/register",
  validateRequest(authValidators.register),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      const result = await authService.register(
        email,
        password,
        firstName,
        lastName
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/login",
  validateRequest(authValidators.login),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/me",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      });

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
