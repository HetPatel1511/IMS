export const FIELD_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'DROPDOWN',
  'MULTI_SELECT',
  'RADIO',
  'CHECKBOX',
  'COLOR',
  'FILE',
  'IMAGE',
  'CURRENCY',
  'BARCODE',
  'QR_CODE',
  'RELATIONSHIP',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function hasMinRole(role: UserRole, required: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const RESERVED_ATTRIBUTE_KEYS = [
  'id',
  'sku',
  'name',
  'quantity',
  'min_quantity',
  'category_id',
  'inventory_type_id',
  'attributes',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
