import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsInt, IsString, Min } from 'class-validator';
import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../common/errors/domain-error';

class PresignDto {
  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = config.get('S3_BUCKET') ?? 'ims-files';
    this.s3 = new S3Client({
      region: config.get('S3_REGION') ?? 'us-east-1',
      endpoint: config.get('S3_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey: config.get('S3_SECRET_KEY') ?? 'minioadmin',
      },
    });
  }

  @Roles('ADMIN')
  @Post('presign')
  async presign(@Body() dto: PresignDto, @CurrentUser() user: AuthUser) {
    const id = randomUUID();
    const storageKey = `uploads/${id}/${dto.fileName}`;

    const file = await this.prisma.fileObject.create({
      data: {
        id,
        storageKey,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        sizeBytes: BigInt(dto.sizeBytes),
        uploadedById: user.id,
      },
    });

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: dto.mimeType,
      }),
      { expiresIn: 900 },
    );

    return {
      data: {
        id: file.id,
        uploadUrl,
        storageKey,
      },
    };
  }

  @Roles('VIEWER')
  @Get(':id')
  async get(@Param('id') id: string) {
    const file = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!file) throw new NotFoundError('File not found');

    const downloadUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
      }),
      { expiresIn: 900 },
    );

    return {
      data: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes.toString(),
        downloadUrl,
      },
    };
  }
}
