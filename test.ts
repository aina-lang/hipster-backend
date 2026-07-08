import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './src/users/entities/user.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepo = app.get(getRepositoryToken(User));
  const user = await userRepo.findOne({
    where: { id: 32 },
    relations: ['clientProfile'],
  });
  console.log("User:", user?.id);
  console.log("Profile:", user?.clientProfile);
  await app.close();
}
bootstrap();
