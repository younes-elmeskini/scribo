import { z } from "zod";

export default class CompagneValidation {
  static createCompagneSchema = z.object({
    compagneName: z
      .string()
      .min(3, { message: "Compagne name must be at least 3 characters long." }),
    fields: z.array(z.string(), {
      message: "fields must be an array of strings.",
    }),
  });
  static updateformSchema = z.object({
    desactivatedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "desactivatedAt must be a valid date in YYYY-MM-DD format.",
      })
      .transform((val) => new Date(val))
      .optional(),
    fields: z.array(z.string({message:"fieldId is required."}), {
      message: "fields must be an array of strings.",
    }),
  });
}
