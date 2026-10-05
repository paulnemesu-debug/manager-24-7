import type { FoodProductOrigin, WasteMeasure } from '@/types/waste-compliance';

export const MODEL_WASTE_MEASURES: WasteMeasure[] = [
  'staff_training',
  'production_planning',
  'fifo',
  'discount_sale',
  'consumer_redistribution',
  'receiver_donation',
];

export const MODEL_WASTE_OBJECTIVES = `OBIECTIV GENERAL
Reducerea cu minimum 10% a cantității și valorii risipei alimentare față de anul anterior, prin măsurare lunară și intervenție înainte ca alimentele să devină deșeu.

1. PREVENIRE LA APROVIZIONARE ȘI PRODUCȚIE
Responsabil: manager operațional / bucătar-șef. Frecvență: zilnic și săptămânal.
• comenzi corelate cu vânzările, rezervările și stocul real;
• praguri minime/maxime și inventar rotativ;
• plan de producție pe preparat, porționare standard și reutilizare sigură în limitele planului HACCP;
• evidență: comenzi, inventare, fișe de producție și registrul de risipă.

2. STOCARE ȘI TERMENE
Responsabil: gestionar / șef de tură. Frecvență: la recepție și zilnic.
• aplicarea FIFO/FEFO, etichetare și verificarea temperaturii;
• listă zilnică a produselor cu termen apropiat;
• evidență: NIR, etichete, fișe HACCP și inventar.

3. VALORIFICARE ÎNAINTE DE NEUTRALIZARE
Responsabil: manager unitate. Frecvență: înainte de expirare și la închiderea turei.
• vânzare accelerată/reducere unde este permis;
• oferirea la pachet, fără cost suplimentar, a alimentelor neconsumate de client;
• redistribuire către consumatori sau operatori receptori eligibili, în baza documentelor și contractelor;
• produsele neconforme ori cu siguranță incertă nu se redistribuie și se înregistrează în registrul de risipă.

4. MONITORIZARE
Indicatori lunari: kg risipă, valoare risipă, kg redistribuite, valoare redistribuită și primele 5 cauze.
Analiză: lunar; plan de acțiune: pentru orice creștere peste 10% sau abatere repetată.
Păstrarea documentelor: minimum 3 ani, împreună cu documentele justificative.`;

export const FOOD_ORIGIN_LABELS: Record<FoodProductOrigin, string> = {
  animal: 'Produse de origine animală',
  plant: 'Produse de origine nonanimală / vegetală',
  prepared_food: 'Produse donate de unitatea de alimentație publică',
};

export const WASTE_REASON_LABELS: Record<string, string> = {
  expired: 'Termen depășit',
  preparation: 'Pierdere la preparare',
  overproduction: 'Supraproducție',
  quality: 'Calitate necorespunzătoare',
  plate: 'Resturi din farfurie',
  other: 'Alt motiv',
};

export const WASTE_DOSSIER_CHECKLIST = [
  'Planul anual este completat, aprobat intern și publicat/declarat conform obligațiilor aplicabile.',
  'Sunt selectate și aplicate minimum două măsuri de prevenire înainte de neutralizare.',
  'Există contracte/documente pentru operatorii receptori și datele lor de autorizare sunt verificate.',
  'Fiecare transfer are cantitate în kg, categorie, valoare, receptor/CUI și document justificativ.',
  'Produsele neconforme sau cu siguranță incertă sunt blocate de la redistribuire și trecute la risipă.',
  'Planul, raportul anual, registrele și documentele justificative sunt păstrate minimum 3 ani.',
] as const;

export function quantityInKg(quantity: number, unit: string, explicitKg = 0) {
  if (explicitKg > 0) return explicitKg;
  if (unit === 'kg') return quantity;
  if (unit === 'g') return quantity / 1_000;
  return 0;
}
