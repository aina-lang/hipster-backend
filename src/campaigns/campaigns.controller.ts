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
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { CampaignStatus, CampaignType } from './entities/campaign.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { CampaignExecutionService } from './campaign-execution.service';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
    constructor(
        private readonly campaignsService: CampaignsService,
        private readonly campaignExecutionService: CampaignExecutionService,
    ) { }

    @ApiOperation({ summary: 'Créer une campagne' })
    @ResponseMessage('Campagne créée avec succès')
    @Post()
    async create(@Body() createCampaignDto: CreateCampaignDto) {
        return this.campaignsService.create(createCampaignDto);
    }

    @ApiOperation({ summary: 'Lister les campagnes' })
    @ApiPaginationQueries([
        { name: 'status', required: false, enum: CampaignStatus },
        { name: 'type', required: false, enum: CampaignType },
        { name: 'startDateFrom', required: false, type: String },
        { name: 'startDateTo', required: false, type: String },
    ])
    @Get()
    async findAll(@Query() query: QueryCampaignsDto) {
        return this.campaignsService.findPaginated(query);
    }

    @ApiOperation({ summary: 'Consulter une campagne' })
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.campaignsService.findOne(+id);
    }

    @ApiOperation({ summary: 'Mettre à jour une campagne' })
    @ResponseMessage('Campagne mise à jour avec succès')
    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() updateCampaignDto: UpdateCampaignDto,
    ) {
        return this.campaignsService.update(+id, updateCampaignDto);
    }

    @ApiOperation({ summary: 'Exécuter une campagne' })
    @ResponseMessage('Campagne exécutée avec succès')
    @Post(':id/execute')
    async execute(@Param('id') id: string) {
        const result = await this.campaignExecutionService.executeCampaign(+id);
        return {
            message: `Campagne exécutée: ${result.sent} envoyés, ${result.errors} erreurs`,
            ...result,
        };
    }

    @ApiOperation({ summary: 'Supprimer une campagne' })
    @ResponseMessage('Campagne supprimée avec succès')
    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.campaignsService.remove(+id);
    }
}
