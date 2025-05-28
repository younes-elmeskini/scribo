import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, 'data', 'fields.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const fields = JSON.parse(rawData);

  for (const field of fields) {
    await prisma.fields.upsert({
      where: {  fieldName: field.fieldName },
      update: {},
      create: {
        icon: field.icon,
        fieldName: field.fieldName,
        type: field.type
      }
    });
  }

  console.log('✅ Champs insérés avec succès');
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seed :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
