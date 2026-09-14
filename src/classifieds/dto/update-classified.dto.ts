import { PartialType } from '@nestjs/swagger';
import { CreateClassifiedDto } from './create-classified.dto';

// Keep edit validation aligned with creation while allowing true PATCH
// payloads. This also preserves flash-sale fields through whitelist:true.
export class updateClassifiedDto extends PartialType(CreateClassifiedDto) {}