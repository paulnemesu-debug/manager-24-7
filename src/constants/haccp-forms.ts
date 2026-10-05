/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import type { Locale } from '@/i18n/translations';

export type LocalizedText = Record<Locale, string>;
export type HaccpFieldType = 'text' | 'multiline' | 'number' | 'date' | 'time' | 'temperature' | 'choice' | 'signature';
export type HaccpFormCategory = 'personnel' | 'pest' | 'sanitation' | 'production' | 'storage' | 'reception';

export type HaccpChoice = {
  value: string;
  label: LocalizedText;
};

export type HaccpFieldDefinition = {
  key: string;
  label: LocalizedText;
  type: HaccpFieldType;
  required?: boolean;
  placeholder?: LocalizedText;
  options?: readonly HaccpChoice[];
  defaultValue?: '@today' | '@month' | '@year' | string;
  criticalMin?: number | null;
  criticalMax?: number | null;
};

export type HaccpFormDefinition = {
  code: string;
  title: LocalizedText;
  shortTitle: LocalizedText;
  category: HaccpFormCategory;
  icon: string;
  layout: 'table' | 'matrix' | 'declaration';
  orientation: 'portrait' | 'landscape';
  documentFields: readonly HaccpFieldDefinition[];
  rowFields: readonly HaccpFieldDefinition[];
  axisOrder?: readonly string[];
  instructions?: LocalizedText;
  rules?: readonly LocalizedText[];
};

const tx = (ro: string, en: string): LocalizedText => ({ ro, en });
const option = (value: string, ro: string, en: string): HaccpChoice => ({ value, label: tx(ro, en) });

const YES_NO = [option('yes', 'Da', 'Yes'), option('no', 'Nu', 'No'), option('na', 'N/A', 'N/A')] as const;
const HAVE_NOT_HAVE = [option('yes', 'Am', 'I have'), option('no', 'Nu am', 'I do not have')] as const;
const CONFORMITY = [option('conform', 'Conform', 'Conform'), option('nonconform', 'Neconform', 'Non-conform')] as const;
const SERVICE = [option('disinsection', 'Dezinsecție', 'Disinsection'), option('deratization', 'Deratizare', 'Rodent control')] as const;
const PRODUCT_CATEGORY = [
  option('meat', 'Carne (C)', 'Meat (C)'),
  option('vegetables', 'Legume (Le)', 'Vegetables (Le)'),
  option('dairy', 'Lactate (L)', 'Dairy (L)'),
  option('other', 'Altele', 'Other'),
] as const;

const locationField = (label = tx('Locație', 'Location')): HaccpFieldDefinition => ({
  key: 'location', label, type: 'text', required: true, placeholder: tx('Ex: Bucătărie centrală', 'e.g. Central kitchen'),
});
const monthField: HaccpFieldDefinition = { key: 'month', label: tx('Luna', 'Month'), type: 'number', required: true, defaultValue: '@month' };
const yearField: HaccpFieldDefinition = { key: 'year', label: tx('Anul', 'Year'), type: 'number', required: true, defaultValue: '@year' };
const periodField: HaccpFieldDefinition = { key: 'period', label: tx('Luna / Anul', 'Month / Year'), type: 'text', required: true, placeholder: tx('Ex: 09/2026', 'e.g. 09/2026') };
const dateField: HaccpFieldDefinition = { key: 'date', label: tx('Data', 'Date'), type: 'date', required: true, defaultValue: '@today' };
const formDateField: HaccpFieldDefinition = { key: 'form_date', label: tx('Data fișei', 'Record date'), type: 'date', required: true, defaultValue: '@today' };
const signature = (key = 'signature', label = tx('Identitate / Semnătură', 'Identity / Signature')): HaccpFieldDefinition => ({ key, label, type: 'signature', required: true });
const yesNo = (key: string, ro: string, en: string, required = true): HaccpFieldDefinition => ({
  key, label: tx(ro, en), type: 'choice', options: YES_NO, required,
});
const temp = (key: string, ro: string, en: string, required = false): HaccpFieldDefinition => ({ key, label: tx(ro, en), type: 'temperature', required });
const dayAxis: HaccpFieldDefinition = { key: 'day', label: tx('Ziua', 'Day'), type: 'number', required: true };
const monthAxis: HaccpFieldDefinition = {
  key: 'month_axis',
  label: tx('Luna', 'Month'),
  type: 'choice',
  required: true,
  options: [
    option('01', 'IAN.', 'JAN'), option('02', 'FEBR.', 'FEB'), option('03', 'MART.', 'MAR'),
    option('04', 'APR.', 'APR'), option('05', 'MAI', 'MAY'), option('06', 'IUN.', 'JUN'),
    option('07', 'IUL.', 'JUL'), option('08', 'AUG.', 'AUG'), option('09', 'SEPT.', 'SEP'),
    option('10', 'OCT.', 'OCT'), option('11', 'NOV.', 'NOV'), option('12', 'DEC.', 'DEC'),
  ],
};

const DAY_ORDER = Array.from({ length: 31 }, (_, index) => String(index + 1));
const MONTH_ORDER = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

export const HACCP_CATEGORY_LABELS: Record<HaccpFormCategory, LocalizedText> = {
  personnel: tx('Personal și vizitatori', 'Staff and visitors'),
  pest: tx('Control dăunători', 'Pest control'),
  sanitation: tx('Igienă și autocontrol', 'Hygiene and self-control'),
  production: tx('Producție', 'Production'),
  storage: tx('Depozitare și temperaturi', 'Storage and temperatures'),
  reception: tx('Recepție marfă', 'Goods reception'),
};

const BASE_HACCP_FORMS: readonly HaccpFormDefinition[] = [
  {
    code: 'FO-H-04-01',
    title: tx('Fișa zilnică de urmărire a stării de igienă și sănătate a personalului', 'Daily staff hygiene and health monitoring sheet'),
    shortTitle: tx('Igiena și sănătatea personalului', 'Staff hygiene and health'),
    category: 'personnel', icon: 'people-outline', layout: 'matrix', orientation: 'landscape',
    documentFields: [monthField, yearField, locationField()], axisOrder: DAY_ORDER,
    rowFields: [
      dayAxis,
      yesNo('hygiene_check', 'Responsabilul cu igiena a efectuat verificarea?', 'Did the hygiene lead perform the check?'),
      yesNo('equipment_clean', 'Echipamentul personalului este curat și complet?', 'Is staff clothing clean and complete?'),
      yesNo('fit_for_work', 'Starea sănătății permite admiterea la lucru?', 'Is the employee fit for work?'),
      yesNo('hands_clear', 'Personalul este fără leziuni ale mâinilor?', 'Are staff members free from hand lesions?'),
      yesNo('changing_filter', 'Personalul a trecut prin filtrul vestiar?', 'Did staff pass through the changing-room hygiene filter?'),
      yesNo('new_restrictions', 'Există restricții noi de igienă comunicate?', 'Were new hygiene restrictions communicated?'),
      yesNo('temperature_checked', 'S-a monitorizat temperatura la intrarea în program?', 'Was temperature checked at the start of the shift?'),
      { key: 'monitoring_time', label: tx('Ora monitorizării', 'Monitoring time'), type: 'time' },
      { key: 'supervisor', label: tx('Bucătar șef / Supervizor', 'Head chef / Supervisor'), type: 'text', required: true },
      signature(),
      { key: 'corrective_action', label: tx('Măsuri corective / Observații', 'Corrective action / Notes'), type: 'multiline' },
    ],
    instructions: tx('Orice neconformitate se consemnează și se aplică măsuri corective.', 'Record every non-conformity and apply corrective action.'),
  },
  {
    code: 'FO-H-05-01',
    title: tx('Registru dezinsecție / deratizare', 'Disinsection / rodent-control register'),
    shortTitle: tx('Registru DDD', 'Pest service register'), category: 'pest', icon: 'bug-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), yearField],
    rowFields: [dateField, { key: 'service', label: tx('Serviciul prestat', 'Service'), type: 'choice', options: SERVICE, required: true }, { key: 'report_number', label: tx('Proces-verbal / Observații', 'Service report / Notes'), type: 'text' }, signature('responsible')],
    instructions: tx('Anexați procesele-verbale ale firmei autorizate.', 'Attach the reports issued by the authorised contractor.'),
  },
  {
    code: 'FO-H-05-02',
    title: tx('Fișă de evidență a controlului dezinsecției și deratizării', 'Disinsection and rodent-control inspection sheet'),
    shortTitle: tx('Control DDD', 'Pest-control inspection'), category: 'pest', icon: 'shield-checkmark-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), yearField],
    rowFields: [
      dateField,
      { key: 'control', label: tx('Controlul efectuat', 'Inspection performed'), type: 'choice', required: true, options: [option('traps', 'Capcane anti-rozătoare', 'Rodent traps'), option('fly_killer', 'Dispozitive fly-killer', 'Fly-killer devices'), option('other', 'Alt control', 'Other inspection')] },
      { key: 'trap_count', label: tx('Număr capcane / dispozitive', 'Number of traps / devices'), type: 'number' },
      { key: 'result', label: tx('Rezultatul controlului', 'Inspection result'), type: 'text', required: true },
      { key: 'corrective_action', label: tx('Corecții / Măsuri corective', 'Corrections / Corrective action'), type: 'multiline' },
      signature('responsible'),
    ],
  },
  {
    code: 'FO-H-06-02',
    title: tx('Fișă evidență igienizări', 'Cleaning and disinfection record'),
    shortTitle: tx('Evidență igienizări', 'Cleaning records'), category: 'sanitation', icon: 'sparkles-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), periodField],
    rowFields: [
      { key: 'surface', label: tx('Suprafața curățată / dezinfectată', 'Surface cleaned / disinfected'), type: 'text', required: true },
      { key: 'when', label: tx('Când', 'When'), type: 'text', required: true, placeholder: tx('Data și ora', 'Date and time') },
      { key: 'product', label: tx('Cu ce', 'Product / Method'), type: 'text', required: true },
      signature('cleaned_by', tx('Persoana care efectuează curățenia', 'Cleaned by')),
      signature('checked_by', tx('Control', 'Checked by')),
    ],
  },
  {
    code: 'FO-H-06-03',
    title: tx('Fișă potabilitate apă - control organoleptic zilnic', 'Water potability sheet - daily organoleptic inspection'),
    shortTitle: tx('Potabilitate apă', 'Water potability'), category: 'sanitation', icon: 'water-outline', layout: 'matrix', orientation: 'landscape',
    documentFields: [monthField, yearField, locationField()], axisOrder: DAY_ORDER,
    rowFields: [
      dayAxis,
      yesNo('colour_ok', 'Apa este fără modificări de culoare?', 'Is the water free from colour changes?'),
      yesNo('smell_ok', 'Apa este fără modificări de miros?', 'Is the water free from odour changes?'),
      yesNo('taste_ok', 'Apa este fără modificări de gust?', 'Is the water free from taste changes?'),
      yesNo('turbidity_ok', 'Apa este fără turbiditate vizibilă?', 'Is the water free from visible turbidity?'),
      { key: 'operator_code', label: tx('Simbol operator', 'Operator code'), type: 'text', required: true },
      signature(),
      { key: 'corrective_action', label: tx('Măsuri corective / Observații', 'Corrective action / Notes'), type: 'multiline' },
    ],
    instructions: tx('Orice modificare se raportează imediat; apa nu se utilizează până la clarificare.', 'Report any change immediately; do not use the water until the issue is clarified.'),
  },
  {
    code: 'FO-H-06-04',
    title: tx('Registru recoltare teste rapide', 'Rapid-test sampling register'),
    shortTitle: tx('Teste rapide', 'Rapid tests'), category: 'sanitation', icon: 'flask-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), periodField],
    rowFields: [
      dateField,
      { key: 'surface', label: tx('Suprafața de recoltare', 'Sampling surface'), type: 'text', required: true },
      { key: 'colour', label: tx('Culoare obținută', 'Colour obtained'), type: 'text' },
      { key: 'interpretation', label: tx('Interpretare rezultate', 'Result interpretation'), type: 'text', required: true },
      { key: 'corrective_action', label: tx('Măsuri corective', 'Corrective action'), type: 'multiline' },
      { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true },
      signature(),
    ],
  },
  {
    code: 'FO-H-07-01',
    title: tx('Fișă de consum materii prime, ingrediente și ambalaje în bucătărie', 'Kitchen raw-material, ingredient and packaging usage sheet'),
    shortTitle: tx('Consum materii prime', 'Raw-material usage'), category: 'production', icon: 'cube-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), periodField],
    rowFields: [
      { key: 'item', label: tx('Materie primă / Ingredient / Ambalaj', 'Raw material / Ingredient / Packaging'), type: 'text', required: true },
      { key: 'lot_expiry', label: tx('Număr lot / Dată expirare', 'Lot number / Expiry date'), type: 'text' },
      { ...dateField, key: 'usage_date', label: tx('Data utilizării', 'Usage date') },
      { key: 'quantity', label: tx('Cantitate', 'Quantity'), type: 'number', required: true },
      { key: 'unit', label: tx('UM', 'Unit'), type: 'text', required: true },
      { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true },
      signature(),
    ],
  },
  {
    code: 'FO-H-10-01',
    title: tx('Declarație vizitatori și reguli interne', 'Visitor declaration and internal rules'),
    shortTitle: tx('Declarație vizitatori', 'Visitor declaration'), category: 'personnel', icon: 'id-card-outline', layout: 'declaration', orientation: 'portrait',
    documentFields: [
      { key: 'visitor_name', label: tx('Nume și prenume vizitator', 'Visitor full name'), type: 'text', required: true },
      { key: 'organisation', label: tx('Instituția / Organizația', 'Institution / Organisation'), type: 'text', required: true },
      dateField,
      { key: 'foodborne_disease', label: tx('Cunoștință de a fi purtător al unei boli transmisibile prin alimente', 'Knowledge of carrying a foodborne transmissible disease'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'pathogens', label: tx('Cunoștință că sunt purtător de agenți patogeni', 'Knowledge of carrying pathogens'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'infected_wounds', label: tx('Plăgi infectate', 'Infected wounds'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'skin_infections', label: tx('Infecții cutanate / eczeme', 'Skin infections / eczema'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'diarrhoea', label: tx('Boală diareică acută', 'Acute diarrhoeal illness'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'vomiting', label: tx('Vărsături', 'Vomiting'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'sore_throat', label: tx('Dureri în gât cu febră', 'Sore throat with fever'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'discharge', label: tx('Scurgeri din urechi, ochi sau nas', 'Discharge from ears, eyes or nose'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      { key: 'other_disease', label: tx('Alte forme de boală transmisibilă prin alimente', 'Other illness transmissible through food'), type: 'choice', options: HAVE_NOT_HAVE, required: true },
      yesNo('rules_acknowledged', 'Am citit și accept regulile interne', 'I have read and accept the internal rules'),
      signature('visitor_signature', tx('Nume / Semnătură vizitator', 'Visitor name / Signature')),
    ],
    rowFields: [],
    rules: [
      tx('Utilizează echipamentul de protecție pus la dispoziție.', 'Wear the protective equipment provided.'),
      tx('Schimbă echipamentul de protecție în zonele indicate de însoțitor.', 'Change protective equipment in the areas indicated by the escort.'),
      tx('Respectă circuitele interne stabilite.', 'Follow the established internal routes.'),
      tx('Rămâi permanent lângă însoțitor.', 'Remain with the escort at all times.'),
      tx('Nu atinge alimentele, ambalajele, echipamentele sau ustensilele.', 'Do not touch food, packaging, equipment or utensils.'),
      tx('Nu întreprinde acțiuni care pot afecta siguranța alimentelor.', 'Do not take actions that may compromise food safety.'),
    ],
  },
  {
    code: 'FO-H-11-01',
    title: tx('Program autocontrol anual', 'Annual self-control programme'),
    shortTitle: tx('Program autocontrol', 'Self-control programme'), category: 'sanitation', icon: 'calendar-outline', layout: 'matrix', orientation: 'landscape',
    documentFields: [locationField(tx('Locație / Proiect', 'Location / Project')), yearField, signature('prepared_by', tx('Întocmit', 'Prepared by')), signature('approved_by', tx('Aprobat', 'Approved by'))], axisOrder: MONTH_ORDER,
    rowFields: [
      monthAxis,
      { key: 'water', label: tx('Apă - MB Enterococi, E. coli', 'Water - Enterococci, E. coli'), type: 'text' },
      { key: 'finished_product', label: tx('Produs finit - Listeria, Salmonella, NTG', 'Finished product - Listeria, Salmonella, TVC'), type: 'text' },
      { key: 'quantitative_sanitation', label: tx('Teste sanitație cantitative', 'Quantitative sanitation tests'), type: 'text' },
      { key: 'rapid_sanitation', label: tx('Teste sanitație rapide', 'Rapid sanitation tests'), type: 'text' },
      { key: 'contaminants', label: tx('Contaminanți - Pb și Cd', 'Contaminants - Pb and Cd'), type: 'text' },
    ],
    instructions: tx('Probele externe se realizează prin colaboratori acreditați; rezultatele necorespunzătoare urmează procedura internă.', 'External samples are processed by accredited partners; unsatisfactory results follow the internal procedure.'),
  },
  {
    code: 'FO-H-14-01',
    title: tx('Verificare temperaturi preparare termică', 'Cooking-temperature verification'),
    shortTitle: tx('Temperaturi preparare', 'Cooking temperatures'), category: 'production', icon: 'thermometer-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), periodField],
    rowFields: [
      dateField,
      { key: 'dish', label: tx('Preparat', 'Dish'), type: 'text', required: true },
      { key: 'process', label: tx('Proces termic', 'Cooking process'), type: 'text', required: true },
      temp('temperature_1', 'T produs finit 1', 'Finished-product temp. 1', true),
      { key: 'time_1', label: tx('Timp 1 (min)', 'Time 1 (min)'), type: 'number', required: true },
      { key: 'corrective_action', label: tx('Acțiune corectivă', 'Corrective action'), type: 'multiline' },
      temp('temperature_2', 'T produs finit 2', 'Finished-product temp. 2'),
      { key: 'time_2', label: tx('Timp 2 (min)', 'Time 2 (min)'), type: 'number' },
      { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true },
      signature(),
    ],
    instructions: tx('Temperatura se măsoară la miezul produsului. Dacă limita nu este atinsă, se prelungește tratamentul și se reverifică.', 'Measure the core temperature. If the limit is not met, continue cooking and check again.'),
  },
  {
    code: 'FO-H-14-02',
    title: tx('Fișă verificare - degustare produs finit', 'Finished-product tasting verification'),
    shortTitle: tx('Degustare produs finit', 'Finished-product tasting'), category: 'production', icon: 'restaurant-outline', layout: 'table', orientation: 'portrait',
    documentFields: [dateField, locationField()],
    rowFields: [
      { key: 'product', label: tx('Produs', 'Product'), type: 'text', required: true },
      { key: 'total_quantity', label: tx('Cantitate totală / schimb', 'Total quantity / shift'), type: 'number' },
      { key: 'equipment', label: tx('Cuptor / Cazan', 'Oven / Kettle'), type: 'text' },
      { key: 'sensory_check', label: tx('Verificare gust și miros', 'Taste and smell check'), type: 'text', required: true },
      signature(),
    ],
  },
  {
    code: 'FO-H-16-01',
    title: tx('Formular înregistrare răcire rapidă', 'Rapid-cooling record'),
    shortTitle: tx('Răcire rapidă', 'Rapid cooling'), category: 'production', icon: 'snow-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(), periodField],
    rowFields: [
      dateField,
      { key: 'product', label: tx('Denumire produs', 'Product'), type: 'text', required: true },
      { key: 'time_1', label: tx('Ora 1', 'Time 1'), type: 'time', required: true }, temp('temperature_1', 'T 1', 'T 1', true),
      { key: 'time_2', label: tx('Ora 2', 'Time 2'), type: 'time', required: true }, temp('temperature_2', 'T 2', 'T 2', true),
      { key: 'conform_1', label: tx('Conform 1', 'Conform 1'), type: 'choice', options: CONFORMITY, required: true },
      { key: 'time_3', label: tx('Ora 3', 'Time 3'), type: 'time' }, temp('temperature_3', 'T 3', 'T 3'),
      { key: 'conform_2', label: tx('Conform 2', 'Conform 2'), type: 'choice', options: CONFORMITY },
      signature(),
    ],
    instructions: tx('Limită din formularul sursă: maximum 2 ore de la +80 °C la +4 °C. Confirmați limita în planul HACCP al unității.', 'Source-form limit: maximum 2 hours from +80 °C to +4 °C. Confirm the limit in the site HACCP plan.'),
  },
  {
    code: 'FO-H-17-01',
    title: tx('Timp sterilizare cuțite', 'Knife sterilisation time'),
    shortTitle: tx('Sterilizare cuțite', 'Knife sterilisation'), category: 'sanitation', icon: 'timer-outline', layout: 'matrix', orientation: 'landscape',
    documentFields: [locationField(tx('Proiect / Locație', 'Project / Location')), monthField, yearField, { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true }], axisOrder: DAY_ORDER,
    rowFields: [dayAxis, { key: 'start_time', label: tx('Ora introducerii cuțitelor', 'Knife insertion time'), type: 'time', required: true }, signature('start_signature', tx('Semnătură introducere', 'Insertion signature')), { key: 'end_time', label: tx('Ora scoaterii cuțitelor', 'Knife removal time'), type: 'time', required: true }, signature('end_signature', tx('Semnătură scoatere', 'Removal signature'))],
    instructions: tx('Aplicați limitele și procedura internă PR-H-17.', 'Apply the internal limits and procedure PR-H-17.'),
  },
  {
    code: 'FO-H-17-02',
    title: tx('Timp igienizare ouă', 'Egg sanitation time'),
    shortTitle: tx('Igienizare ouă', 'Egg sanitation'), category: 'sanitation', icon: 'ellipse-outline', layout: 'matrix', orientation: 'landscape',
    documentFields: [locationField(tx('Proiect / Locație', 'Project / Location')), monthField, yearField, { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true }], axisOrder: DAY_ORDER,
    rowFields: [dayAxis, { key: 'start_time', label: tx('Ora introducerii ouălor', 'Egg insertion time'), type: 'time', required: true }, signature('start_signature', tx('Semnătură introducere', 'Insertion signature')), { key: 'end_time', label: tx('Ora scoaterii ouălor', 'Egg removal time'), type: 'time', required: true }, signature('end_signature', tx('Semnătură scoatere', 'Removal signature'))],
  },
  {
    code: 'FO-H-18-01',
    title: tx('Grafic de evidență a temperaturilor pe linie', 'Service-line temperature record'),
    shortTitle: tx('Temperaturi pe linie', 'Service-line temperatures'), category: 'storage', icon: 'fast-food-outline', layout: 'table', orientation: 'portrait',
    documentFields: [dateField, locationField(), { key: 'corrective_actions', label: tx('Acțiuni corective', 'Corrective actions'), type: 'multiline' }, { key: 'responsible', label: tx('Responsabil', 'Responsible person'), type: 'text', required: true }],
    rowFields: [
      { key: 'menu', label: tx('Meniu / Preparat', 'Menu / Dish'), type: 'text', required: true },
      { key: 'time_1', label: tx('Ora 1', 'Time 1'), type: 'time' }, temp('temperature_1', 'Temperatura 1', 'Temperature 1', true),
      { key: 'time_2', label: tx('Ora 2', 'Time 2'), type: 'time' }, temp('temperature_2', 'Temperatura 2', 'Temperature 2'),
      { key: 'time_3', label: tx('Ora 3', 'Time 3'), type: 'time' }, temp('temperature_3', 'Temperatura 3', 'Temperature 3'),
      signature(),
    ],
  },
  {
    code: 'FO-H-18-02',
    title: tx('Raportul producției nevândute', 'Unsold-production report'),
    shortTitle: tx('Producție nevândută', 'Unsold production'), category: 'production', icon: 'trash-bin-outline', layout: 'table', orientation: 'portrait',
    documentFields: [dateField, locationField(), signature('prepared_by', tx('Întocmit', 'Prepared by')), signature('checked_by', tx('Verificat', 'Checked by'))],
    rowFields: [
      { key: 'product', label: tx('Denumire produs', 'Product'), type: 'text', required: true },
      { key: 'serving_weight', label: tx('Gramaj porție (g)', 'Serving weight (g)'), type: 'number', required: true },
      { key: 'portions', label: tx('Număr porții', 'Portions'), type: 'number', required: true },
      { key: 'total_weight', label: tx('Greutate totală', 'Total weight'), type: 'number', required: true },
      { key: 'cause', label: tx('Cauză', 'Cause'), type: 'multiline', required: true },
    ],
  },
  {
    code: 'FO-H-20-01',
    title: tx('Verificarea furnizorilor la recepție', 'Supplier checks at reception'),
    shortTitle: tx('Recepție furnizori', 'Supplier reception'), category: 'reception', icon: 'car-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(tx('Locație / Proiect', 'Location / Project')), periodField],
    rowFields: [
      { key: 'supplier', label: tx('Nume furnizor', 'Supplier name'), type: 'text', required: true }, dateField,
      { key: 'order_number', label: tx('Nr. comandă', 'Order no.'), type: 'text' },
      { key: 'category', label: tx('Categoria de produse', 'Product category'), type: 'choice', options: PRODUCT_CATEGORY, required: true },
      { key: 'product', label: tx('Descriere produs', 'Product description'), type: 'text', required: true },
      { key: 'vehicle_condition', label: tx('Starea igienico-sanitară a mașinii', 'Hygienic condition of vehicle'), type: 'choice', options: CONFORMITY, required: true },
      temp('vehicle_temperature', 'Temperatura de pe mașină', 'Vehicle temperature'),
      temp('product_temperature', 'Temperatura produselor la recepție', 'Product temperature at reception', true),
      signature('receiver', tx('Persoană recepție marfă', 'Receiving person')),
      { key: 'corrective_action', label: tx('Acțiune corectivă la neconformitate', 'Corrective action for non-conformity'), type: 'multiline' },
    ],
  },
  {
    code: 'FO-H-20-02',
    title: tx('Monitorizare temperatură spațiu frigorific', 'Cold-room temperature monitoring'),
    shortTitle: tx('Temperatură spațiu frigorific', 'Cold-room temperature'), category: 'storage', icon: 'snow-outline', layout: 'table', orientation: 'portrait',
    documentFields: [monthField, yearField, { key: 'cold_room', label: tx('Spațiul frigorific', 'Cold room'), type: 'text', required: true }, locationField()],
    rowFields: [
      dayAxis,
      { key: 'time_1', label: tx('Ora citirii 1', 'Reading 1 time'), type: 'time', required: true, defaultValue: '06:00' },
      temp('temperature_1', 'Temperatura 1', 'Temperature 1', true),
      { key: 'time_2', label: tx('Ora citirii 2', 'Reading 2 time'), type: 'time', required: true },
      temp('temperature_2', 'Temperatura 2', 'Temperature 2', true),
      { key: 'time_3', label: tx('Ora citirii 3', 'Reading 3 time'), type: 'time', required: true },
      temp('temperature_3', 'Temperatura 3', 'Temperature 3', true),
      { key: 'corrective_action', label: tx('Corecții / Acțiuni corective', 'Corrections / Corrective action'), type: 'multiline' },
      signature('prepared_by', tx('Întocmit', 'Prepared by')),
      signature('checked_by', tx('Verificat', 'Checked by')),
    ],
    instructions: tx('Se fac trei citiri pe zi. La depășirea limitelor se aplică acțiuni corective și se anunță responsabilul.', 'Take three readings per day. When limits are exceeded, apply corrective action and notify the responsible person.'),
  },
  {
    code: 'FO-H-20-03',
    title: tx('Grafic de monitorizare a temperaturii și umidității', 'Temperature and humidity monitoring chart'),
    shortTitle: tx('Temperatură și umiditate', 'Temperature and humidity'), category: 'storage', icon: 'speedometer-outline', layout: 'table', orientation: 'landscape',
    documentFields: [locationField(tx('Proiect / Locație', 'Project / Location')), { key: 'period', label: tx('Perioada', 'Period'), type: 'text', required: true }, signature('approved_by', tx('Aprobat', 'Approved by'))],
    rowFields: [dateField, { key: 'time', label: tx('Ora', 'Time'), type: 'time', required: true }, temp('temperature', 'Temperatura', 'Temperature', true), { key: 'humidity', label: tx('Umiditate %', 'Humidity %'), type: 'number', required: true }, { key: 'operator_code', label: tx('Cod / Semnătură', 'Code / Signature'), type: 'text', required: true }, { key: 'verification', label: tx('Cod / Verificare', 'Code / Verification'), type: 'text' }, { key: 'corrective_action', label: tx('Măsuri corective', 'Corrective action'), type: 'multiline' }],
    instructions: tx('Limite din formularul sursă: maximum 25 °C și maximum 70% umiditate. Confirmați limitele interne aplicabile.', 'Source-form limits: maximum 25 °C and maximum 70% humidity. Confirm the applicable internal limits.'),
  },
] as const;

/** Data fișei este comună tuturor documentelor, inclusiv matricelor lunare. */
export const HACCP_FORMS: readonly HaccpFormDefinition[] = BASE_HACCP_FORMS.map((form) => ({
  ...form,
  documentFields: [formDateField, ...form.documentFields],
}));

export function getHaccpForm(code: string | null | undefined) {
  return HACCP_FORMS.find((form) => form.code === code) ?? null;
}

export function localize(value: LocalizedText, locale: Locale) {
  return value[locale];
}

export function defaultHaccpValue(field: HaccpFieldDefinition, now = new Date()) {
  if (field.defaultValue === '@today') {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (field.defaultValue === '@month') return String(now.getMonth() + 1).padStart(2, '0');
  if (field.defaultValue === '@year') return String(now.getFullYear());
  return field.defaultValue ?? '';
}

export function displayHaccpValue(field: HaccpFieldDefinition, raw: string, locale: Locale) {
  if (!raw) return '';
  const selected = field.options?.find((item) => item.value === raw);
  if (selected) return localize(selected.label, locale);
  if (field.type === 'temperature') return `${raw} °C`;
  return raw;
}
