'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  Smartphone,
  Calendar,
  KeyRound,
  FileText,
  X,
  ExternalLink,
} from 'lucide-react';
import { AdminAction } from '@/components/admin-action';

export type UserRecord = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  is_suspended: boolean;
  created_at: string;
};

export type MemberAccess = {
  status: 'active' | 'suspended' | 'expired' | 'none';
  planName: string;
  daysLeft: number | null;
  expiresAt: string | null;
};

export type AgreementConsent = {
  id: string;
  user_id: string;
  email: string;
  terms_version: string;
  risk_disclosure_version: string;
  privacy_policy_version: string;
  refund_policy_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  agreement_hash: string;
  payment_id?: string | null;
  subscription_id?: string | null;
};

function parseDevice(ua: string | null | undefined): { label: string; icon: string } {
  if (!ua) return { label: 'Device Unknown', icon: '💻' };
  const lower = ua.toLowerCase();
  let os = 'Unknown OS';
  if (lower.includes('macintosh') || lower.includes('mac os')) os = 'macOS';
  else if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  let browser = 'Browser';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome')) browser = 'Chrome';
  else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';
  else if (lower.includes('firefox')) browser = 'Firefox';

  const icon = os === 'iOS' || os === 'Android' ? '📱' : '💻';
  return { label: `${os} · ${browser}`, icon };
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function AdminMembersView({
  users,
  accessMap,
  consentMap,
}: {
  users: UserRecord[];
  accessMap: Record<string, MemberAccess>;
  consentMap: Record<string, AgreementConsent | null>;
}) {
  const [activeConsentUser, setActiveConsentUser] = useState<UserRecord | null>(null);

  const selectedConsent = activeConsentUser ? consentMap[activeConsentUser.id] : null;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Subscription Access</th>
              <th>Account</th>
              <th>Legal Consent</th>
              <th>Joined</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const access = accessMap[u.id] || { status: 'none', planName: '', daysLeft: null, expiresAt: null };
              const consent = consentMap[u.id];

              return (
                <tr key={u.id}>
                  <td>
                    <span className="table-member-primary">{u.email}</span>
                    {u.full_name && <small className="table-member-secondary">{u.full_name}</small>}
                  </td>
                  <td>
                    {access.status === 'active' ? (
                      <span className="status-pill status-active" title={`Expires ${formatDate(access.expiresAt)}`}>
                        Active · {access.planName} ({access.daysLeft}d left)
                      </span>
                    ) : access.status === 'suspended' ? (
                      <span className="status-pill status-danger">
                        Suspended · {access.planName}
                      </span>
                    ) : access.status === 'expired' ? (
                      <span className="status-pill status-muted" title={`Expired on ${formatDate(access.expiresAt)}`}>
                        Expired · {access.planName}
                      </span>
                    ) : (
                      <span className="status-pill status-muted">No Plan</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${u.is_suspended ? 'status-danger' : 'status-muted'}`}>
                      {u.is_suspended ? 'Suspended' : 'Normal'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`table-action ${consent ? 'table-action-consent-verified' : ''}`}
                      onClick={() => setActiveConsentUser(u)}
                    >
                      {consent ? (
                        <>
                          <ShieldCheck size={13} className="text-emerald" /> Logged
                        </>
                      ) : (
                        <>
                          <ShieldAlert size={13} className="text-muted" /> Check
                        </>
                      )}
                    </button>
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <div className="table-actions-cell">
                      <AdminAction
                        kind="user"
                        id={u.id}
                        value={!u.is_suspended}
                        label={u.is_suspended ? 'Restore' : 'Suspend'}
                      />
                      <AdminAction kind="user" id={u.id} value="remove" label="Remove" remove />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan={6}>No active member profiles found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeConsentUser && (
        <div
          className="confirm-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setActiveConsentUser(null);
          }}
        >
          <section className="confirm-modal admin-consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
            <div className="admin-consent-modal-head">
              <div>
                <span className="eyebrow">LEGAL & PRIVACY AUDIT</span>
                <h2 id="consent-title">Consent Record</h2>
              </div>
              <button
                type="button"
                className="offer-close"
                onClick={() => setActiveConsentUser(null)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="admin-consent-member-bar">
              <div>
                <strong>{activeConsentUser.email}</strong>
                {activeConsentUser.full_name && <span>{activeConsentUser.full_name}</span>}
              </div>
              <span className={`status-pill ${selectedConsent ? 'status-active' : 'status-muted'}`}>
                {selectedConsent ? 'Consent Verified' : 'No Consent On File'}
              </span>
            </div>

            {selectedConsent ? (
              <div className="admin-consent-body">
                <div className="admin-consent-grid">
                  <div className="admin-consent-item">
                    <span className="admin-consent-label">
                      <Calendar size={13} /> Accepted Timestamp
                    </span>
                    <b>{formatDateTime(selectedConsent.accepted_at)}</b>
                  </div>
                  <div className="admin-consent-item">
                    <span className="admin-consent-label">
                      <Globe size={13} /> Recorded IP Address
                    </span>
                    <code>{selectedConsent.ip_address || '127.0.0.1 (Local / Proxy)'}</code>
                  </div>
                  <div className="admin-consent-item admin-consent-col-span">
                    <span className="admin-consent-label">
                      <Smartphone size={13} /> Device &amp; Browser
                    </span>
                    <b>
                      {parseDevice(selectedConsent.user_agent).icon}{' '}
                      {parseDevice(selectedConsent.user_agent).label}
                    </b>
                    <small className="admin-consent-raw-ua">{selectedConsent.user_agent || 'Not captured'}</small>
                  </div>
                </div>

                <div className="admin-consent-policies">
                  <span className="admin-consent-label">
                    <FileText size={13} /> Consented Agreements &amp; Policy Versions
                  </span>
                  <div className="admin-consent-policies-list">
                    <div>
                      <span>Terms &amp; Conditions</span>
                      <code>Version {selectedConsent.terms_version}</code>
                    </div>
                    <div>
                      <span>Risk Disclosure Statement</span>
                      <code>Version {selectedConsent.risk_disclosure_version}</code>
                    </div>
                    <div>
                      <span>Privacy Policy</span>
                      <code>Version {selectedConsent.privacy_policy_version}</code>
                    </div>
                    <div>
                      <span>Refund &amp; Cancellation</span>
                      <code>Version {selectedConsent.refund_policy_version}</code>
                    </div>
                  </div>
                </div>

                <div className="admin-consent-hash">
                  <span className="admin-consent-label">
                    <KeyRound size={13} /> Cryptographic Agreement SHA-256 Hash
                  </span>
                  <code>{selectedConsent.agreement_hash}</code>
                </div>
              </div>
            ) : (
              <div className="admin-consent-empty">
                <ShieldAlert size={28} />
                <p>
                  No explicit agreement record was captured for this user. This usually happens if the user was
                  created directly via admin/seed or signed up prior to mandatory agreement capture.
                </p>
              </div>
            )}

            <div className="confirm-actions">
              <button
                type="button"
                className="button button-light button-small"
                onClick={() => setActiveConsentUser(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
