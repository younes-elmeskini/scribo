import { z } from "zod";
import { Mode } from "@prisma/client";
import { FileType } from "@prisma/client";

export default class FormValidation {
  static updateformSchema = z.object({
    title: z.string({ message: "Title is required." }).optional(),
    Description: z.string({ message: "Description is required." }).optional(),
    titleStyle: z
      .string({ message: "title Style is required." })
      .nullish()
      .transform((val) => val ?? "cmbf8tgxo0003jjzgt49nod8u"),
    formStyle: z
      .string({ message: "form Style is required." })
      .optional()
      .default("cmbf8tgxo0003jjzgt49nod8u"),
    coverColor: z.string({ message: "cover Color is required." }).optional(),
    coverImage: z.string({ message: "cover Image is required." }).optional(),
    mode: z.nativeEnum(Mode, { message: "mode is required." }).optional(),
    messageSucces: z
      .string({ message: "message Succes is required." })
      .optional(),
  });

  // Ajoutez ce schéma pour la configuration de la carte
  static mapConfigSchema = z.object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    zoom: z.number().int().min(1).max(20).optional(),
    height: z.number().int().min(100).max(1000).optional()
  });

  // Mettez à jour le schéma updateFormFieldSchema pour inclure mapConfig
  static updateFormFieldSchema = z.object({
    label: z.string().optional(),
    fileType: z
      .nativeEnum(FileType, { message: "type is required." })
      .optional(),
    instruction: z.string().optional(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    name: z.string().optional(),
    requird: z.boolean().optional(),
    disable: z.boolean().optional(),
    style: z.array(z.string()).optional(),
    selectId: z.array(z.string()).optional(),
    message: z.string().optional(),
    placeholdre: z.string().optional(),
    mapConfig: FormValidation.mapConfigSchema.optional()
  });
  static optionsSchema = z.object({
    options: z
      .array(
        z.object({
          ordre: z.number().int(),
          content: z.string(),
          desactivedAt: z.boolean().optional().default(false),
        })
      )
      .optional(),
  });
  static updateOrderFormFieldSchema = z.object({
    newordre: z.number().int(),
  });
  static updateOptionSchema = z.object({
    optionId: z.string(),
    newOrdre: z.number().int().optional(),
    desactivedAt: z.boolean().optional(),
    default:z.boolean().optional(),
  });
  static deleteOptionSchema = z.object({
    optionId: z.string(),
  });
  static addFormFieldSchema = z.object({
    fieldId: z.string({ message: "Field type ID is required" }),
    name: z.string().optional(),
    label: z.string().optional(),
  });

  // Ajoutez ce schéma pour la validation des configurations de formulaire
  static formConfigurationSchema = z.object({
    sendCopyToUser: z.boolean().optional(),
    uniqueEmailUsage: z.boolean().optional(),
    uniqueEmailField: z.string().optional().nullable(),
    isDeactivated: z.boolean().optional(),
       desactivatedAt: z
      .string()
      .regex(/^\d{2}\/\d{2}\/\d{4}$/, {
        message: "desactivatedAt must be a valid date in DD/MM/YYYY format.",
      })
      .transform((val) => new Date(val))
      .optional()
      .nullish(),
    defaultFieldId: z.string().optional().nullable() //default formfield 
  });
}
