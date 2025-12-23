import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from './entities/payment.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Créer un paiement' })
  @ResponseMessage('Paiement créé avec succès')
  @Post()
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.create(createPaymentDto);
  }

  @ApiOperation({ summary: 'Lister les paiements' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: PaymentStatus },
    { name: 'provider', required: false, enum: PaymentProvider },
    { name: 'paymentType', required: false, enum: PaymentType },
    { name: 'userId', required: false, type: Number },
    { name: 'clientId', required: false, type: Number },
    { name: 'projectId', required: false, type: Number },
  ])
  @Get()
  findAll(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer un paiement par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un paiement' })
  @ResponseMessage('Paiement mis à jour avec succès')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(+id, updatePaymentDto);
  }

  @ApiOperation({ summary: 'Supprimer un paiement' })
  @ResponseMessage('Paiement supprimé avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(+id);
  }
}
