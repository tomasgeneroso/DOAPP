/**
 * Terms & Conditions — English copy. Single source for web and mobile.
 *
 * Web loads this through i18next (client/i18n/index.ts merges it into the
 * `termsPage` namespace); mobile imports it directly, since mobile has no i18n
 * runtime. The text previously lived twice — in client/i18n/locales/*.json and
 * hardcoded in mobile/app/legal/terms.tsx — which meant the two platforms could
 * silently drift apart on a legal document. Edit here and both follow.
 *
 * Keys are section-numbered: sNTitle / sNpM (paragraph) / sNliM (list item).
 *
 * Numbers (deadlines, commission, ladder) are NOT written here: they are
 * interpolated from shared/constants/policies.ts and membershipPricing.ts, so
 * the legal text says what the code does in the same deploy.
 */

import { POLITICAS, DISPUTA_AVISO_DIAS_ANTES } from '../constants/policies.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../constants/membershipPricing.js';
import { MINIMUM_COMMISSION_EUR } from '../pricing/minimums.js';

const P = POLITICAS;
const COMISION = COMMISSION_RATES.free;
const PRO_EUR = MEMBERSHIP_PRICES_EUR.pro;
const PARTE_TRABAJADOR_PCT = Math.round(P.CANCELACION_TARDIA_PARTE_TRABAJADOR * 100);

export const termsEn: Record<string, string> = {
  "metaTitle": "Terms and Conditions - DOAPP",
  "metaDescription": "General terms and conditions of use of the DOAPP platform",
  "back": "Back",
  "home": "Home",
  "title": "General Terms and Conditions of Use",
  "lastUpdated": "Last updated: September 12, 2026",
  "intro1": "These Terms and Conditions (hereinafter, the \"Terms\") govern access to and use of the digital platform called DOAPP (hereinafter, the \"Platform\") by any natural or legal person who registers and/or uses its services (hereinafter, the \"User\").",
  "intro2": "Use of the Platform implies full and unreserved acceptance of these Terms, which constitute a valid and binding contract in accordance with articles 958 and related articles of the National Civil and Commercial Code.",
  "s1Title": "1. Identification of the Platform Owner",
  "s1p": "The Platform is operated by DOAPP, with legal domicile in the Argentine Republic (hereinafter, \"DOAPP\").",
  "s2Title": "2. Service Description",
  "s2p": "DOAPP is a digital technological intermediation platform, under the marketplace and social network model, that connects:",
  "s2li1": "<b>Clients:</b> natural or legal persons who demand services.",
  "s2li2": "<b>Workers / Doers:</b> natural persons who offer professional services or trades independently.",
  "s2note": "DOAPP does NOT provide the published services, is NOT an employer, does NOT act as a party to the service contract, its role being limited to facilitating technological tools for contact, payment management, custody of funds, and dispute mediation.",
  "s3Title": "3. Legal Nature of the Relationship",
  "s3p1": "3.1. Workers register and act as independent and autonomous providers, without any employment, corporate, dependency, mandate, agency, or franchise relationship with DOAPP.",
  "s3p2": "3.2. Each contract entered into through the Platform is concluded exclusively between Client and Worker, who fully assume the rights and obligations arising from it.",
  "s3p3": "3.3. DOAPP does not exercise technical, disciplinary, or organizational control over the Workers, limiting itself to Platform usage rules.",
  "s4Title": "4. User Registration",
  "s4p1": "4.1. Access to the Platform requires prior registration and creation of a personal account.",
  "s4p2": "4.2. The User guarantees the truthfulness, accuracy, and updating of the data provided.",
  "s4p3": "4.3. DOAPP may require identity verification processes (KYC), including validation of email, phone, identity document, and tax data, especially for Workers and for the PRO membership.",
  "s4p4": "4.4. Scope of verification. As of today DOAPP verifies only the identity of Users. That verification is carried out using the tool of a specialised third party, Didit (didit.me), which analyses the identity document presented and performs a liveness check using facial recognition. To that end, the User consents to DOAPP transmitting the images of their document and face to that provider, for the sole purpose of verifying their identity and preventing fraud. The provider's processing of that data is additionally governed by its own policies. DOAPP does NOT verify professional licenses, permits, qualifications or insurance policies. A User may declare holding a license or insurance and provide supporting documentation: such documentation is kept for informational purposes and its display on the Platform does NOT imply that DOAPP has confirmed its authenticity, validity or currency with the relevant authority or insurer.",
  "s4p5": "4.5. It is the hiring User's sole responsibility to verify, by their own means and with the relevant official registries, that the professional holds the license, permit or insurance they declare, particularly in regulated activities. DOAPP will give notice if it incorporates verification of these details against official sources in the future.",
  "s5Title": "5. Service Categories",
  "s5p": "The Platform allows the publication and hiring of services, among others:",
  "s5li1": "Cleaning",
  "s5li2": "Moving",
  "s5li3": "Gardening",
  "s5li4": "Construction",
  "s5li5": "Technology",
  "s5li6": "Various professional services",
  "s5note": "DOAPP does not guarantee the suitability, quality, outcome, or legality of the services offered.",
  "s6Title": "6. Hiring System",
  "s6p1": "6.1. The hiring cycle includes: publication, application, acceptance, payment, execution, confirmation by a platform administrator, and completion.",
  "s6p2": "6.2. The acceptance by the Worker and the Client generates a binding digital contract between them.",
  "s6p3": "6.3. The system requires bilateral confirmation of completion for the release of funds.",
  "s6p4": "6.4. <b>The published price is the price of the job.</b> When the Client publishes stating an amount, that is the agreed price and the one charged, unless a Worker submits a quote for a different amount and the Client chooses to accept it. When the Client publishes \"open to quotes\", no price exists until a quote is accepted.",
  "s6p5": "6.5. <b>Accepting a quote requires prior payment.</b> The Worker is selected and the contract is created only after payment clears. If the accepted quote exceeds what was already paid at publication, the Client must pay the difference together with the corresponding commission before the selection takes effect. Until payment clears, the quote remains available and the Worker is not committed.",
  "s6p6": `6.6. <b>Publications without an accepted quote.</b> \"Open to quotes\" publications that do not obtain an accepted quote within ${P.COTIZAR_DIAS_HABILES_ANTES_DE_PAUSAR} business days of publication or of their last resumption are paused automatically. Pausing does not cancel the publication nor delete quotes already received: the Client may resume it at any time and the period is counted again from resumption. <b>Publications whose price was paid at publication are not paused for this reason</b> and remain available until the Client cancels them.`,
  "s7Title": "7. Payments, Commissions, and Escrow",
  "s7p1": "7.1. Payments are processed through MercadoPago, accepting the methods enabled by that provider.",
  "s7p2": "7.2. DOAPP acts as custodian of funds (escrow), holding the money until the service is confirmed.",
  "s7p3": `7.3. DOAPP charges a ${COMISION}% commission on the job price, paid by the Client and shown before every payment. The commission is the same with or without a membership: the membership buys visibility (section 8), not discounts. During the launch period (beta), whose end date is shown on the Platform, the commission is 0%; afterwards the stated rate applies. The following table summarises the commission per plan:`,
  "thPlan": "Plan",
  "thCommission": "Commission",
  "planProMonth": `PRO (€${PRO_EUR}/month, at the day's exchange rate)`,
  "s7p4": `7.4. <b>Minimum commission.</b> The commission has a floor equivalent to EUR ${MINIMUM_COMMISSION_EUR}, converted to pesos at the day's exchange rate and shown before paying. The floor covers the fixed cost each contract has for the Platform. The minimum contract amount (section 7.8) is set so that this floor does not distort the job price.`,
  "s7p5": "7.5. DOAPP's commission is non-refundable once the publication has been approved, even in cases of cancellation or dispute. The only exception is cancellation prior to approval (section 9.1), where it is refunded in full.",
  "s7p6": `7.6. <b>Automatic release due to Client absence:</b> If a job ends (due date reached) and the Client does not confirm receipt of the service within the following ${P.AUTO_CONFIRMACION_HORAS} hours, the payment held in custody will be automatically released to the assigned Workers. The Platform commission corresponding to the Client's plan is retained in all cases. The Client will receive notifications before and during this process. This clause does not apply if there is an active dispute over the contract.`,
  "s7p7": "7.7. Workers will be notified before the start of the work, during its execution, and at the time of payment release. In the event of the Client's absence in accordance with point 7.6, Workers will receive immediate notice by email and notification on the Platform.",
  "s7p8": "7.8. <b>Minimum amounts.</b> The Platform sets a minimum contract amount and a minimum extension amount. These minimums are not fees nor amounts set at will: the Platform derives them from the processing cost charged by the payment gateway, from the fixed cost each contract carries for the Platform — custody of funds, identity verification, and dispute handling —, from the exchange rate, and from the applicable commission. When any of those values changes, the minimums are recalculated accordingly. The amounts in force are always disclosed before publishing and before accepting a quote. The minimum contract amount is verified when a quote is accepted, which is when a definitive price exists; an \"open to quotes\" publication may be created without a price.",
  "s7p9": "7.9. <b>Credit balance from a quote below the published price.</b> If the Client paid the published price and then accepts a quote for a lower amount, the difference is credited as a balance within the Platform. That balance may be used at no cost on any subsequent publication or hiring. The Client may also request its transfer to a bank account in their name; in that case, <b>the processing cost charged by the payment gateway for the operation is deducted from the amount transferred</b>, since this is a return of money already processed and the Platform charges no commission on that difference. The amount of that cost is disclosed before the request is confirmed. If the Client does not accept that deduction, the balance remains available on the Platform indefinitely.",
  "s8Title": "8. Memberships and Subscriptions",
  "s8p1": `8.1. DOAPP offers a free plan and a PRO membership at €${PRO_EUR} per month (charged in pesos at the day's exchange rate), with automatic monthly renewal. The membership buys visibility —profile promotion, badge, priority in search results and statistics— and does not change the commission. During the launch period (beta) the membership is not for sale.`,
  "s8p2": "8.2. Cancellation does not generate a refund and the benefits remain until the expiration of the paid period.",
  "s8p3": "8.3. DOAPP may modify prices, notifying the User in advance.",
  "s9Title": "9. Cancellations",
  "s9p1": "9.1. Cancellations prior to acceptance by a platform Administrator: full refund.",
  "s9p2": `9.2. Client cancellations made at least ${P.CANCELACION_CLIENTE_HORAS_ANTES} hours before the start: the job price is returned as credit on the Platform. The publication commission is not refunded once the publication has been approved.`,
  "s9p3": `9.3. <b>Late Client cancellations</b> (less than ${P.CANCELACION_CLIENTE_HORAS_ANTES} hours before the start, or during execution): if a Worker had been selected, ${PARTE_TRABAJADOR_PCT}% of the price is paid to the Worker for the time they reserved and the rest is returned to the Client as credit; if no Worker had been selected, the full price is returned to the Client. In both cases the publication commission is retained.`,
  "s9p4": `9.4. <b>Cancellation by the Worker of an accepted contract.</b> Cancelling a job already accepted harms the Client and the Platform. Therefore, Worker cancellations within a ${P.CANCELACION_VENTANA_DIAS}-day period carry gradual consequences: the first generates a warning; the second makes visible on the Worker's profile, for ${P.CANCELACION_MARCA_VISIBLE_DIAS} days, a mark indicating they cancelled accepted jobs; the third suspends the ability to apply for new jobs for ${P.CANCELACION_SUSPENSION_3RA_DIAS} days; the fourth or subsequent ones, for ${P.CANCELACION_SUSPENSION_4TA_DIAS} days. Ongoing contracts are not affected by the suspension. Giving timely notice that the job cannot be performed, through the feature provided on the Platform, counts as a cancellation for these purposes, but allows the Client to decide how to dispose of their money without delay.`,
  "s10Title": "10. Disputes and Mediation",
  "s10p1": "10.1. DOAPP acts as an internal mediator, without jurisdictional character.",
  "s10p2": "10.2. Opening a dispute freezes the funds until its resolution.",
  "s10p3": "10.3. The Administrator's decisions may consist of full release, full refund, partial refund, or closure without action. To reach the final resolution, the information voluntarily submitted by the parties about the hiring conditions will be used.",
  "s10p4": "10.4. The Platform commission is not refunded under any circumstances.",
  "s10p5": "10.5. <b>Required details and desirable details:</b> When creating or extending a contract, the parties agree on <b>required details</b>: concrete, verifiable conditions defining what counts as the work being done (for example, «the tap must not leave teflon tape visible at the thread»). Only those details can ground a dispute. <b>Desirable details</b> are preferences the parties may record to guide the work, but they <b>cannot ground or originate a dispute</b>.",
  "s10p6": "10.6. DOAPP does not intervene in or resolve claims based on conditions that were not agreed as required details before the work started or before the extension was approved. Agreeing on the required details is the parties' responsibility; the Platform provides the tool to record them.",
  "s10p7": `10.7. <b>Time limit to claim:</b> A dispute may be opened while the contract is running and up to ${P.DIAS_PARA_DISPUTAR} calendar days after it ends. After that, the contract is deemed accepted without objection. Opening a dispute within that window does not hold funds already released, but it enables DOAPP mediation and is placed on record.`,
  "s10p8": "10.8. <b>Chargebacks:</b> If the Client disputes a payment with their bank or card issuer (chargeback) instead of using the Platform dispute system, they agree to notify DOAPP beforehand. The Client is liable for the amount claimed where the service was actually rendered, and DOAPP may claim it back, suspend the account and withhold available balances until resolution. DOAPP will present the contract evidence to the issuer: confirmations from both parties, pairing code, message history and dates.",
  "s10p9": "10.9. The internal dispute system is the intended route for claims. Starting a chargeback without having tried it does not release the User from the obligations under these Terms.",
  "s10p10": `10.10. <b>Failure to respond in a dispute.</b> Each party has ${P.DISPUTA_DIAS_PARA_RESPONDER} calendar days to respond to the other party's last message within a dispute. Opening the dispute counts as the first message. If a party does not respond within that period, the dispute is automatically resolved in favour of the party who responded last: if the non-responding party is the Worker, the held funds are returned to the Client; if it is the Client, the payment is released to the Worker. The Platform sends a notice to the silent party ${DISPUTA_AVISO_DIAS_ANTES} days before the deadline. Messages from the Platform's administration do not interrupt this period. The Platform commission is not refunded in any case, per section 7.5.`,
  "s11Title": "11. Liability",
  "s11p1": "11.1. DOAPP is not liable for:",
  "s11li1": "The quality, execution, or outcome of the services.",
  "s11li2": "Personal, material, or property damages arising from the provision.",
  "s11p2": "11.2. The User releases DOAPP from any claim arising from their contractual relationship with other Users.",
  "s12Title": "12. Taxes and Invoicing",
  "s12p1": "12.1. Workers are responsible for issuing the corresponding invoices and complying with their tax obligations before AFIP.",
  "s12p2": "12.2. DOAPP may issue an invoice for the collection of its commissions.",
  "s13Title": "13. Personal Data Protection",
  "s13p1": "13.1. DOAPP complies with Law 25.326 on Personal Data Protection.",
  "s13p2": "13.2. Banking and identity data are stored in encrypted form.",
  "s13p3": "13.3. The User may exercise the rights of access, rectification, deletion, and objection.",
  "s14Title": "14. Advertising",
  "s14p": "DOAPP may offer advertising spaces subject to availability, prior approval, and advance payment.",
  "s15Title": "15. Sanctions",
  "s15p": "DOAPP may apply warnings, suspensions, or permanent cancellation of accounts in the event of breaches, fraud, or misuse of the Platform.",
  "s16Title": "16. Modifications",
  "s16p": "DOAPP may modify these Terms, which will take effect from their publication.",
  "s17Title": "17. Applicable Law and Jurisdiction",
  "s17p": "These Terms are governed by the laws of the Argentine Republic. For consumers, the court of the User's domicile will have jurisdiction in accordance with Law 24.240.",
  "s18Title": "18. Acceptance",
  "s18p": "The User declares to have read, understood, and fully accepted these Terms and Conditions.",
  "importantNote": "<b>Important note:</b> By registering and using DOAPP, you confirm that you have read, understood, and accepted these Terms and Conditions in full.",
  "acceptAndBack": "I accept the terms, go back",
};
