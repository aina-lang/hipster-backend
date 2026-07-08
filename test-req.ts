import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { JwtService } from '@nestjs/jwt';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const jwtService = app.get(JwtService);
  
  const token = jwtService.sign({ sub: 32, email: 'client.maintenance@hypster.com', roles: ['client_marketing'] });
  console.log("Token:", token);
  
  const axios = require('axios');
  try {
    const res = await axios.get('http://127.0.0.1:4000/api/client-portal/tickets?page=1&limit=100', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Data:", res.data);
  } catch (err: any) {
    console.log("Error:", err.response?.status, err.response?.data);
  }
  
  await app.close();
}
bootstrap();
