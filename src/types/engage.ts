/** Engage module row + input shapes. Mirror migrations/0007_engage.sql. */

export type EngageChannel = "email" | "sms" | "mail";
export type MessageStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";
export type RecipientStatus =
  | "queued" | "sent" | "delivered" | "opened" | "clicked" | "bounced" | "failed" | "unsubscribed";
export type AddressType = "organization" | "mailing_return";

export interface EngageDomain {
  id: string;
  org_id: string;
  domain: string;
  verified: boolean;
  dns_records: { type: string; host: string; value: string; verified: boolean }[] | null;
  resend_domain_id: string | null;
  created_at: Date;
}

export interface EngageSender {
  id: string;
  org_id: string;
  domain_id: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  is_default: boolean;
  created_at: Date;
}

export interface EngageAddress {
  id: string;
  org_id: string;
  type: AddressType;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  created_at: Date;
}

export interface EngageMergeField {
  id: string;
  org_id: string;
  name: string;
  tag: string;
  default_value: string | null;
  created_at: Date;
}

export interface EngageMessage {
  id: string;
  org_id: string;
  channel: EngageChannel;
  name: string;
  subject: string | null;
  body_md: string | null;
  sender_id: string | null;
  audience_json: AudienceSpec | null;
  recipient_count: number;
  status: MessageStatus;
  scheduled_at: Date | null;
  sent_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EngageRecipient {
  id: string;
  org_id: string;
  message_id: string;
  constituent_id: string | null;
  to_email: string | null;
  to_phone: string | null;
  provider_message_id: string | null;
  status: RecipientStatus;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Audience filter spec (stored on a message, resolved against constituents at
 * send). v1 filters are intentionally small; consent filtering is implicit and
 * always applied (do_not_contact, plus channel opt-out/opt-in).
 */
export interface AudienceSpec {
  /** "all" reachable constituents, or an explicit id list. */
  mode: "all" | "fund" | "manual";
  fundId?: string | null;      // gave to this fund (any time)
  constituentIds?: string[];   // mode: "manual"
}

/** Per-message aggregate stats derived from engage_recipients. */
export interface MessageStats {
  total: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  openRate: number;  // 0..1
  clickRate: number; // 0..1
}
