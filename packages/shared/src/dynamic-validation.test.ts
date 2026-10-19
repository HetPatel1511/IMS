import { buildAttributesSchema, validateAttributes } from '../src/dynamic-validation';

const fields = [
  {
    key: 'grade',
    displayName: 'Grade',
    fieldType: 'TEXT' as const,
    isRequired: true,
  },
  {
    key: 'thickness',
    displayName: 'Thickness',
    fieldType: 'DECIMAL' as const,
    isRequired: true,
    validation: { min: 0 },
  },
];

const ok = validateAttributes(fields, { grade: 'A36', thickness: 3.2 });
if (!ok.success) {
  console.error('Expected success', ok);
  process.exit(1);
}

const bad = validateAttributes(fields, { thickness: -1 });
if (bad.success) {
  console.error('Expected failure for missing/invalid attrs');
  process.exit(1);
}

const schema = buildAttributesSchema(fields);
const parsed = schema.safeParse({ grade: 'A36', thickness: 1 });
if (!parsed.success) {
  console.error(parsed.error);
  process.exit(1);
}

// A required checkbox that the client never toggled (missing) defaults to false.
const boolFields = [
  { key: 'certified', displayName: 'Certified', fieldType: 'CHECKBOX' as const, isRequired: true },
];
const boolMissing = validateAttributes(boolFields, {});
if (!boolMissing.success) {
  console.error('Expected required checkbox to default to false', boolMissing);
  process.exit(1);
}
if (boolMissing.data.certified !== false) {
  console.error('Expected certified default false, got', boolMissing.data.certified);
  process.exit(1);
}

// An explicit field defaultValue is applied when the attribute is missing.
const defaultedFields = [
  {
    key: 'unit',
    displayName: 'Unit',
    fieldType: 'TEXT' as const,
    isRequired: true,
    defaultValue: 'kg',
  },
];
const defaulted = validateAttributes(defaultedFields, {});
if (!defaulted.success || defaulted.data.unit !== 'kg') {
  console.error('Expected default value to be applied', defaulted);
  process.exit(1);
}

console.log('dynamic-validation tests passed');
