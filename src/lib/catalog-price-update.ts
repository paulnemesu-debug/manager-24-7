import { calculateUnitPrice } from '@/lib/calculations';
import type { CatalogIngredient, CatalogPriceUpdate, SupplierOffer } from '@/types/recipe';

const supplierKey = (supplier: string) => supplier.trim().toLowerCase();

export function mergeCatalogPriceUpdate(
  entry: CatalogIngredient,
  update: CatalogPriceUpdate,
  updatedAt = new Date().toISOString(),
): CatalogIngredient {
  const supplier = update.supplier?.trim() || entry.supplier?.trim() || null;
  const offers = entry.offers ?? [];
  const matches = supplier ? offers.filter(offer => (
    offer.priceUnit === entry.priceUnit && supplierKey(offer.supplierName) === supplierKey(supplier)
  )) : [];
  const target = matches.find(offer => offer.isActive) ?? matches.reduce<SupplierOffer | undefined>(
    (latest, offer) => !latest || (offer.updatedAt ?? '') > (latest.updatedAt ?? '') ? offer : latest, undefined,
  );
  const activePrice = {
    unitPrice: update.purchasePrice, packageQuantity: null, packagePrice: null,
    source: update.source ?? null, sourceDate: update.sourceDate ?? null, isActive: true, updatedAt,
  };
  const nextOffers = offers.map(offer => offer.id === target?.id
    ? { ...offer, ...activePrice, supplierName: supplier ?? offer.supplierName }
    : offer.isActive ? { ...offer, isActive: false } : offer);
  if (supplier && !target) {
    nextOffers.push({
      id: `offer-import-${entry.id}-${supplierKey(supplier)}`,
      supplierName: supplier, priceUnit: entry.priceUnit, ...activePrice,
    });
  }
  return {
    ...entry, supplier, purchasePrice: update.purchasePrice, packagePrice: null, packageQuantity: null,
    priceSource: update.source ?? null, priceSourceDate: update.sourceDate ?? null, offers: nextOffers, updatedAt,
  };
}

/** Older imports updated the catalog header without its active offer or pack. */
export function reconcileImportedCatalogPrice(entry: CatalogIngredient): CatalogIngredient {
  if (entry.priceSource !== 'supplier_import' && !entry.priceSource?.startsWith('invoice:')) return entry;
  const active = entry.offers?.find(offer => offer.isActive);
  const packPrice = calculateUnitPrice(entry.packagePrice, entry.packageQuantity);
  const mismatchedOffer = active && (
    active.unitPrice !== entry.purchasePrice || active.priceUnit !== entry.priceUnit
    || active.supplierName !== entry.supplier || (active.source && active.source !== entry.priceSource)
    || (active.sourceDate && active.sourceDate !== entry.priceSourceDate)
  );
  if (!mismatchedOffer && (packPrice === null || packPrice === entry.purchasePrice)) return entry;
  return mergeCatalogPriceUpdate(entry, {
    id: entry.id, purchasePrice: entry.purchasePrice, supplier: entry.supplier,
    source: entry.priceSource, sourceDate: entry.priceSourceDate,
  }, entry.updatedAt);
}
