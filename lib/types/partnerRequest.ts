export type PartnerRequestStatus = 'new' | 'in_progress' | 'paid' | 'activated';

export const PARTNER_REQUEST_STATUS_LABELS: Record<PartnerRequestStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе / Договор',
  paid: 'Оплачено',
  activated: 'Активировано',
};

// Order the CRM pipeline moves through — used for the "next status" button.
export const PARTNER_REQUEST_STATUS_ORDER: PartnerRequestStatus[] = [
  'new',
  'in_progress',
  'paid',
  'activated',
];

export type PartnerRoleRequested = 'coffee_shop' | 'roaster';

export interface PartnerRequest {
  id: string;
  company_name: string;
  city: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  comment: string | null;
  role_requested: PartnerRoleRequested;
  status: PartnerRequestStatus;
  manager_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Shape the public lead form submits — server assigns id/status/timestamps.
export interface PartnerRequestInput {
  company_name: string;
  city: string;
  contact_name: string;
  email: string;
  phone: string;
  comment: string;
  role_requested: PartnerRoleRequested;
}
