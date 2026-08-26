import { Controller, Get } from '@nestjs/common';
import { CATEGORIES } from './categories.data';

@Controller('categories')
export class CategoriesController {
  // Public — the single source of truth every frontend category/subcategory
  // dropdown should fetch from, instead of hardcoding its own list.
  @Get()
  findAll() {
    return Object.entries(CATEGORIES).map(([key, def]) => ({
      key,
      label: def.label,
      icon: def.icon,
      isDigital: !!def.isDigital,
      subcategories: Object.entries(def.subcategories).map(
        ([subKey, subDef]) => ({
          key: subKey,
          label: subDef.label,
          specs: subDef.specs || [],
        }),
      ),
    }));
  }
}
