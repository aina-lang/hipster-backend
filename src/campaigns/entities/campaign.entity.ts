import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum CampaignStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum CampaignType {
    EMAIL = 'EMAIL',
    PUSH = 'PUSH',
    MIXED = 'MIXED',
}

export enum AudienceType {
    ALL = 'ALL',
    CLIENTS = 'CLIENTS',
    EMPLOYEES = 'EMPLOYEES',
}

@Entity('campaigns')
export class Campaign {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: CampaignType,
        default: CampaignType.EMAIL,
    })
    type: CampaignType;

    @Column({
        type: 'enum',
        enum: CampaignStatus,
        default: CampaignStatus.INACTIVE,
    })
    status: CampaignStatus;

    @Column({
        type: 'enum',
        enum: AudienceType,
        default: AudienceType.ALL,
    })
    audienceType: AudienceType;

    @Column({ type: 'datetime', nullable: true })
    startDate: Date;

    @Column({ type: 'datetime', nullable: true })
    executedAt: Date; // To track if it has been executed

    @Column({ type: 'datetime', nullable: true })
    endDate: Date; // Optional, maybe for recurring end?

    @Column({ type: 'int', default: 0 })
    targetAudience: number;

    @Column({ type: 'int', default: 0 })
    sent: number;

    @Column({ type: 'int', default: 0 })
    opened: number;

    @Column({ type: 'int', default: 0 })
    clicked: number;

    @Column({ type: 'text', nullable: true })
    content: string; // HTML/Text content

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
