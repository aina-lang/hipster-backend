import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';
import { join } from 'path';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';

// const templateDir =
//   process.env.NODE_ENV === 'production'
//     ? join(__dirname, 'templates')
//     : join(process.cwd(), 'src', 'mail', 'templates');

import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    CompanyModule,
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: 'jayjenaa5@gmail.com',
            pass: 'xlbibmqdvivmtuoj',
          },
          tls: {
            rejectUnauthorized: false, // Helpful for some environments
          },
        },
        defaults: {
          from: '"Support Hipster Marketing && AI" <hipsterai@gmail.com>',
        },
        template: {
          dir: join(__dirname, '../templates'),
          adapter: new PugAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
