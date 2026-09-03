import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_TTL_SECONDS = 300;

// Charter §5.2 platform/documents: "object storage abstraction" — S3-compatible
// storage (Charter §8), MinIO locally, a real S3-compatible provider in
// production, same code either way. The API process never reads or writes
// file bytes itself (SEC-APP-06 / Build Guide §5: "never save files onto the
// server's own disk") — it only issues short-lived signed URLs the client
// uploads/downloads through directly.
//
// Two clients, deliberately: the API container reaches MinIO over the
// compose network (`minio:9000`), but a signed URL is followed by the
// BROWSER, which can only reach the published host port (`localhost:9000`).
// Signing with the internal hostname would bake an unreachable host into
// every upload/download link. `internal` does the API's own server-to-server
// calls (bucket bootstrap, confirming an upload landed); `signing` exists
// only to compute presigned URLs against the host the browser can actually
// reach. In production both envs point at the same real endpoint and this
// collapses to one client in practice.
@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger('S3Service');
  private readonly internal: S3Client;
  private readonly signing: S3Client;
  readonly bucket = process.env.S3_BUCKET ?? 'tessma-documents';

  constructor() {
    const region = process.env.S3_REGION ?? 'us-east-1';
    const credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY ?? 'tessma',
      secretAccessKey: process.env.S3_SECRET_KEY ?? 'tessma12345',
    };
    const internalEndpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? internalEndpoint;

    this.internal = new S3Client({ region, endpoint: internalEndpoint, forcePathStyle: true, credentials });
    this.signing = publicEndpoint === internalEndpoint
      ? this.internal
      : new S3Client({ region, endpoint: publicEndpoint, forcePathStyle: true, credentials });
  }

  // Self-healing bucket creation with retry: docker-compose does not gate the
  // API's startup on MinIO's readiness (no health-checkable endpoint without
  // extra tooling in the base image — see docker-compose.yml), so this
  // absorbs the race instead of requiring one.
  async onModuleInit() {
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return;
      } catch {
        try {
          await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
          return;
        } catch {
          if (attempt === 10) {
            this.logger.warn(
              `Could not confirm or create bucket "${this.bucket}" after ${attempt} attempts — ` +
              'document upload will fail until object storage is reachable.',
            );
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async presignPut(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.signing, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  async presignGet(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.signing, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  async head(key: string) {
    return this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
