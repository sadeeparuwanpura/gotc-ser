import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { dropEverything, isDatabaseEmpty, seedDatabase } from './seed-runner';
import { DEMO_PASSWORD, USERS } from './seed-data';

/**
 *   npm run seed          refuses if the database already holds data
 *   npm run seed:reset    drops and rebuilds
 */
async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  await connectDatabase();

  if (reset) {
    await dropEverything();
  } else if (!(await isDatabaseEmpty())) {
    process.stderr.write(
      '\nThe database already holds data. Run "npm run seed:reset" to drop and rebuild it.\n\n'
    );
    await disconnectDatabase();
    process.exit(1);
  }

  const summary = await seedDatabase();

  process.stdout.write(
    [
      '',
      'GOTC seed complete.',
      `  ${summary.users} users · ${summary.machineTypes} machine types · ${summary.threads} threads · ${summary.fabrics} fabrics`,
      `  ${summary.garments} garments · ${summary.operations} operations · ${summary.orders} cone orders`,
      '',
      `  Sign in with any of these — the password for all of them is "${DEMO_PASSWORD}":`,
      ...USERS.map((user) => `    ${user.email.padEnd(24)} ${user.role}`),
      ''
    ].join('\n')
  );

  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  process.stderr.write(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}\n\n`);
  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
  }
  process.exit(1);
});
