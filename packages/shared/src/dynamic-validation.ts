import { z } from 'zod';
import type { FieldType } from './field-types';

export type FieldOptionInput = {
  value: string;
  label: string;
  isActive?: boolean;
};

export type FieldValidationRules = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  precision?: number;
  allowCustom?: boolean;
  target?: string;
};

export type FieldDefinitionInput = {
  key: string;
  displayName: string;
  fieldType: FieldType;
  isRequired?: boolean;
  isUnique?: boolean;
  defaultValue?: unknown;
  validation?: FieldValidationRules | null;
  options?: FieldOptionInput[];
  isActive?: boolean;
};

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoDateTimeSchema = z.string().datetime({ offset: true });

function optionValues(field: FieldDefinitionInput): string[] {
  return (field.options ?? [])
    .filter((o) => o.isActive !== false)
    .map((o) => o.value);
}

function baseForType(field: FieldDefinitionInput): z.ZodTypeAny {
  const rules = field.validation ?? {};
  const options = optionValues(field);

  switch (field.fieldType) {
    case 'TEXT':
    case 'BARCODE':
    case 'QR_CODE':
    case 'PHONE':
    case 'COLOR': {
      let s = z.string();
      if (rules.minLength != null) s = s.min(rules.minLength);
      if (rules.maxLength != null) s = s.max(rules.maxLength);
      if (rules.pattern) s = s.regex(new RegExp(rules.pattern));
      return s;
    }
    case 'LONG_TEXT': {
      let s = z.string();
      if (rules.minLength != null) s = s.min(rules.minLength);
      if (rules.maxLength != null) s = s.max(rules.maxLength);
      return s;
    }
    case 'EMAIL':
      return z.string().email();
    case 'URL':
      return z.string().url();
    case 'NUMBER':
    case 'DECIMAL':
    case 'CURRENCY': {
      let n = z.number();
      if (rules.min != null) n = n.min(rules.min);
      if (rules.max != null) n = n.max(rules.max);
      if (rules.integer || field.fieldType === 'NUMBER') n = n.int();
      return n;
    }
    case 'BOOLEAN':
    case 'CHECKBOX':
      return z.boolean();
    case 'DATE':
      return isoDateSchema;
    case 'DATETIME':
      return isoDateTimeSchema;
    case 'DROPDOWN':
    case 'RADIO': {
      if (options.length === 0) return z.string().min(1);
      return z.enum(options as [string, ...string[]]);
    }
    case 'MULTI_SELECT': {
      if (options.length === 0) return z.array(z.string());
      return z.array(z.enum(options as [string, ...string[]]));
    }
    case 'FILE':
    case 'IMAGE':
    case 'RELATIONSHIP':
      return uuidSchema;
    default:
      return z.unknown();
  }
}

/**
 * Build a Zod object schema for inventory item `attributes`
 * from field definitions belonging to one inventory type.
 */
export function buildAttributesSchema(
  fields: FieldDefinitionInput[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    if (field.isActive === false) continue;

    let schema = baseForType(field);
    if (!field.isRequired) {
      schema = schema.optional().nullable();
    }
    // Apply defaults so required fields can be satisfied without the client
    // echoing every value. Checkboxes in particular only emit a value when
    // toggled, so a missing required boolean defaults to false.
    const hasDefault = field.defaultValue !== undefined && field.defaultValue !== null;
    if (hasDefault) {
      schema = schema.default(field.defaultValue as never);
    } else if (field.fieldType === 'BOOLEAN' || field.fieldType === 'CHECKBOX') {
      schema = schema.default(false as never);
    }
    shape[field.key] = schema;
  }

  return z.object(shape).passthrough();
}

export type AttributeValidationIssue = {
  path: string;
  message: string;
};

export function validateAttributes(
  fields: FieldDefinitionInput[],
  attributes: Record<string, unknown> | null | undefined,
): { success: true; data: Record<string, unknown> } | { success: false; issues: AttributeValidationIssue[] } {
  const schema = buildAttributesSchema(fields);
  const result = schema.safeParse(attributes ?? {});

  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        path: ['attributes', ...issue.path.map(String)].join('.'),
        message: issue.message,
      })),
    };
  }

  return { success: true, data: result.data as Record<string, unknown> };
}
