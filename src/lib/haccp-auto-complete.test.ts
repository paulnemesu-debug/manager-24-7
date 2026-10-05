/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { describe, expect, it } from 'vitest';

import {
  autoCompleteHaccpDossier,
  HACCP_AUTO_COMPLETE_EXCLUDED_CODES,
} from '@/lib/haccp-auto-complete';
import { buildHaccpTodayTasks } from '@/lib/haccp-today';
import type { HaccpEquipment, HaccpRoutineProfile } from '@/types/haccp-routine';

const now = new Date('2026-09-25T08:30:00');
const profile: HaccpRoutineProfile = {
  defaultLocationId: null,
  defaultLocationName: 'Bucătărie test',
  responsibleName: 'Responsabil HACCP',
  shiftStartTime: '06:00',
  updatedAt: '',
  syncState: 'local',
};
const equipment: HaccpEquipment[] = [
  {
    id: 'cold-1', locationId: null, name: 'Frigider carne', kind: 'cold', criticalMin: 0, criticalMax: 4,
    requiredReadings: 3, readingTimes: ['06:00', '12:00', '18:00'], active: true, sortOrder: 1, updatedAt: '', syncState: 'local',
  },
  {
    id: 'cold-2', locationId: null, name: 'Congelator', kind: 'frozen', criticalMin: null, criticalMax: -18,
    requiredReadings: 3, readingTimes: ['06:30', '12:30', '18:30'], active: true, sortOrder: 2, updatedAt: '', syncState: 'local',
  },
  {
    id: 'hot-1', locationId: null, name: 'Linie caldă', kind: 'hot', criticalMin: 63, criticalMax: null,
    requiredReadings: 3, readingTimes: ['11:30', '14:30', '17:30'], active: true, sortOrder: 3, updatedAt: '', syncState: 'local',
  },
];

describe('HACCP dossier auto-completion', () => {
  it('skips the three manual forms and creates three temperature dish entries', () => {
    const result = autoCompleteHaccpDossier({
      documents: [], equipment, profile, identity: 'operator@example.com', locale: 'ro', now,
    });

    expect(result.completedFormCodes).toHaveLength(16);
    expect(result.excludedFormCodes).toEqual([...HACCP_AUTO_COMPLETE_EXCLUDED_CODES]);
    HACCP_AUTO_COMPLETE_EXCLUDED_CODES.forEach((code) => {
      expect(result.documents.some((document) => document.formCode === code)).toBe(false);
    });

    const cooking = result.documents.find((document) => document.formCode === 'FO-H-14-01');
    expect(cooking?.rows).toHaveLength(3);
    expect(cooking?.rows.map((row) => row.values.temperature_1)).toEqual(['', '', '']);
    expect(cooking?.rows.every((row) => row.values.dish.includes('adaugă denumirea'))).toBe(true);

    const service = result.documents.find((document) => document.formCode === 'FO-H-18-01');
    expect(service?.rows).toHaveLength(3);
    expect(service?.rows.map((row) => row.values.temperature_1)).toEqual(['', '', '']);
    expect(service?.rows.map((row) => row.values.time_1)).toEqual(['', '', '']);
    expect(result.pendingDishNames).toBe(6);

    const coldStorage = result.documents.filter((document) => document.formCode === 'FO-H-20-02');
    expect(coldStorage).toHaveLength(2);
    expect(coldStorage[0].rows[0].values).toMatchObject({ day: '25', time_1: '', time_2: '', time_3: '' });
    expect(coldStorage[1].rows[0].values.temperature_1).toBe('');
  });

  it('updates the same records without overwriting a dish name entered later', () => {
    const first = autoCompleteHaccpDossier({
      documents: [], equipment, profile, identity: 'operator@example.com', locale: 'ro', now,
    });
    const cooking = first.documents.find((document) => document.formCode === 'FO-H-14-01');
    if (!cooking) throw new Error('missing cooking record');
    cooking.rows[0].values.dish = 'Ciorbă de legume';
    delete cooking.rows[0].values._name_pending;

    const second = autoCompleteHaccpDossier({
      documents: first.documents, equipment, profile, identity: 'operator@example.com', locale: 'ro', now,
    });
    const updatedCooking = second.documents.find((document) => document.formCode === 'FO-H-14-01');

    expect(second.createdDocuments).toBe(0);
    expect(second.documents.map((document) => document.id).sort()).toEqual(
      first.documents.map((document) => document.id).sort(),
    );
    expect(updatedCooking?.rows).toHaveLength(3);
    expect(updatedCooking?.rows[0].values.dish).toBe('Ciorbă de legume');
    expect(updatedCooking?.rows[0].values._name_pending).toBeUndefined();
  });
});

it('keeps generated readings pending and isolates equal equipment names across locations', () => {
  const firstProfile = { ...profile, defaultLocationId: 'location-one' };
  const secondProfile = { ...profile, defaultLocationId: 'location-two' };
  const firstEquipment = [{ ...equipment[0], id: 'fridge-one', locationId: 'location-one' }];
  const secondEquipment = [{ ...equipment[0], id: 'fridge-two', locationId: 'location-two' }];
  const first = autoCompleteHaccpDossier({ documents: [], equipment: firstEquipment, profile: firstProfile, identity: 'Chef', locale: 'ro', now });
  expect(buildHaccpTodayTasks(first.documents, firstEquipment, 'ro', now, firstProfile).every((task) => task.status === 'pending')).toBe(true);
  const second = autoCompleteHaccpDossier({ documents: first.documents, equipment: secondEquipment, profile: secondProfile, identity: 'Chef', locale: 'ro', now });
  expect(second.createdDocuments).toBe(second.documents.length);
  expect(second.documents.every((document) => document.headerValues._location_id === 'location-two')).toBe(true);
  const reading = first.documents.find((document) => document.formCode === 'FO-H-20-02');
  if (!reading) throw new Error('missing fridge');
  reading.rows[0].values.temperature_1 = '2';
  reading.rows[0].values.temperature_2 = '2';
  reading.rows[0].values.temperature_3 = '2';
  expect(buildHaccpTodayTasks([reading], firstEquipment, 'ro', now, firstProfile).find((task) => task.kind === 'temperature')?.completedSteps).toBe(0);
});
