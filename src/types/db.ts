/**
 * Database row + input shapes. These mirror the SQL schema in /migrations.
 * Money is always integer cents. Timestamps come back from the driver as JS
 * `Date`. jsonb columns come back as parsed objects.
 */

export interface AddressJson {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export type ConstituentType = "individual" | "organization";
export type GiftType =
  | "one_time"
  | "recurring"
  | "pledge"
  | "in_kind"
  | "check"
  | "matching"
  | "stock";
export type GiftStatus = "succeeded" | "pending" | "failed" | "refunded";
export type TributeType = "in_honor" | "in_memory";
export type MembershipRole = "org_admin" | "org_staff";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface Org {
  id: string;
  slug: string;
  legal_name: string;
  ein: string | null;
  receipt_from_email: string | null;
  receipt_signature_name: string | null;
  stripe_account_id: string | null;
  address_json: AddressJson | null;
  logo_url: string | null;
  primary_color: string | null;
  created_at: Date;
}

export interface Constituent {
  id: string;
  org_id: string;
  type: ConstituentType;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  email: string | null;
  phone: string | null;
  address_json: AddressJson | null;
  do_not_contact: boolean;
  source: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Fund {
  id: string;
  org_id: string;
  code: string;
  name: string;
  restricted: boolean;
  active: boolean;
  created_at: Date;
}

export interface Gift {
  id: string;
  org_id: string;
  constituent_id: string;
  fund_id: string | null;
  campaign_id: string | null;
  appeal_id: string | null;
  pledge_id: string | null;
  gift_type: GiftType;
  amount_cents: number;
  currency: string;
  status: GiftStatus;
  received_at: Date | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  card_last4: string | null;
  tribute_type: TributeType | null;
  tribute_name: string | null;
  soft_credit_id: string | null;
  fee_cents: number | null;
  net_cents: number | null;
  benefit_fmv_cents: number | null;
  benefit_description: string | null;
  receipt_sent_at: Date | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: Date;
}

export interface RecurringPlan {
  id: string;
  org_id: string;
  constituent_id: string | null;
  fund_id: string | null;
  stripe_subscription_id: string | null;
  amount_cents: number;
  interval: string;
  status: string;
  started_at: Date | null;
  canceled_at: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface UpsertConstituentInput {
  email: string; // required for the dedupe path
  type?: ConstituentType;
  firstName?: string | null;
  lastName?: string | null;
  orgName?: string | null;
  phone?: string | null;
  address?: AddressJson | null;
  source?: string;
}

export interface InsertGiftInput {
  constituentId: string;
  fundId?: string | null;
  campaignId?: string | null;
  appealId?: string | null;
  pledgeId?: string | null;
  giftType: GiftType;
  amountCents: number;
  currency?: string;
  status: GiftStatus;
  receivedAt?: Date | string | null;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  cardLast4?: string | null;
  tributeType?: TributeType | null;
  tributeName?: string | null;
  softCreditId?: string | null;
  feeCents?: number | null;
  netCents?: number | null;
  benefitFmvCents?: number | null;
  benefitDescription?: string | null;
  notes?: string | null;
}
