import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { RecurringTasksService } from './recurring-tasks.service';
import { CreateRecurringTaskDto } from './dto/create-recurring-task.dto';
import { UpdateRecurringTaskDto } from './dto/update-recurring-task.dto';
import { QueryRecurringTasksDto } from './dto/query-recurring-tasks.dto';
import { User } from 'src/common/decorators/user.decorator';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Recurring Tasks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('recurring-tasks')
export class RecurringTasksController {
  constructor(private readonly recurringTasksService: RecurringTasksService) {}

  @Post()
  create(@User() user: any, @Body() createRecurringTaskDto: CreateRecurringTaskDto) {
    return this.recurringTasksService.create(createRecurringTaskDto, user.sub);
  }

  @Get()
  findAll(@Query() query: QueryRecurringTasksDto) {
    return this.recurringTasksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recurringTasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRecurringTaskDto: UpdateRecurringTaskDto,
  ) {
    return this.recurringTasksService.update(id, updateRecurringTaskDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recurringTasksService.remove(id);
  }
}
