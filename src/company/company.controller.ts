import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @ApiOperation({
    summary: 'Récupérer les informations de l’entreprise (Public)',
  })
  @Public()
  @Get()
  getProfile() {
    return this.companyService.getProfile();
  }

  @ApiOperation({
    summary: 'Mettre à jour les informations de l’entreprise (Admin)',
  })
  @ResponseMessage('Informations de l’entreprise mises à jour')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch()
  updateProfile(@Body() dto: UpdateCompanyProfileDto) {
    return this.companyService.updateProfile(dto);
  }

  @ApiOperation({ summary: "Uploader le logo de l'entreprise (Admin)" })
  @ResponseMessage('Logo mis à jour avec succès')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, '/home/ubuntu/uploads');
        },
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }
    const logoUrl = `/uploads/${file.filename}`;
    return this.companyService.updateProfile({ logoUrl });
  }
}
