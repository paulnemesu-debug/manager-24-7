/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Allergen } from '@/constants/allergens';

/**
 * Pictograme simple pentru cei 14 alergeni, folosite pe fișa tehnică tipărită.
 * Toate au același `viewBox` 24×24 și desenează cu `currentColor`, ca să poată
 * fi colorate din CSS. Sunt intenționat schematice: pe hârtie, la 14 px, un
 * desen detaliat devine o pată. Fiecare pictogramă apare mereu însoțită de
 * denumirea alergenului, deci nu trebuie să fie recognoscibilă singură.
 */
export const ALLERGEN_ICON_PATHS: Record<Allergen, string> = {
  // Spic de grâu
  gluten: '<path d="M12 21V9" /><path d="M12 9c0-2.2-1.3-3.6-3.2-4.2C8.4 6.9 9.6 8.5 12 9Z" /><path d="M12 9c0-2.2 1.3-3.6 3.2-4.2C15.6 6.9 14.4 8.5 12 9Z" /><path d="M12 13.5c0-2.2-1.3-3.6-3.2-4.2C8.4 11.4 9.6 13 12 13.5Z" /><path d="M12 13.5c0-2.2 1.3-3.6 3.2-4.2C15.6 11.4 14.4 13 12 13.5Z" /><path d="M12 18c0-2.2-1.3-3.6-3.2-4.2C8.4 15.9 9.6 17.5 12 18Z" /><path d="M12 18c0-2.2 1.3-3.6 3.2-4.2C15.6 15.9 14.4 17.5 12 18Z" />',
  // Crevete
  crustacea: '<path d="M18.2 7.4c-4.8 0-8.6 3.2-8.6 6.6 0 2.4 1.8 4 4.1 4 2.6 0 4.6-1.7 5.4-3.7" /><path d="M18.2 7.4l3.3-1.7-.3 3.6" /><path d="M12.8 10.6c.7.6 1.2 1.4 1.4 2.3M15.6 9.2c.6.7 1 1.5 1.2 2.4" /><path d="M9.7 12.6 5 10.2M10 15.6 5.2 16.9" /><circle cx="16.6" cy="9.4" r=".85" />',
  // Ou
  eggs: '<path d="M12 3c3.3 0 6 4.3 6 8.4 0 4-2.6 6.6-6 6.6s-6-2.6-6-6.6C6 7.3 8.7 3 12 3Z" /><circle cx="12" cy="12" r="2.6" />',
  // Pește
  fish: '<path d="M3 12c2.6-3.4 5.8-5 9-5s6.4 1.6 9 5c-2.6 3.4-5.8 5-9 5s-6.4-1.6-9-5Z" /><path d="M21 12c-1.2-1.6-2.4-2.1-2.4-2.1M21 12c-1.2 1.6-2.4 2.1-2.4 2.1" /><path d="M3 8.5 6.5 12 3 15.5" /><circle cx="8.5" cy="11" r=".9" />',
  // Arahidă în coajă
  peanuts: '<path d="M4 12c0-2.6 1.6-4.5 4-4.5 1.5 0 2.6.8 3.3 1.8.5.7 1.1 1.1 1.7 1.1s1.2-.4 1.7-1.1c.7-1 1.8-1.8 3.3-1.8 2.4 0 4 1.9 4 4.5s-1.6 4.5-4 4.5c-1.5 0-2.6-.8-3.3-1.8-.5-.7-1.1-1.1-1.7-1.1s-1.2.4-1.7 1.1c-.7 1-1.8 1.8-3.3 1.8-2.4 0-4-1.9-4-4.5Z" /><circle cx="7.6" cy="11.4" r=".8" /><circle cx="17.4" cy="12.6" r=".8" />',
  // Păstaie de soia
  soy: '<ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-38 12 12)" /><circle cx="8.5" cy="14.8" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="15.5" cy="9.2" r="1.6" />',
  // Cutie de lapte
  milk: '<path d="M8 9h8v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9Z" /><path d="M8 9 10 4h4l2 5" /><path d="M10 4h4" /><path d="M10.5 13.5h3" />',
  // Alună
  nuts: '<path d="M12 20c-3.6 0-6.2-2.5-6.2-6 0-3.8 2.8-6.6 6.2-6.6S18.2 10.2 18.2 14c0 3.5-2.6 6-6.2 6Z" /><path d="M7.5 8.6C8.6 6 10.1 4.6 12 4.6s3.4 1.4 4.5 4" /><path d="M12 7.4V4.6" />',
  // Țelină
  celery: '<path d="M12 21V9" /><path d="M9 21V10.5" /><path d="M15 21V10.5" /><path d="M12 9C10.2 9 8.6 7.6 8 5.6c2.2-.6 3.6.3 4 1.6" /><path d="M12 9c1.8 0 3.4-1.4 4-3.4-2.2-.6-3.6.3-4 1.6" /><path d="M8 21h8" />',
  // Sticlă de muștar
  mustard: '<path d="M10 8h4v11a2 2 0 0 1-2 2 2 2 0 0 1-2-2V8Z" /><path d="M10.7 8V5.4h2.6V8" /><path d="M11.2 5.4V3.6h1.6v1.8" /><path d="M10 12.5h4" />',
  // Semințe de susan
  sesame: '<ellipse cx="8.6" cy="9.4" rx="2" ry="3.1" transform="rotate(-28 8.6 9.4)" /><ellipse cx="15.6" cy="10.4" rx="2" ry="3.1" transform="rotate(24 15.6 10.4)" /><ellipse cx="11.6" cy="16" rx="2" ry="3.1" transform="rotate(-8 11.6 16)" />',
  // SO2
  sulphites: '<circle cx="12" cy="12" r="9" /><text x="12" y="15.4" text-anchor="middle" font-size="7.4" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="currentColor" stroke="none">SO2</text>',
  // Lupin
  lupin: '<path d="M12 21v-7" /><path d="M12 14c-2.6 0-4-1.5-4-3.4 2.6 0 4 1.5 4 3.4Z" /><path d="M12 14c2.6 0 4-1.5 4-3.4-2.6 0-4 1.5-4 3.4Z" /><path d="M12 10.6c-2.2 0-3.4-1.3-3.4-2.9 2.2 0 3.4 1.3 3.4 2.9Z" /><path d="M12 10.6c2.2 0 3.4-1.3 3.4-2.9-2.2 0-3.4 1.3-3.4 2.9Z" /><path d="M12 7.7c0-1.7.8-2.9 2-3.7.4 1.9-.5 3.3-2 3.7Z" /><path d="M9 21h6" />',
  // Scoică
  molluscs: '<path d="M12 19.5c-4.4 0-8-3.4-8-7.6C4 7.6 7.6 4.5 12 4.5s8 3.1 8 7.4c0 4.2-3.6 7.6-8 7.6Z" /><path d="M12 19.5V4.5" /><path d="M8.3 18.6 9.8 5.2" /><path d="M15.7 18.6 14.2 5.2" /><path d="M5 14.4 6.6 6" /><path d="M19 14.4 17.4 6" />',
};

/** Pictograma completă, gata de inserat în fișa HTML. */
export function allergenIconSvg(allergen: Allergen, size = 16): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ALLERGEN_ICON_PATHS[allergen]}</svg>`;
}
