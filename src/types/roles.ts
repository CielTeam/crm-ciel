export const APP_ROLES = [
  'chairman',
  'vice_president',
  'hr',
  'head_of_operations',
  'operations_employee',
  'team_development_lead',
  'developer_employee',
  'technical_lead',
  'technical_employee',
  'head_of_accounting',
  'accounting_employee',
  'head_of_marketing',
  'marketing_employee',
  'sales_lead',
  'sales_employee',
  'driver',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  chairman: 'Chairman',
  vice_president: 'Vice President',
  hr: 'HR',
  head_of_operations: 'Head of Operations',
  operations_employee: 'Operations Employee',
  team_development_lead: 'Team Development Lead',
  developer_employee: 'Developer Employee',
  technical_lead: 'Technical Lead',
  technical_employee: 'Technical Employee',
  head_of_accounting: 'Head of Accounting',
  accounting_employee: 'Accounting Employee',
  head_of_marketing: 'Head of Marketing',
  marketing_employee: 'Marketing Employee',
  sales_lead: 'Sales Lead',
  sales_employee: 'Sales Employee',
  driver: 'Driver',
};

export const DEPARTMENTS = [
  'executive',
  'hr',
  'operations',
  'development',
  'technical',
  'accounting',
  'marketing',
  'sales',
  'logistics',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const ROLE_DEPARTMENT: Record<AppRole, Department> = {
  chairman: 'executive',
  vice_president: 'executive',
  hr: 'hr',
  head_of_operations: 'operations',
  operations_employee: 'operations',
  team_development_lead: 'development',
  developer_employee: 'development',
  technical_lead: 'technical',
  technical_employee: 'technical',
  head_of_accounting: 'accounting',
  accounting_employee: 'accounting',
  head_of_marketing: 'marketing',
  marketing_employee: 'marketing',
  sales_lead: 'sales',
  sales_employee: 'sales',
  driver: 'logistics',
};

// Roles that are system administrators
export const ADMIN_ROLES: AppRole[] = ['technical_lead', 'team_development_lead'];

// Roles that are department leads
export const LEAD_ROLES: AppRole[] = [
  'head_of_operations',
  'team_development_lead',
  'technical_lead',
  'head_of_accounting',
  'head_of_marketing',
  'sales_lead',
];

// Roles that are executives
export const EXECUTIVE_ROLES: AppRole[] = ['chairman', 'vice_president'];

export function isAdmin(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isLead(role: AppRole): boolean {
  return LEAD_ROLES.includes(role);
}

export function isExecutive(role: AppRole): boolean {
  return EXECUTIVE_ROLES.includes(role);
}
