import { z } from "zod";
export default class AuthValidation {
  static createUserSchema = z.object({
    lastName: z
      .string()
      .min(3, { message: "Firstname must be at least 3 characters long." }),
    firstName: z
      .string()
      .min(3, { message: "Lastname must be at least 3 characters long." }),
    email: z.string().email({ message: "Invalid email address." }),
    password: z
      .string()
      .min(10, { message: "Password must be at least 10 characters long." }),
  });
  static loginSchema = z.object({
    email: z.string().email("Email invalide"),
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  });
  static resetPasswordSchema = z.object({
    token: z.string({ required_error: "Reset token is required." }),
    newPassword: z
      .string()
      .min(10, {
        message: "New password must be at least 10 characters long.",
      }),
  });
  static forgetPasswordSchema = z.object({
    email: z.string().email("Email invalide"),
  });
}