import 'server-only';
import { createHash } from 'node:crypto';
import { AGREEMENT_TEXT, AGREEMENT_VERSIONS, RISK_DISCLOSURE_TEXT } from '@/lib/legal/agreement-copy';

export { AGREEMENT_TEXT, AGREEMENT_VERSIONS, RISK_DISCLOSURE_TEXT };

export function createAgreementHash() {
  const canonicalAgreement = JSON.stringify({
    terms_version: AGREEMENT_VERSIONS.terms,
    risk_disclosure_version: AGREEMENT_VERSIONS.riskDisclosure,
    privacy_policy_version: AGREEMENT_VERSIONS.privacy,
    refund_policy_version: AGREEMENT_VERSIONS.refund,
    risk_disclosure_text: RISK_DISCLOSURE_TEXT,
    checkbox_text: AGREEMENT_TEXT,
  });
  return createHash('sha256').update(canonicalAgreement).digest('hex');
}
