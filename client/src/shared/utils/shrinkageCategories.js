/**
 * Canonical shrinkage category list used by store managers, area managers,
 * and admin overrides. Must be kept in sync with the adminController template.
 *
 * Key   = category stored in DB (shrinkageCategory field)
 * Value = array of preset issue detail reasons (remarks field)
 */
export const SHRINKAGE_CATEGORIES = {
  Dented: [
    'Minor dent to packaging, product is ok',
    'Moderate dent to packaging, product with lesser impact',
    'Direct dent to product, product not ok',
    'Dented due to warehouse handling error',
    'Dented during transit/shipping',
  ],
  Expiry: [
    'Product has passed the expiry date',
    'Product has passed the particular date',
    'Expired stock identified during stock take',
    'Expired stock designated for return to vendor',
    'Expired stock designated for disposal',
  ],
  Damage: [
    'Physical breakage of product/component',
    'Physical scratches/abrasions on product/packaging',
    'Water exposure damage',
    'Fire/smoke exposure damage',
    'Electrical malfunction/damage',
    'Manufacturing defect identified',
    'Damage incurred during customer return process',
    'Unsaleable due to damage',
  ],
  'In Transit': [
    'Overage, Shortage, Damage (OS&D) report for transit damage',
    'Damage/issue due to cargo shift during transport',
    'Environmental exposure during transit (e.g., temperature, humidity)',
    'Pilferage suspected during transit',
    'Damage incurred due to transport accident',
    'Discrepancy between physical count and shipping documentation',
  ],
  Theft: [
    'Suspected internal theft',
    'Suspected external/shoplifting theft',
    'CCTV evidence of theft',
    'Theft during transit',
    'No evidence — stock unaccounted for',
  ],
  Miscount: [
    'Counting error by store team',
    'Counting error — recount confirmed correct',
    'System quantity mismatch (ERP error)',
    'Stock in transit not yet received',
  ],
  Transfer: [
    'Stock transferred to another store',
    'Stock returned to warehouse',
    'Inter-branch transfer in progress',
  ],
  Supplier: [
    'Short delivery from supplier',
    'Wrong quantity delivered by supplier',
    'Supplier return in progress',
    'Goods received note discrepancy',
  ],
  Other: [
    'Quality control hold, pending further inspection/decision',
    'Incorrect labeling identified on product/packaging',
    'Product subject to manufacturer recall',
    'Product deemed obsolete, no longer marketable',
    'Inventory adjustment due to system error/discrepancy',
    'Stock designated for donation',
    'Stock designated for sampling/testing',
    'Stock shared to national employees',
  ],
};

export const CATEGORY_NAMES = Object.keys(SHRINKAGE_CATEGORIES);
