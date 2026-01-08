import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { TaskPriority, TaskStatus } from './entities/task.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: 'Créer une tâche' })
  @ResponseMessage('Tâche créée avec succès')
  @Post()
  async create(@Body() createTaskDto: CreateTaskDto, @Req() req) {
    return this.tasksService.create(createTaskDto, req.user.userId);
  }

  @ApiOperation({ summary: 'Lister les tâches' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: TaskStatus },
    { name: 'priority', required: false, enum: TaskPriority },
    { name: 'projectId', required: false, type: Number },
    { name: 'assigneeId', required: false, type: Number },
  ])
  @Get()
  async findAll(@Query() query: QueryTasksDto) {
    return this.tasksService.findPaginated(query);
  }

  @ApiOperation({ summary: "Récupérer les tâches d'un projet" })
  @Get('project/:projectId')
  async findByProject(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.tasksService.findByProject(projectId);
  }

  @ApiOperation({ summary: 'Récupérer une tâche par ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @ApiOperation({ summary: 'Mettre à jour une tâche' })
  @ResponseMessage('Tâche mise à jour avec succès')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: UpdateTaskDto,
    @Req() req,
  ) {
    return this.tasksService.update(id, updateTaskDto, req.user.userId);
  }

  @ApiOperation({ summary: "Mettre à jour le statut d'une tâche" })
  @ResponseMessage('Statut de la tâche mis à jour avec succès')
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req,
  ) {
    console.log(`[PATCH /tasks/${id}/status] Received body:`, body);
    const status = body.status || body;
    console.log(`[PATCH /tasks/${id}/status] Extracted status:`, status);
    return this.tasksService.updateStatus(id, status, req.user.userId);
  }

  @ApiOperation({ summary: 'Supprimer une tâche' })
  @ResponseMessage('Tâche supprimée avec succès')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.remove(id);
  }
}
