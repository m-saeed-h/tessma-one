import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { validate } from '../../shared/validation/validate';
import { serialise } from '../../shared/http/serialise';
import { DocumentsService } from './documents.service';

const createUploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  resourceType: z.string().trim().min(1).max(100),
  resourceId: z.string().trim().min(1).max(200),
});

const listQuerySchema = z.object({
  resourceType: z.string().trim().min(1).max(100),
  resourceId: z.string().trim().min(1).max(200),
});

@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post('upload-url')
  createUploadUrl(@Req() req: any, @Body() body: unknown) {
    const b = validate(createUploadUrlSchema, body);
    return this.documents.createUploadUrl(req.ctx.tenantId, req.ctx.userId, b);
  }

  @Post(':id/confirm')
  async confirm(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.documents.confirmUpload(req.ctx.tenantId, req.ctx.userId, id));
  }

  @Get(':id/download-url')
  downloadUrl(@Req() req: any, @Param('id') id: string) {
    return this.documents.getDownloadUrl(req.ctx.tenantId, id);
  }

  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.documents.listForResource(req.ctx.tenantId, q.resourceType, q.resourceId));
  }
}
