import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parser = require('cron-parser');
import { RecurringTask } from './entities/recurring-task.entity';
import { CreateRecurringTaskDto } from './dto/create-recurring-task.dto';
import { UpdateRecurringTaskDto } from './dto/update-recurring-task.dto';
import { Task, TaskStatus } from 'src/tasks/entities/task.entity';
import { Project } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class RecurringTasksService {
  private readonly logger = new Logger(RecurringTasksService.name);

  constructor(
    @InjectRepository(RecurringTask)
    private readonly recurringTaskRepo: Repository<RecurringTask>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateRecurringTaskDto, userId: number) {
    const project = await this.projectRepo.findOneBy({ id: dto.projectId });
    if (!project) throw new Error('Project not found');

    const createdBy = await this.userRepo.findOneBy({ id: userId });

    // Calculate next run
    const interval = parser.parseExpression(dto.cronExpression);
    const nextRunAt = interval.next().toDate();

    const recurringTask = this.recurringTaskRepo.create({
      ...dto,
      project,
      createdBy: createdBy || undefined, // Handle null
      nextRunAt,
    });

    return this.recurringTaskRepo.save(recurringTask);
  }

  async findAll() {
    return this.recurringTaskRepo.find({
      relations: ['project', 'createdBy'],
    });
  }

  async findOne(id: number) {
    return this.recurringTaskRepo.findOne({
      where: { id },
      relations: ['project', 'createdBy'],
    });
  }

  async update(id: number, dto: UpdateRecurringTaskDto) {
    const recurringTask = await this.findOne(id);
    if (!recurringTask) throw new Error('Recurring Task not found');

    Object.assign(recurringTask, dto);

    if (dto.cronExpression) {
      const interval = parser.parseExpression(dto.cronExpression);
      recurringTask.nextRunAt = interval.next().toDate();
    }

    return this.recurringTaskRepo.save(recurringTask);
  }

  async remove(id: number) {
    return this.recurringTaskRepo.delete(id);
  }

  // ----------------------------------------------------------------
  // 🕒 CRON JOB: Check for tasks to run every minute
  // ----------------------------------------------------------------
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    this.logger.debug('Checking for recurring tasks...');

    const now = new Date();
    const tasksToRun = await this.recurringTaskRepo
      .createQueryBuilder('rt')
      .where('rt.isActive = :isActive', { isActive: true })
      .andWhere('rt.nextRunAt <= :now', { now })
      .leftJoinAndSelect('rt.project', 'project')
      .getMany();

    if (tasksToRun.length === 0) return;

    this.logger.log(`Found ${tasksToRun.length} recurring tasks to run.`);

    for (const rt of tasksToRun) {
      try {
        // 1. Create the Task
        const newTask = this.taskRepo.create({
          title: rt.title,
          description: rt.description,
          status: TaskStatus.TODO,
          priority: rt.priority,
          project: rt.project,
          assignees: rt.assigneeId ? [{ id: rt.assigneeId } as User] : [], // Fix: assignees is an array
          createdBy: rt.createdBy || undefined,
        });

        await this.taskRepo.save(newTask);
        this.logger.log(`Created Task #${newTask.id} from RecurringTask #${rt.id}`);

        // 2. Update nextRunAt
        const interval = parser.parseExpression(rt.cronExpression);
        rt.lastRunAt = new Date();
        rt.nextRunAt = interval.next().toDate();
        await this.recurringTaskRepo.save(rt);

      } catch (error) {
        this.logger.error(`Failed to process RecurringTask #${rt.id}`, error);
      }
    }
  }
}
