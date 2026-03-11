const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}';`
  );
  const cnt = result && result[0] && (result[0].cnt || result[0].CNT || result[0]['COUNT(*)']);
  return Number(cnt) > 0;
}

async function run() {
  try {
    await prisma.$connect();

    const currentName = 'log_de_errores_de_notificacion';
    const desiredName = 'notification_error_logs';

    const currentExists = await tableExists(currentName);
    const desiredExists = await tableExists(desiredName);

    if (!currentExists) {
      console.log(`Table '${currentName}' does not exist. Nothing to rename.`);
      return process.exit(0);
    }

    if (desiredExists) {
      console.log(`Target table '${desiredName}' already exists. No automatic rename will be performed.`);
      return process.exit(0);
    }

    console.log(`Renaming table '${currentName}' -> '${desiredName}'...`);
    await prisma.$executeRawUnsafe(`RENAME TABLE \`${currentName}\` TO \`${desiredName}\`;`);
    console.log('Rename completed.');
    process.exit(0);
  } catch (e) {
    console.error('Error during rename:', e.message || e);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch (e) {}
  }
}

run();
