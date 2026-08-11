import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// Every field from CreateProductDto, made optional, with the same
// validation decorators preserved — derived automatically so this can't
// drift out of sync the way the old hand-written version did (it was
// missing basePrice, deliveryFee, subcategory, model, specs, features,
// shippingMethod, estimatedDelivery, shippingNotes, and weightKg).
export class UpdateProductDto extends PartialType(CreateProductDto) {}
