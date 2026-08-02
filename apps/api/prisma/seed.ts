import { PrismaClient, FieldType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('Admin123!');

  await prisma.user.upsert({
    where: { email: 'admin@ims.local' },
    update: {},
    create: {
      email: 'admin@ims.local',
      fullName: 'System Admin',
      role: 'SUPER_ADMIN',
      passwordHash,
    },
  });

  const types = [
    { code: 'raw_material', name: 'Raw Material', description: 'Base materials', sortOrder: 1 },
    { code: 'semi_finished', name: 'Semi Finished Goods', description: 'WIP', sortOrder: 2 },
    { code: 'finished_goods', name: 'Finished Goods', description: 'Completed products', sortOrder: 3 },
  ];

  for (const t of types) {
    await prisma.inventoryType.upsert({
      where: { code: t.code },
      update: { name: t.name, description: t.description, sortOrder: t.sortOrder },
      create: t,
    });
  }

  const raw = await prisma.inventoryType.findUniqueOrThrow({ where: { code: 'raw_material' } });

  const rawFields: Array<{
    key: string;
    displayName: string;
    fieldType: FieldType;
    isRequired?: boolean;
    isFilterable?: boolean;
    isSearchable?: boolean;
    validation?: object;
  }> = [
    { key: 'grade', displayName: 'Grade', fieldType: 'TEXT', isRequired: true, isFilterable: true, isSearchable: true },
    { key: 'thickness', displayName: 'Thickness (mm)', fieldType: 'DECIMAL', isRequired: true, isFilterable: true, validation: { min: 0 } },
    { key: 'width', displayName: 'Width (mm)', fieldType: 'DECIMAL', validation: { min: 0 } },
    { key: 'length', displayName: 'Length (mm)', fieldType: 'DECIMAL', validation: { min: 0 } },
  ];

  for (const [i, f] of rawFields.entries()) {
    const existing = await prisma.fieldDefinition.findFirst({
      where: { inventoryTypeId: raw.id, key: f.key, deletedAt: null },
    });
    if (!existing) {
      await prisma.fieldDefinition.create({
        data: {
          inventoryTypeId: raw.id,
          key: f.key,
          displayName: f.displayName,
          fieldType: f.fieldType,
          isRequired: f.isRequired ?? false,
          isFilterable: f.isFilterable ?? false,
          isSearchable: f.isSearchable ?? false,
          validation: f.validation ?? {},
          sortOrder: i,
        },
      });
    }
  }

  const finished = await prisma.inventoryType.findUniqueOrThrow({ where: { code: 'finished_goods' } });
  const fgFields: Array<{ key: string; displayName: string; fieldType: FieldType; isUnique?: boolean }> = [
    { key: 'barcode', displayName: 'Barcode', fieldType: 'BARCODE', isUnique: true },
    { key: 'warranty', displayName: 'Warranty (months)', fieldType: 'NUMBER' },
    { key: 'color', displayName: 'Color', fieldType: 'COLOR' },
    { key: 'packaging', displayName: 'Packaging', fieldType: 'TEXT' },
  ];

  for (const [i, f] of fgFields.entries()) {
    const existing = await prisma.fieldDefinition.findFirst({
      where: { inventoryTypeId: finished.id, key: f.key, deletedAt: null },
    });
    if (!existing) {
      await prisma.fieldDefinition.create({
        data: {
          inventoryTypeId: finished.id,
          key: f.key,
          displayName: f.displayName,
          fieldType: f.fieldType,
          isUnique: f.isUnique ?? false,
          sortOrder: i,
        },
      });
    }
  }

  await prisma.setting.upsert({
    where: { key: 'org' },
    update: {},
    create: {
      key: 'org',
      value: { name: 'Het Bhano Manufacturing', locale: 'en-IN', defaultUnit: 'pcs' },
      description: 'Organization settings',
    },
  });

  console.log('Seed complete. Login: admin@ims.local / Admin123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
