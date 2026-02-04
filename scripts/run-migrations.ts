import 'reflect-metadata';
import { AppDataSource } from '../src/data-source';

async function run() {
  try {
    console.log('Initializing data source...');
    await AppDataSource.initialize();
    console.log('Running migrations...');
    const res = await AppDataSource.runMigrations();
    console.log('Migrations applied:', res.map(r => r.name));
    await AppDataSource.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

run();
