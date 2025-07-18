import { Request, Response } from "express";
import prisma from "../../../utils/client";
import { z } from "zod";
import * as argon2 from "argon2";
import { Client } from "@prisma/client";
import { generateToken } from "../middleware/auth";
import AuthValidation from "../utils/validation/auth";
import { validationResult } from "../../../utils/validation/validationResult";

type CreateUserInput = z.infer<typeof AuthValidation.createUserSchema>;

type LoginUserInput = z.infer<typeof AuthValidation.loginSchema>;

export default class AuthController {
  static async createUser(req: Request, res: Response): Promise<void> {
    try {
      validationResult(AuthValidation.createUserSchema, req, res);
      const parsedData: CreateUserInput = AuthValidation.createUserSchema.parse(
        req.body
      );
      const clientExists = await prisma.client.findUnique({
        where: { email: parsedData.email },
      });
      if (clientExists) {
        res.status(409).json({ message: "Utilisateur déjà existant" });
        return;
      }
      const hashedPassword: string = await argon2.hash(parsedData.password);
      const client: Client = await prisma.client.create({
        data: {
          firstName: parsedData.firstName,
          lastName: parsedData.lastName,
          email: parsedData.email,
          password: hashedPassword,
        },
      });
      res.status(201).json(client);
    } catch (error) {
      res.status(500).json({ message: "Échec de l'authentification" });
    }
  }
  static async login(req: Request, res: Response): Promise<void> {
    try {
      validationResult(AuthValidation.loginSchema, req, res);
      const parsedData: LoginUserInput = AuthValidation.loginSchema.parse(
        req.body
      );
      const client = await prisma.client.findUnique({
        where: { email: parsedData.email },
      });

      if (!client) {
        res.status(404).json({ message: "Email invalide" });
        return;
      }

      const isPasswordValid: boolean = await argon2.verify(
        client.password!,
        parsedData.password
      );
      if (!isPasswordValid) {
        res.status(401).json({ message: "Identifiants invalides" });
        return;
      }
      const token = generateToken(client);
      if (!token) {
        res.status(401).json({ message: "Identifiants invalides" });
        return;
      }
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "strict" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        domain: isProduction ? ".enopps.com" : undefined,
        path: "/",
      });

      res.status(200).json({
        message: "Login successful",
        isProduction: isProduction,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Échec de l'authentification" });
    }
  }
  static async clientData(req: Request, res: Response): Promise<void> {
    try {
      const clientId = req.client?.id;
      if (!clientId) {
        res.status(401).json({ message: "Non autorisé" });
        return;
      }
      const client = await prisma.client.findUnique({
        where: { id: clientId.toString() },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          profilImage: true,
        },
      });
      if (!client) {
        res.status(404).json({ message: "Utilisateur non trouvé" });
        return;
      }
      res.status(200).json({ data: client });
    } catch (error) {
      console.error("Error fetching Teacher data:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
  static async logout(req: Request, res: Response) {
    res.clearCookie("token");
    res.status(200).json({ message: "Déconnexion réussie" });
  }
}
