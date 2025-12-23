import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment } from './entities/payment.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const user = await this.userRepo.findOneBy({ id: dto.userId });
    if (!user)
      throw new NotFoundException(`Utilisateur #${dto.userId} introuvable`);

    let client: ClientProfile | undefined;
    if (dto.clientId) {
      const clientEntity = await this.clientRepo.findOneBy({
        id: dto.clientId,
      });
      if (!clientEntity)
        throw new NotFoundException(`Client #${dto.clientId} introuvable`);
      client = clientEntity;
    }

    let project: Project | undefined;
    if (dto.projectId) {
      const projectEntity = await this.projectRepo.findOneBy({
        id: dto.projectId,
      });
      if (!projectEntity)
        throw new NotFoundException(`Projet #${dto.projectId} introuvable`);
      project = projectEntity;
    }

    let invoice: Invoice | undefined;
    if (dto.invoiceId) {
      const invoiceEntity = await this.invoiceRepo.findOneBy({
        id: dto.invoiceId,
      });
      if (!invoiceEntity)
        throw new NotFoundException(`Facture #${dto.invoiceId} introuvable`);
      invoice = invoiceEntity;
    }

    const payment = this.paymentRepo.create({
      amount: dto.amount,
      currency: dto.currency,
      paymentType: dto.paymentType,
      provider: dto.provider,
      status: dto.status,
      reference: dto.reference,
      user,
      client,
      project,
      invoice,
    });

    return this.paymentRepo.save(payment);
  }

  async findPaginated(
    query: QueryPaymentsDto,
  ): Promise<PaginatedResult<Payment>> {
    const {
      page = 1,
      limit = 25,
      search,
      status,
      paymentType,
      provider,
      userId,
      clientId,
      projectId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('payment.client', 'client')
      .leftJoinAndSelect('payment.project', 'project')
      .leftJoinAndSelect('payment.invoice', 'invoice');

    if (search) {
      qb.andWhere(
        '(payment.reference LIKE :search OR user.email LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) qb.andWhere('payment.status = :status', { status });
    if (paymentType)
      qb.andWhere('payment.paymentType = :paymentType', { paymentType });
    if (provider) qb.andWhere('payment.provider = :provider', { provider });
    if (userId) qb.andWhere('user.id = :userId', { userId });
    if (clientId) qb.andWhere('client.id = :clientId', { clientId });
    if (projectId) qb.andWhere('project.id = :projectId', { projectId });

    const [data, total] = await qb
      .orderBy(`payment.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['user', 'client', 'project', 'invoice'],
    });
    if (!payment) throw new NotFoundException(`Paiement #${id} introuvable`);
    return payment;
  }

  async update(id: number, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findOne(id);
    const { userId, clientId, projectId, invoiceId, ...rest } = dto;

    if (userId) {
      const user = await this.userRepo.findOneBy({ id: userId });
      if (!user)
        throw new NotFoundException(`Utilisateur #${userId} introuvable`);
      payment.user = user;
    }

    if (clientId) {
      const client = await this.clientRepo.findOneBy({ id: clientId });
      if (!client)
        throw new NotFoundException(`Client #${clientId} introuvable`);
      payment.client = client;
    }

    if (projectId) {
      const project = await this.projectRepo.findOneBy({ id: projectId });
      if (!project)
        throw new NotFoundException(`Projet #${projectId} introuvable`);
      payment.project = project;
    }

    if (invoiceId) {
      const invoice = await this.invoiceRepo.findOneBy({ id: invoiceId });
      if (!invoice)
        throw new NotFoundException(`Facture #${invoiceId} introuvable`);
      payment.invoice = invoice;
    }

    Object.assign(payment, rest);
    return this.paymentRepo.save(payment);
  }

  async remove(id: number): Promise<{ message: string }> {
    const payment = await this.paymentRepo.findOneBy({ id });
    if (!payment) throw new NotFoundException(`Paiement #${id} introuvable`);
    await this.paymentRepo.remove(payment);
    return { message: `Paiement #${id} supprimé` };
  }
}
