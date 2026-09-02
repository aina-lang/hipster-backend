import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  // Mêmes valeurs par défaut que app.module.ts pour que les seeds
  // ciblent la même base que l'API
  host: process.env.DB_HOST || '51.178.50.63',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'hipsteruser',
  password: process.env.DB_PASSWORD || 'MotDePasseFort',
  database: process.env.DB_NAME || 'hipsterdb',
  synchronize: false,
  logging: true,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*.ts'],
  subscribers: [],
});
