import { Controller, Post, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Mail')
@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Public()
  @ApiOperation({ summary: "Envoyer l'email de bienvenue" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        name: { type: 'string' },
        link: { type: 'string' },
      },
      required: ['to', 'name', 'link'],
    },
  })
  @Post('send')
  async sendEmail(@Body() body: { to: string; name: string; link: string }) {
    await this.mailService.sendEmail({
      subject: 'Bienvenue sur Hipster ',
      template: './welcome-email',
      to: body.to,
      context: {
        name: body.name,
        link: body.link,
      },
    });

    return { message: `E-mail envoyé à ${body.to}` };
  }
}
