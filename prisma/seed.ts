import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function getFieldNameFromId(fieldId: string): string {
  // This is a mapping based on your data files
  const fieldMap: Record<string, string> = {
    cmb9iy1l70000jn6kkuyts2ok: "Zone de texte",
    cmb9iy1yy0001jn6kjec5vt9m: "Adresse email",
    cmb9iy2730002jn6k8cvjzv3: "Numéro de téléphone",
    cmb9iy2ft0003jn6kac286iix: "Boutons radio",
    cmb9iy2o20004jn6k5x3h1gex: "Menu déroulant",
    cmb9iy2wb0005jn6kqzrtqhcu: "Heure",
    cmb9iy34k0006jn6knnkwtbaz: "Fichier",
    cmb9iy3ct0007jn6k666j5bd1: "Google Map",
    cmb9iy3l70008jn6k4q304jr5: "Booléen – Vrai / Faux",
    cmb9iy3tf0009jn6ksioqguo6: "Champ de texte",
    cmb9iy41q000ajn6kp4kagu06: "URL",
    cmb9iy4a1000bjn6kkpzesuby: "Valeur numérique",
    cmb9iy4i1000cjn6ken83x4ek: "Cases à cocher",
    cmb9iy4qa000djn6kgvxteyuh: "Date",
    cmb9iy4yj000ejn6kalv6whfe: "Date et heure",
    cmb9iy56r000fjn6kjx03je6y: "Image",
    cmb9iy5ey000gjn6k3qj181ci: "Plage de valeurs",
    cmb9iy5n5000hjn6kdp1er4hr: "Couleur",
    cmb9iy5vr000ijn6krybt0ru0: "Acceptation légale",
    cmb9iy63p000jjn6kordm8p4i: "Bloc de text",
  };

  return fieldMap[fieldId] || "Zone de texte"; // Default to text field
}

async function main() {
  // Seed fields first
  const filePath = path.join(__dirname, "data", "fields.json");
  const rawData = fs.readFileSync(filePath, "utf-8");
  const fields = JSON.parse(rawData);

  for (const field of fields) {
    await prisma.fields.upsert({
      where: { fieldName: field.fieldName },
      update: {
        icon: field.icon,
        fieldName: field.fieldName,
        type: field.type,
      },
      create: {
        id: field.id,
        icon: field.icon,
        fieldName: field.fieldName,
        type: field.type,
      },
    });
  }

  console.log("✅ Champs insérés avec succès");

  // Récupérer tous les champs pour vérification
  const allFields = await prisma.fields.findMany();
  const fieldMap = new Map();
  allFields.forEach((field) => {
    fieldMap.set(field.fieldName, field.id);
  });

  // Seed categories
  const categoryPath = path.join(__dirname, "data", "categoty.json");
  const rawCategoryData = fs.readFileSync(categoryPath, "utf-8");
  const categories = JSON.parse(rawCategoryData);

  for (const category of categories) {
    await prisma.categoty.upsert({
      where: { id: category.id },
      update: {},
      create: category,
    });
  }

  console.log("✅ Catégories insérées avec succès");

  // Seed model forms
  const formPath = path.join(__dirname, "data", "modelForm.json");
  const rawFormData = fs.readFileSync(formPath, "utf-8");
  const modelForms = JSON.parse(rawFormData);

  for (const form of modelForms) {
    await prisma.modelForm.upsert({
      where: { id: form.id },
      update: {
        coverImage: form.coverImage,
      },
      create: form,
    });
  }

  console.log("✅ Formulaires modèles insérés avec succès");

  // Seed model form fields
  const formFieldPath = path.join(__dirname, "data", "modelFormField.json");
  const rawFormFieldData = fs.readFileSync(formFieldPath, "utf-8");
  let modelFormFields = JSON.parse(rawFormFieldData);

  // Mettre à jour les fieldId pour correspondre aux IDs actuels
  modelFormFields = modelFormFields
    .map((formField: any) => {
      // Find the field by name instead of ID
      const fieldName = getFieldNameFromId(formField.fieldId);
      const field = allFields.find((f) => f.fieldName === fieldName);

      if (!field) {
        console.warn(
          `⚠️ Champ avec ID ${formField.fieldId} non trouvé, sera ignoré`
        );
        return null;
      }

      // Update the fieldId to match the actual ID in the database
      return {
        ...formField,
        fieldId: field.id,
      };
    })
    .filter(Boolean); // Filtrer les entrées nulles

  for (const formField of modelFormFields) {
    try {
      await prisma.modelFormField.upsert({
        where: { id: formField.id },
        update: {},
        create: formField,
      });
    } catch (error) {
      console.error(
        `❌ Erreur lors de l'insertion du champ ${formField.id}:`,
        error
      );
      console.error(error);
    }
  }

  console.log("✅ Champs de formulaire modèles insérés avec succès");
}

main()
  .catch((e) => {
    console.error("❌ Erreur de seed :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
