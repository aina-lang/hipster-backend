import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile } from './entities/company-profile.entity';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { deleteFile } from 'src/common/utils/file.utils';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyProfile)
    private readonly companyRepo: Repository<CompanyProfile>,
  ) {}

  async getProfile(): Promise<CompanyProfile> {
    let profile = await this.companyRepo.findOne({ where: {} });
    if (!profile) {
      profile = this.companyRepo.create({
        name: 'My Company',
      });
      await this.companyRepo.save(profile);
    }
    return profile;
  }

  async updateProfile(dto: UpdateCompanyProfileDto): Promise<CompanyProfile> {
    const profile = await this.getProfile();

    // ✅ Delete old logo if a new one is being uploaded
    if (dto.logoUrl && profile.logoUrl && dto.logoUrl !== profile.logoUrl) {
      deleteFile(profile.logoUrl);
    }

    Object.assign(profile, dto);
    return this.companyRepo.save(profile);
  }
}
