import { z } from "zod";

export default class SoumissionValidation {
  static createNotesSchema = z.object({
    note: z.string({ message: "note is required" }).min(3),
  });
  static sendEmailSchema = z.object({
    email: z.string().email({ message: "Email invalide" }),
    message: z.string().min(1, { message: "Le message est requis" }),
  });
}
