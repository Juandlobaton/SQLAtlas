import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('db_connections')
@Index(['tenantId', 'name'], { unique: true })
export class DbConnectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Index()
  tenantId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ length: 300 })
  @Index()
  slug!: string;

  @Column({ length: 50 })
  engine!: string;

  @Column({ length: 255 })
  host!: string;

  @Column()
  port!: number;

  @Column({ name: 'database_name', length: 255 })
  databaseName!: string;

  @Column({ length: 255 })
  username!: string;

  @Column({ name: 'vault_secret_path', type: 'varchar', length: 500, nullable: true })
  vaultSecretPath!: string | null;

  @Exclude()
  @Column({ name: 'encrypted_password', type: 'text', nullable: true })
  encryptedPassword!: string | null;

  @Column({ name: 'use_ssl', default: true })
  useSsl!: boolean;

  @Column({ name: 'ssl_ca_cert', type: 'text', nullable: true })
  sslCaCert!: string | null;

  @Column({ name: 'connection_options', type: 'jsonb', default: '{}' })
  connectionOptions!: Record<string, unknown>;

  @Column({ name: 'last_tested_at', type: 'timestamptz', nullable: true })
  lastTestedAt!: Date | null;

  @Column({ name: 'last_test_status', type: 'varchar', length: 50, nullable: true })
  lastTestStatus!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
