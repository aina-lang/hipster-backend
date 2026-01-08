import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { FilesService } from './files.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { QueryFilesDto } from './dto/query-files.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @ApiOperation({ summary: 'Créer un fichier' })
  @ResponseMessage('Fichier créé avec succès')
  @Post()
  create(@Body() createFileDto: CreateFileDto) {
    return this.filesService.create(createFileDto);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer tous les fichiers avec pagination' })
  @ApiPaginationQueries()
  findAll(@Query() query: QueryFilesDto) {
    return this.filesService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer un fichier par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un fichier' })
  @ResponseMessage('Fichier mis à jour avec succès')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFileDto: UpdateFileDto) {
    return this.filesService.update(+id, updateFileDto);
  }

  @ApiOperation({ summary: 'Uploader un fichier' })
  @ResponseMessage('Fichier uploadé avec succès')
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: { projectId?: string; ticketId?: string; uploadedById?: string },
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const fileUrl = `/uploads/${file.filename}`;

    return this.filesService.create({
      originalName: file.originalname,
      filename: file.filename,
      url: fileUrl,
      mimeType: file.mimetype,
      size: file.size,
      projectId: body.projectId ? parseInt(body.projectId) : undefined,
      ticketId: body.ticketId ? parseInt(body.ticketId) : undefined,
      uploadedById: body.uploadedById ? parseInt(body.uploadedById) : undefined,
    });
  }

  @ApiOperation({ summary: 'Supprimer un fichier' })
  @ResponseMessage('Fichier supprimé avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.filesService.remove(+id);
  }
}
