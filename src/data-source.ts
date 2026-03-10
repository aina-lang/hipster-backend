import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AiUser } from './ai/entities/ai-user.entity';
import { User } from './users/entities/user.entity';
import { Otp } from './otp/enitities/otp.entity';
import { Payment } from './payments/entities/payment.entity';
import { AiUsageLog } from './ai/entities/ai-usage-log.entity';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: '51.178.50.63',
  port: 3306,
  username: 'hipsteruser',
  password: 'MotDePasseFort',
  database: 'hipsterdb',
  synchronize: false, // Force false for CLI usage
  logging: true,
  entities: [AiUser, User, Otp, Payment, AiUsageLog],
  migrations: [__dirname + '/migrations/*.ts'],
  subscribers: [],
});
