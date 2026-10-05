/**
 * MANAGER 24/7™ by PARADIM — proprietary software.
 * Copyright © 2026 PARADIM Operations SRL. All rights reserved.
 * Concept author and product director: Marius Paul Nemeșu.
 * See LICENSE-PROPRIETARY.md.
 */

import { StyleSheet, View } from 'react-native';

import { ChoiceRow, Select } from '@/components/inputs';
import { HaccpDateInput } from '@/components/haccp-date-input';
import { HaccpSignatureInput } from '@/components/haccp-signature-input';
import { HaccpTemperatureInput } from '@/components/haccp-temperature-input';
import { HaccpTimeInput } from '@/components/haccp-time-input';
import { Field } from '@/components/ui';
import { localize, type HaccpFieldDefinition } from '@/constants/haccp-forms';
import type { Locale } from '@/i18n/translations';

export function HaccpField({
  field,
  locale,
  value,
  onChange,
  identity = '',
  criticalMin,
  criticalMax,
}: {
  field: HaccpFieldDefinition;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  identity?: string;
  criticalMin?: number | null;
  criticalMax?: number | null;
}) {
  const label = `${localize(field.label, locale)}${field.required ? ' *' : ''}`;
  if (field.type === 'date') {
    return <HaccpDateInput label={label} locale={locale} value={value} onChange={onChange} />;
  }
  if (field.type === 'time') {
    return <HaccpTimeInput label={label} locale={locale} value={value} onChange={onChange} />;
  }
  if (field.type === 'temperature') {
    return (
      <HaccpTemperatureInput
        label={label}
        value={value}
        onChange={onChange}
        criticalMin={criticalMin ?? field.criticalMin}
        criticalMax={criticalMax ?? field.criticalMax}
      />
    );
  }
  if (field.type === 'signature') {
    return <HaccpSignatureInput label={label} value={value} identity={identity} locale={locale} onChange={onChange} />;
  }
  if (field.type === 'choice' && field.options?.length) {
    const options = field.options.map((item) => ({ value: item.value, label: localize(item.label, locale) }));
    if (options.length <= 3) {
      return (
        <View style={styles.choiceWrap}>
          <ChoiceRow label={label} options={options} value={value} onChange={onChange} large />
        </View>
      );
    }
    return (
      <Select
        label={label}
        placeholder={locale === 'ro' ? 'Alege opțiunea' : 'Choose an option'}
        options={options}
        value={value || null}
        onChange={(next) => onChange(next ?? '')}
      />
    );
  }

  const placeholder = field.placeholder
    ? localize(field.placeholder, locale)
    : undefined;
  const keyboardType = field.type === 'number' ? 'decimal-pad' as const : 'default' as const;
  return (
    <Field
      label={label}
      value={value}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={field.type === 'multiline'}
      numberOfLines={field.type === 'multiline' ? 3 : 1}
      onChangeText={onChange}
    />
  );
}

const styles = StyleSheet.create({
  choiceWrap: { minHeight: 50 },
});
