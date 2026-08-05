import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

// Mirrors src/upload/upload.controller.ts's Cloudinary pattern, but reads
// credentials via ConfigService (falling back to the same account's
// existing hardcoded values as dev defaults) and uploads to a separate
// folder so early-access assets don't mix with the main app's uploads.
@Injectable()
export class EarlyAccessUploadService {
  constructor(private config: ConfigService) {
    cloudinary.config({
      cloud_name:
        this.config.get<string>('CLOUDINARY_CLOUD_NAME') || 'djuvxyklu',
      api_key:
        this.config.get<string>('CLOUDINARY_API_KEY') || '587314271732793',
      api_secret:
        this.config.get<string>('CLOUDINARY_API_SECRET') ||
        'mTTXKpBy5KPoEiC_Ar7qQhikFVM',
    });
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
