import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function deleteAllData() {
  try {
    await prisma.answer.deleteMany({});
    await prisma.soumission.deleteMany({});
    await prisma.formField.deleteMany({});
    await prisma.form.deleteMany({});
    await prisma.fields.deleteMany({});
    await prisma.teamCompagne.deleteMany({});
    await prisma.teamMenber.deleteMany({});
    await prisma.compagne.deleteMany({});
    await prisma.client.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('✅ All data has been deleted.');
  } catch (error) {
    console.error('❌ Error deleting data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllData();