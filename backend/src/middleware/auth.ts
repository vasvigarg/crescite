import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service";
import { ApiError } from "../utils/ApiError";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No token provided");
    }

    const token = authHeader.substring(7);
    const decoded = await authService.verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
};
