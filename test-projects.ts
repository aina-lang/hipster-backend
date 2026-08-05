import { DataSource } from 'typeorm';
import { Project } from './src/projects/entities/project.entity';
import { ClientProfile } from './src/profiles/entities/client-profile.entity';
import { User } from './src/users/entities/user.entity';
import { config } from 'dotenv';
config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hypster',
  entities: [__dirname + '/src/**/*.entity{.ts,.js}'],
  synchronize: false,
});

AppDataSource.initialize().then(async () => {
  const users = await AppDataSource.getRepository(User).find({ relations: ['clientProfile'] });
  for (const user of users) {
    if (!user.clientProfile) continue;
    const projects = await AppDataSource.getRepository(Project).find({
      where: { client: { id: user.clientProfile.id } },
    });
    if (projects.length > 0) {
      console.log(`User ${user.email} (Profile ${user.clientProfile.id}) has ${projects.length} projects:`);
      projects.forEach(p => console.log(` - ID: ${p.id}, Name: "${p.name}", Status: ${p.status}, Type: ${p.name.toLowerCase().includes('maintenance') ? 'Maintenance' : 'Other'}, recurrenceType: ${p.recurrenceType}`));
    }
  }
  process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
