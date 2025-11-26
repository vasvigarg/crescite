import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface JwtPayload {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  token: string;
}

export class AuthService {
  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw ApiError.conflict("User with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    const token = this.generateToken({ id: user.id, email: user.email });

    return { user, token };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const token = this.generateToken({ id: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
    };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      return decoded;
    } catch (error) {
      throw ApiError.unauthorized("Invalid or expired token");
    }
  }

  private generateToken(payload: JwtPayload): string {
    if (
      !env.JWT_SECRET ||
      typeof env.JWT_SECRET !== "string" ||
      env.JWT_SECRET.length < 8
    ) {
      // Throw a clear internal error if JWT secret is missing or too short
      throw ApiError.internal("JWT secret is not configured correctly");
    }

    const expiresIn =
      typeof env.JWT_EXPIRES_IN === "string" ? env.JWT_EXPIRES_IN : undefined;

    try {
      // Cast to any to satisfy TypeScript overloads from jsonwebtoken types
      return jwt.sign(payload as any, env.JWT_SECRET as any, {
        expiresIn: expiresIn as any,
      });
    } catch (error) {
      console.error("Failed to generate JWT token:", error);
      throw ApiError.internal("Failed to generate authentication token");
    }
  }
}

export const authService = new AuthService();
