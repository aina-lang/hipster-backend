import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnersService, RequestUser } from './partners.service';
import {
  UpdateCommissionDto,
  UpdateCommissionStatusDto,
} from './dto/update-commission.dto';
import { Roles } from 'src/common/decorators/role.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Partner Commissions')
@Controller('partner-commissions')
export class CommissionsController {
  constructor(private readonly partnersService: PartnersService) {}

  private ctx(req: any): RequestUser {
    return { userId: req.user.userId, roles: req.user.roles };
  }

  /** 💶 Liste des commissions (scopée par rôle) */
  @ApiOperation({ summary: 'Liste des commissions' })
  @Get()
  findAll(@Request() req) {
    return this.partnersService.findCommissions(this.ctx(req));
  }

  /** 🔄 Changer le statut d'une commission (admin) */
  @ApiOperation({ summary: "Changer le statut d'une commission (admin)" })
  @ResponseMessage('Commission mise à jour')
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionStatusDto,
    @Request() req,
  ) {
    return this.partnersService.updateCommission(
      +id,
      { status: dto.status },
      this.ctx(req),
    );
  }

  /** ✏️ Mettre à jour une commission (dates, référence…) (admin) */
  @ApiOperation({ summary: 'Mettre à jour une commission (admin)' })
  @ResponseMessage('Commission mise à jour')
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionDto,
    @Request() req,
  ) {
    return this.partnersService.updateCommission(+id, dto, this.ctx(req));
  }

  /** 📎 Justificatif de commission (admin) */
  @ApiOperation({ summary: 'Uploader un justificatif de commission (admin)' })
  @ResponseMessage('Justificatif ajouté')
  @Roles(Role.ADMIN)
  @Post(':id/justificatif')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, process.env.UPLOAD_PATH || join(process.cwd(), 'uploads'));
        },
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  attachJustificatif(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant');
    return this.partnersService.attachJustificatif(+id, `/uploads/${file.filename}`);
  }
}
