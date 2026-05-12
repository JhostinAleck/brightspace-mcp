import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AuthStrategyKindSchema, MfaStrategyKindSchema } from '@/shared-kernel/config/schema.js';
import { SUPPORTED_LOCALES } from '@/shared-kernel/output/i18n/catalog-loader.js';

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: readonly string[];
}

export function getConfigFormFields(): Record<string, FormField> {
  return {
    base_url: { key: 'base_url', label: 'Base URL', type: 'text' },
    strategy: {
      key: 'strategy',
      label: 'Auth strategy',
      type: 'select',
      options: AuthStrategyKindSchema.options,
    },
    mfa_strategy: {
      key: 'mfa_strategy',
      label: 'MFA strategy',
      type: 'select',
      options: MfaStrategyKindSchema.options,
    },
    locale: {
      key: 'locale',
      label: 'Locale',
      type: 'select',
      options: [...SUPPORTED_LOCALES],
    },
    format: {
      key: 'format',
      label: 'Output format',
      type: 'select',
      options: ['markdown', 'plain'],
    },
  };
}

interface Props {
  currentValues: Record<string, string>;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function ConfigForm({ currentValues, onSave, onCancel }: Props) {
  const fields = Object.values(getConfigFormFields());
  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({ ...currentValues });
  const [optionCursor, setOptionCursor] = useState(0);

  const currentField = fields[fieldIndex];

  useInput((input, key) => {
    if (!currentField) return;
    if (key.escape) { onCancel(); return; }
    if (key.ctrl && input === 's') { onSave(values); return; }

    if (key.downArrow) {
      if (currentField.type === 'select' && currentField.options) {
        setOptionCursor((c) => Math.min(c + 1, currentField.options!.length - 1));
      } else {
        setFieldIndex((i) => Math.min(i + 1, fields.length - 1));
        setOptionCursor(0);
      }
      return;
    }
    if (key.upArrow) {
      if (currentField.type === 'select') {
        setOptionCursor((c) => Math.max(c - 1, 0));
      } else {
        setFieldIndex((i) => Math.max(i - 1, 0));
        setOptionCursor(0);
      }
      return;
    }
    if (key.return) {
      if (currentField.type === 'select' && currentField.options) {
        const chosen = currentField.options[optionCursor];
        if (chosen) setValues((v) => ({ ...v, [currentField.key]: chosen }));
      }
      setFieldIndex((i) => Math.min(i + 1, fields.length - 1));
      setOptionCursor(0);
      return;
    }
    if (key.tab) {
      setFieldIndex((i) => (i + 1) % fields.length);
      setOptionCursor(0);
      return;
    }
    if (currentField.type === 'text') {
      if (key.backspace || key.delete) {
        setValues((v) => ({ ...v, [currentField.key]: (v[currentField.key] ?? '').slice(0, -1) }));
      } else if (input && !key.ctrl && !key.meta) {
        setValues((v) => ({ ...v, [currentField.key]: (v[currentField.key] ?? '') + input }));
      }
    }
  });

  return (
    <Box flexDirection="column">
      {fields.map((field, fi) => {
        const isActive = fi === fieldIndex;
        const val = values[field.key] ?? '';
        return (
          <Box key={field.key} flexDirection="column" marginBottom={1}>
            <Text color={isActive ? 'blueBright' : 'gray'} bold={isActive}>
              {field.label}
            </Text>
            {field.type === 'text' ? (
              <Box>
                <Text color="gray">  </Text>
                <Text>{val}</Text>
                {isActive && <Text backgroundColor="blue"> </Text>}
              </Box>
            ) : (
              <Box flexDirection="column">
                {(field.options ?? []).map((opt, oi) => {
                  const isSel = oi === optionCursor && isActive;
                  const isCurrent = opt === val;
                  return (
                    <Text key={opt} color={isSel ? 'greenBright' : isCurrent ? 'white' : 'gray'}>
                      {isActive ? (isSel ? '  ❯ ' : '    ') : '    '}
                      {opt}
                      {isCurrent && !isSel ? ' ✓' : ''}
                    </Text>
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
      <Text color="gray" dimColor>Tab: siguiente campo · Ctrl+S: guardar · Esc: cancelar</Text>
    </Box>
  );
}
