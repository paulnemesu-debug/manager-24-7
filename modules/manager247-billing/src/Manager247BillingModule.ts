import { requireNativeModule } from 'expo-modules-core';

import type { Manager247BillingModule } from './Manager247Billing.types';

export default requireNativeModule<Manager247BillingModule>('Manager247Billing');
