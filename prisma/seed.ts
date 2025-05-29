import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

function getFieldNameFromId(fieldId: string): string {
  // This is a mapping based on your data files
  const fieldMap: Record<string, string> = {
    "cmb9d2t4o0011jnuin9esevh3": "Zone de texte",
    "cmb9d2t4o0022jnuin9esevh5": "Adresse email",
    "cmb9d2t4o0033jnuin9esevh6": "Numéro de téléphone",
    "cmb9d2t4o0044jnuin9esevh7": "Boutons radio",
    "cmb9d2t4o0055jnuin9esevh8": "Menu déroulant",
    "cmb9d2t4o0066jnuin9esevh9": "Heure",
    "cmb9d2t4o0077jnuin9esev10": "Fichier",
    "cmb9d2t4o0101jnuin9esev13": "Zone de texte", // Assuming this is text field
    "cmb9d2t4o0144jnuin9esev17": "Date", // Assuming this is date field
    "cmb9d2t4o0177jnuin9esev20": "Nombre", // Assuming this is number field
    "cmb9d2t4o0200jnuin9esev23": "Zone de texte longue" // Assuming this is textarea
  };
  
  return fieldMap[fieldId] || "Zone de texte"; // Default to text field
}

async function main() {
  // Seed fields first
  const filePath = path.join(__dirname, 'data', 'fields.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const fields = JSON.parse(rawData);

  for (const field of fields) {
    await prisma.fields.upsert({
      where: { fieldName: field.fieldName },
      update: {},
      create: {
        id: field.id, // Assurez-vous que l'ID est préservé
        icon: field.icon,
        fieldName: field.fieldName,
        type: field.type
      }
    });
  }

  console.log('✅ Champs insérés avec succès');

  // Récupérer tous les champs pour vérification
  const allFields = await prisma.fields.findMany();
  const fieldMap = new Map();
  allFields.forEach(field => {
    fieldMap.set(field.fieldName, field.id);
  });

  // Seed categories
  const categoryPath = path.join(__dirname, 'data', 'categoty.json');
  const rawCategoryData = fs.readFileSync(categoryPath, 'utf-8');
  const categories = JSON.parse(rawCategoryData);

  for (const category of categories) {
    await prisma.categoty.upsert({
      where: { id: category.id },
      update: {},
      create: category
    });
  }

  console.log('✅ Catégories insérées avec succès');

  // Seed model forms
  const formPath = path.join(__dirname, 'data', 'modelForm.json');
  const rawFormData = fs.readFileSync(formPath, 'utf-8');
  const modelForms = JSON.parse(rawFormData);

  for (const form of modelForms) {
    await prisma.modelForm.upsert({
      where: { id: form.id },
      update: {},
      create: form
    });
  }

  console.log('✅ Formulaires modèles insérés avec succès');

  // Seed model form fields
  const formFieldPath = path.join(__dirname, 'data', 'modelFormField.json');
  const rawFormFieldData = fs.readFileSync(formFieldPath, 'utf-8');
  let modelFormFields = JSON.parse(rawFormFieldData);

  // Mettre à jour les fieldId pour correspondre aux IDs actuels
  modelFormFields = modelFormFields.map((formField: any) => {
    // Find the field by name instead of ID
    const fieldName = getFieldNameFromId(formField.fieldId);
    const field = allFields.find(f => f.fieldName === fieldName);
    
    if (!field) {
      console.warn(`⚠️ Champ avec ID ${formField.fieldId} non trouvé, sera ignoré`);
      return null;
    }
    
    // Update the fieldId to match the actual ID in the database
    return {
      ...formField,
      fieldId: field.id
    };
  }).filter(Boolean); // Filtrer les entrées nulles

  for (const formField of modelFormFields) {
    try {
      await prisma.modelFormField.upsert({
        where: { id: formField.id },
        update: {},
        create: formField
      });
    } catch (error) {
      console.error(`❌ Erreur lors de l'insertion du champ ${formField.id}:`, error);
      console.error(error);
    }
  }

  console.log('✅ Champs de formulaire modèles insérés avec succès');
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seed :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
