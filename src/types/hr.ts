export type HrAttendanceStatus = 'scheduled' | 'present' | 'absent' | 'leave' | 'day_off';

export type HrEmployee = {
  id: string;
  name: string;
  role: string;
  locationId: string | null;
  locationName: string;
  grossSalary: number | null;
  netSalary: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  syncState?: 'local' | 'pending' | 'synced';
};

export type HrShift = {
  id: string;
  employeeId: string;
  workDate: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  status: HrAttendanceStatus;
  notes: string;
  updatedAt: string;
  syncState?: 'local' | 'pending' | 'synced';
};

export type HrData = { employees: HrEmployee[]; shifts: HrShift[] };
