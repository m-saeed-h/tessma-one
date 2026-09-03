import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from './storage/s3.service';

// SEC-APP-06: type and magic-byte* verification, size limits, storage
// outside the web root, retrieval only via short-lived signed URLs.
// (*True magic-byte sniffing needs the actual bytes, which this process
// deliberately never touches — see S3Service. The MIME allowlist plus a size
// cap is the check available without giving up that property.)
//
// Malware scanning is named in the Charter as mandatory before storage; it
// is NOT wired into this slice. Claiming a scan without a scanner would be
// worse than admitting the gap — see README caveats for the honest status.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'text/csv', 'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface CreateUploadUrlInput {
  filename: string;
  mimeType: string;
  resourceType: string;
  resourceId: string;
}

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private s3: S3Service, private audit: AuditService) {}

  // Step 1 of 2: reserve a Document row and a signed PUT URL. The client
  // uploads bytes directly to object storage — the API process is never in
  // the data path.
  async createUploadUrl(tenantId: string, userId: string, input: CreateUploadUrlInput) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new BadRequestException({
        code: 'document.type_not_allowed',
        message: `File type "${input.mimeType}" is not permitted.`,
      });
    }

    return this.prisma.forTenant(tenantId, async (tx) => {
      const storageKey = `${tenantId}/${crypto.randomUUID()}/${sanitiseFilename(input.filename)}`;
      const document = await tx.document.create({
        data: {
          tenantId, resourceType: input.resourceType, resourceId: input.resourceId,
          filename: input.filename, mimeType: input.mimeType, storageKey,
          uploadedByUserId: userId, status: 'PENDING',
        },
      });
      const uploadUrl = await this.s3.presignPut(storageKey, input.mimeType);
      return { documentId: document.id, uploadUrl, expiresInSeconds: 300 };
    });
  }

  // Step 2 of 2: the client tells us the upload finished; we verify the
  // object actually exists (HEAD) and enforce the size cap before marking it
  // usable — a PENDING document that never gets confirmed simply never
  // becomes retrievable.
  async confirmUpload(tenantId: string, userId: string, documentId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const document = await tx.document.findUniqueOrThrow({ where: { id: documentId } });

      const head = await this.s3.head(document.storageKey).catch(() => null);
      if (!head) {
        throw new BadRequestException({
          code: 'document.not_uploaded',
          message: 'No file was found at the reserved upload location.',
        });
      }

      const sizeBytes = Number(head.ContentLength ?? 0);
      if (sizeBytes > MAX_UPLOAD_BYTES) {
        await tx.document.update({ where: { id: documentId }, data: { status: 'REJECTED' } });
        throw new BadRequestException({
          code: 'document.too_large',
          message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`,
        });
      }

      const updated = await tx.document.update({
        where: { id: documentId },
        data: { status: 'UPLOADED', sizeBytes: BigInt(sizeBytes), checksum: head.ETag?.replace(/"/g, '') },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'document.uploaded', resourceType: 'Document', resourceId: documentId,
        after: { filename: document.filename, sizeBytes },
      });
      return updated;
    });
  }

  async getDownloadUrl(tenantId: string, documentId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const document = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
      if (document.status !== 'UPLOADED') {
        throw new BadRequestException({ code: 'document.not_ready', message: 'This document has not finished uploading.' });
      }
      const downloadUrl = await this.s3.presignGet(document.storageKey);
      return { downloadUrl, expiresInSeconds: 300, filename: document.filename, mimeType: document.mimeType };
    });
  }

  async listForResource(tenantId: string, resourceType: string, resourceId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.document.findMany({ where: { tenantId, resourceType, resourceId }, orderBy: { createdAt: 'desc' } }),
    );
  }
}

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}
