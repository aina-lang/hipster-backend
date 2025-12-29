
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';

// Robust error handling
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('🚀 Script starting...');

async function deleteUser() {
  console.log('🔌 Connecting to database...');
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '51.178.50.63',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'hipsteruser',
    password: process.env.DB_PASSWORD || 'MotDePasseFort',
    database: process.env.DB_NAME || 'hipsterdb',
    entities: [
      __dirname + '/../**/*.entity.ts', 
    ],
    synchronize: true, // Apply FK fixes
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to DB');

    const userRepo = dataSource.getRepository(User);
    
    const emailTarget = 'cursorbulen@gmail.com';
    console.log(`🔍 Searching for "${emailTarget}"...`);

    const user = await userRepo.findOne({
      where: { email: emailTarget },
      relations: ['clientProfile', 'employeeProfile']
    });

    if (!user) {
      console.log(`❌ User NOT found.`);
      const users = await userRepo.find({ take: 3, order: { id: 'DESC' } });
      console.log('ℹ️  Sample users:', users.map(u => u.email));
      return;
    }

    console.log(`👤 Found user #${user.id}: ${user.email}`);
    
    await userRepo.remove(user);
    console.log('✅ User DELETED.');

  } catch (error) {
    console.error('❌ Error in logic:', error);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

deleteUser();
