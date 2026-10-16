import { AGREEMENT_TEXT, AGREEMENT_VERSIONS, RISK_DISCLOSURE_TEXT } from '@/lib/legal/agreement-copy';

export { AGREEMENT_TEXT, AGREEMENT_VERSIONS, RISK_DISCLOSURE_TEXT };

export type PolicyDoc = {
  id: 'checkout' | 'terms' | 'risk' | 'privacy' | 'refund';
  title: string;
  versionKey?: keyof typeof AGREEMENT_VERSIONS;
  updated: string;
  intro: string;
  publicUrl?: string;
  sections?: [string, string][];
};

export const POLICY_DOCUMENTS: Record<'checkout' | 'terms' | 'risk' | 'privacy' | 'refund', PolicyDoc> = {
  checkout: {
    id: 'checkout',
    title: 'Pre-Payment Binding Consent',
    updated: '8 October 2026',
    intro: 'This is the exact legal agreement and risk statement that the member agreed to before completing checkout.',
  },
  terms: {
    id: 'terms',
    title: 'Terms & Conditions',
    versionKey: 'terms',
    updated: '8 October 2026',
    publicUrl: '/terms',
    intro: 'These terms govern use of the Signalroom website, membership and educational content. By creating an account or purchasing a plan, you agree to these terms.',
    sections: [
      ['The service', 'Signalroom provides general market research, educational material and access to a member discussion community. Content is provided for informational and educational purposes only.'],
      ['No financial advice', 'Nothing we publish is individualized investment advice, a recommendation to buy or sell a financial instrument, or a promise of results. You make your own decisions and are responsible for your own research.'],
      ['Membership and account', 'Membership is personal and non-transferable. Keep your login credentials secure and provide accurate account details. We may suspend accounts involved in fraud, abuse, unlawful conduct or material breach of these terms.'],
      ['Payments and renewal', 'Plan fees, billing periods and applicable taxes are shown at checkout. Payment is processed by Razorpay. Plans are one-time period purchases and do not renew automatically. Members may make a new purchase when their paid access ends.'],
      ['Community conduct', 'Do not share private links or paid materials, impersonate others, harass members, post unlawful content or present another member’s views as professional advice. Community access may be moderated to maintain a safe and useful space.'],
      ['Availability and changes', 'We may update, pause or discontinue features when reasonably necessary. We will make reasonable efforts to keep the service available but do not promise uninterrupted access.'],
      ['Limitation', 'To the extent permitted by law, Signalroom is not responsible for trading losses, indirect losses, platform outages or decisions made using general educational content. Nothing here limits rights that cannot lawfully be excluded.'],
      ['Contact and governing terms', 'The operator should add its legal name, address, applicable jurisdiction and support contact before launch. Mandatory consumer rights under applicable law continue to apply.'],
    ],
  },
  risk: {
    id: 'risk',
    title: 'Trading Risk Disclaimer',
    versionKey: 'riskDisclosure',
    updated: '8 October 2026',
    publicUrl: '/risk-disclaimer',
    intro: 'Trading and investing involve risk. Read this disclaimer before using any Signalroom research, signal, example or educational material.',
    sections: [
      ['Risk of loss', 'Trading in securities, derivatives, currencies, commodities and other financial instruments can result in substantial losses, including loss of all capital allocated. Leverage can increase losses and may result in losses greater than your initial deposit.'],
      ['No assured outcome', 'There is no guarantee that any setup, market view, strategy or educational example will be profitable or suitable. Past performance and illustrative examples do not predict future results.'],
      ['General education only', 'Signalroom material is general information for education and discussion. It does not take account of your financial circumstances, objectives or risk tolerance, and is not individualized financial, investment, tax or legal advice.'],
      ['Your responsibility', 'You are solely responsible for evaluating information, making decisions, managing risk and complying with laws and platform rules that apply to you. Consider consulting a suitably qualified independent professional.'],
      ['Timeliness and accuracy', 'Market conditions change rapidly. Information may be incomplete, delayed or inaccurate, and opinions may change without notice. Verify current prices and relevant facts independently before acting.'],
      ['No account access or execution', 'Signalroom does not access your brokerage account, hold your funds or execute trades for you. Never provide account passwords, OTPs or private financial credentials to community members.'],
      ['Jurisdiction', 'Financial products and the availability of research services differ by location. You are responsible for confirming that your participation complies with the requirements applicable to you.'],
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    versionKey: 'privacy',
    updated: '8 October 2026',
    publicUrl: '/privacy',
    intro: 'This policy explains how Signalroom collects, uses and protects information when you visit our website or use a membership account.',
    sections: [
      ['Information we collect', 'We collect account details such as your email address, authentication records, membership and payment status, and information you choose to provide when contacting us. Razorpay processes payment details; Signalroom does not store full card or bank credentials.'],
      ['How we use information', 'We use information to create and secure accounts, provide membership access, verify payments, manage renewals, respond to support requests and meet legal obligations. We do not sell personal information.'],
      ['Service providers', 'We rely on Supabase for authentication and database hosting, Vercel for application hosting and Razorpay for payment processing. Their own terms and privacy notices also apply to their services.'],
      ['Retention and security', 'We retain account and transaction records for as long as needed to provide the service and meet legal and accounting requirements. We use access controls and server-side secrets, but no internet service can promise absolute security.'],
      ['Your choices', 'You may request access, correction or deletion of personal information, subject to records we must retain. Contact the service operator through the support contact published on this website.'],
      ['Cookies and changes', 'Authentication cookies are used to maintain your secure session. We may update this policy; the effective date above will change when we do.'],
    ],
  },
  refund: {
    id: 'refund',
    title: 'Refund & Cancellation Policy',
    versionKey: 'refund',
    updated: '8 October 2026',
    publicUrl: '/refund-policy',
    intro: 'Please review the plan and billing details before purchase. This policy applies to Signalroom digital memberships, subject to any non-waivable rights under applicable law.',
    sections: [
      ['Cancellation of renewal', 'Plans are one-time period purchases and do not renew automatically. No cancellation action is needed to prevent a future charge. Your access ends on the expiry date unless you choose to purchase another period.'],
      ['Digital access and refunds', 'Membership content and community access may be made available immediately after payment. Except as required by applicable law, completed membership payments are generally non-refundable once access has begun.'],
      ['Duplicate or incorrect charges', 'If you believe you were charged twice or charged an incorrect amount, contact support with your account email and payment reference. We will investigate verified billing errors and arrange an appropriate correction or refund.'],
      ['Failed payment', 'A failed or incomplete payment does not activate membership. If your bank shows a debit while checkout reports failure, allow time for the payment provider or bank to reverse it, then contact support if it remains unresolved.'],
      ['How to request help', 'Include your account email, approximate transaction date and Razorpay payment or order reference. Never send full card details or passwords in a support request.'],
      ['Policy changes', 'This policy may be updated for future purchases. The version in effect at the time of purchase applies, subject to applicable law.'],
    ],
  },
};
