import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

// Mirrors src/upload/upload.controller.ts's Cloudinary pattern — credentials
// come from env only. A previous version of this file fell back to a
// hardcoded cloud_name/api_key/api_secret, which meant that account's
// secret was committed to source control; it has since been rotated and
// the fallback removed. Missing env vars now fail loudly instead of
// silently uploading through a fallback account.
@Injectable()
export class EarlyAccessUploadService {
  constructor(private config: ConfigService) {
    const cloud_name = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key = this.config.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloud_name || !api_key || !api_secret) {
      throw new InternalServerErrorException(
        'Cloudinary credentials are not configured',
      );
    }
    cloudinary.config({ cloud_name, api_key, api_secret });
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const urls: string[] = [];
    for (const file of files) {
      const url = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'kentexa-early-access',
            resource_type: 'image',
            transformation: [
              { quality: 'auto', fetch_format: 'auto' },
              { width: 1200, crop: 'limit' },
            ],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result!.secure_url);
          },
        );
        stream.end(file.buffer);
      });
      urls.push(url);
    }
    return urls;
  }
}
