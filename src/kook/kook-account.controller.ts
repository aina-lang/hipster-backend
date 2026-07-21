import {
  Body, Controller, Get, Patch, Post, Param, Delete, UseGuards, Req,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { KookAccountService } from './kook-account.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { KookTelegramService } from './services/kook-telegram.service';
import { KookUser } from './kook-user.decorator';

@Public()
@UseGuards(KookAuthGuard)
@Controller('kook/account')
export class KookAccountController {
  constructor(
    private readonly account: KookAccountService,
    private readonly telegram: KookTelegramService,
  ) {}

  @Get('profile')
  async getProfile(@KookUser() user: any) {
    return this.account.getProfile(user.id);
  }

  @Patch('profile')
  async updateProfile(@KookUser() user: any, @Body() dto: UpdateAccountDto) {
    return this.account.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@KookUser() user: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    const url = await this.telegram.uploadImage(file.buffer, file.originalname);
    return this.account.uploadAvatar(user.id, url);
  }

  @Post('cover')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(@KookUser() user: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');
    const url = await this.telegram.uploadImage(file.buffer, file.originalname);
    return this.account.uploadCover(user.id, url);
  }

  @Delete('delete')
  async deleteAccount(@KookUser() user: any) {
    return this.account.deleteAccount(user.id);
  }
}
