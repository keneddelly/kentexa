import { ConfigService } from '@nestjs/config';
import { EarlyAccessUploadService } from './early-access-upload.service';

describe('isolated staging media', () => {
  it('boots without Cloudinary credentials and rejects uploads', async () => {
    const config = { get: (key: string) => key === 'STAGE3KR_DISABLE_UPLOADS' ? 'true' : undefined };
    const service = new EarlyAccessUploadService(config as ConfigService);
    await expect(service.uploadFiles([{ buffer: Buffer.from('image') } as Express.Multer.File]))
      .rejects.toThrow('Uploads are disabled in isolated staging');
  });
});
