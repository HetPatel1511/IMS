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

console.log('dynamic-validation tests passed');
