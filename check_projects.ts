import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Project } from './src/projects/entities/project.entity';
import { ClientWebsite } from './src/profiles/entities/client-website.entity';

dotenv.config();

async function check() {
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hipster',
    entities: [Project, ClientWebsite],
    synchronize: false,
  });

  try {
    await ds.initialize();
    const projects = await ds.getRepository(Project).find({ select: ['id', 'name'] });
    console.log('PROJECTS:', JSON.stringify(projects));
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await ds.destroy();
  }
}

check();
