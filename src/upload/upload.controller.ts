import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/auth.guard';
import { v2 as cloudinary } from 'cloudinary';

// ✅ Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Controller('upload')
export class UploadController {
  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(), // store in memory then upload to Cloudinary
      fileFilter: (req, file, cb) => {
        // heic/heif added for native camera captures (iOS shoots HEIC by
        // default) — Cloudinary decodes it fine and fetch_format:'auto'
        // below re-encodes to whatever's optimal for the requesting client.
        const allowed = /jpeg|jpg|png|webp|heic|heif/;
        const valid = allowed.test(extname(file.originalname).toLowerCase());
        if (valid) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only images allowed'), false);
        }
      },
      // 15MB — modern phone camera photos (esp. native, uncompressed by a
      // browser file picker) routinely exceed the old 5MB ceiling.
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const urls: string[] = [];

    for (const file of files) {
      // Upload buffer directly to Cloudinary
      const url = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'kentexa',
            resource_type: 'image',
            transformation: [
              { quality: 'auto', fetch_format: 'auto' }, // auto optimize
              { width: 1200, crop: 'limit' }, // max width 1200px
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

    return { urls };
  }
}
