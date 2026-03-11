const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${tableName}';`
  );
  // result may be array-like depending on driver
  const cnt = result && result[0] && (result[0].cnt || result[0].CNT || result[0]['COUNT(*)']);
  return Number(cnt) > 0;
}

async function run() {
  try {
    await prisma.$connect();

    const oldName = 'logs';
    const newName = 'log_de_errores_de_notificacion';

    const oldExists = await tableExists(oldName);
    const newExists = await tableExists(newName);

    if (!oldExists) {
      console.log(`Tabla '${oldName}' no existe. Nada que hacer.`);
      return process.exit(0);
    }

    if (newExists) {
      console.log(`Tabla destino '${newName}' ya existe. No se realizará el renombrado automáticamente.`);
      return process.exit(0);
    }

    // Use atomic rename if possible
    console.log(`Renombrando tabla '${oldName}' a '${newName}' (operación atómica)...`);
    await prisma.$executeRawUnsafe(`RENAME TABLE \`${oldName}\` TO \`${newName}\`;`);
    console.log('Renombrado completado.');
    process.exit(0);
  } catch (e) {
    console.error('Error durante migración de logs:', e.message || e);
    process.exit(1);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {}
  }
}

run();
