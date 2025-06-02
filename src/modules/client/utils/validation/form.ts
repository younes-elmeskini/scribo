import { z } from "zod";
import { Mode } from "@prisma/client";
import { PrismaClient } from "@prisma/client";


export default class FormValidation {
  static updateformSchema = z.object({
    title: z.string({ message: "Title is required." }).optional(),
    Description: z.string({ message: "Description is required." }).optional(),
    titleStyle: z.string({ message: "title Style is required." }).optional(),
    // formStyle: z.string({ message: "form Style is required." }).optional(),
    desactivatedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "desactivatedAt must be a valid date in YYYY-MM-DD format.",
      })
      .transform((val) => new Date(val))
      .optional(),
    coverColor: z.string({ message: "cover Color is required." }).optional(),
    coverImage: z.string({ message: "cover Image is required." }).optional(),
    mode: z.nativeEnum(Mode, { message: "mode is required." }).optional(),
    messageSucces: z
      .string({ message: "message Succes is required." })
      .optional(),
  });
}
