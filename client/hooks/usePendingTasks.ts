import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Single source of truth for "what is this user missing?".
 *
 * Before this hook the answer lived in three places that disagreed with each
 * other: the Dashboard modal (dni/phone/cbu), User.getCredibilityInfo() on the
 * server (identity/contact/license/insurance) and KycWelcomeModal (dniVerified
 * only). Anything that renders an attention dot has to read from here so the
 * dot and the screen it points at never contradict each other.
 *
 * Two independent axes, deliberately not the same field:
 *   - `priority`  drives the attention dot (high = red, never silenceable).
 *   - `inModal`   drives the Dashboard "completá tu perfil" modal, which stays
 *                 limited to the four items it already blocked on. Raising a
 *                 task to `high` must not silently start popping a modal at
 *                 users who never saw it before.
 */

export type TaskId =
  | "dni_number"
  | "identity"
  | "phone"
  | "phone_verified"
  | "email_verified"
  | "selfie"
  | "cbu"
  | "license"
  | "insurance";

export type TaskPriority = "high" | "medium" | "low";
export type SettingsSection = "basic" | "banking" | "profession";

export interface PendingTask {
  id: TaskId;
  /** i18n key; `label` is the es-AR fallback so existing translations keep working. */
  labelKey: string;
  label: string;
  descKey: string;
  desc: string;
  done: boolean;
  priority: TaskPriority;
  /** Set when the task was submitted but is not resolved yet. */
  status?: "in_review" | "rejected" | null;
  /** Which settings tab resolves it — this is what lights up the tab dot. */
  section: SettingsSection;
  to: string;
  /** Whether it participates in the Dashboard blocking modal. */
  inModal: boolean;
  /** The modal can be snoozed; a high-priority dot can never be. */
  dismissible: boolean;
}

const VERIFY_ANCHOR = "/settings?tab=basic#verificacion";

export interface PendingTasksResult {
  /** Every applicable task, done or not. */
  tasks: PendingTask[];
  /** Only the unfinished ones, highest priority first. */
  pending: PendingTask[];
  /** Unfinished tasks the Dashboard modal is allowed to block on. */
  modalTasks: PendingTask[];
  hasPending: boolean;
  /** Unfinished tasks owned by a settings tab — drives the per-tab dot. */
  countFor: (section: SettingsSection) => number;
  /** Highest priority among unfinished tasks, or null when everything is done. */
  highestPriority: TaskPriority | null;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export function usePendingTasks(): PendingTasksResult {
  const { user } = useAuth() as any;

  return useMemo(() => {
    const u = (user || {}) as any;

    // Same rule the credibility ladder uses (User.model.ts getCredibilityInfo),
    // so "claims to have a matrícula" means the same thing on both sides.
    const isProfessional = !!(u.profession || u.licenseNumber || u.licenseDocumentUrl);
    const hasBalance = Number(u.balance) > 0;
    // What "having declared your matrícula" means while the check is a records
    // check: the number identifies it, the document backs it up. Both required.
    const hasLicenseData = !!u.licenseNumber && !!u.licenseDocumentUrl;

    const licenseStatus: PendingTask["status"] =
      u.licenseVerificationStatus === "rejected"
        ? "rejected"
        : u.licenseVerificationStatus === "pending" && !!u.licenseDocumentUrl
          ? "in_review"
          : null;

    const insuranceStatus: PendingTask["status"] =
      u.insuranceVerificationStatus === "rejected"
        ? "rejected"
        : u.insuranceVerificationStatus === "pending" && !!u.insuranceDocumentUrl
          ? "in_review"
          : null;

    const identityStatus: PendingTask["status"] =
      u.kycStatus === "Declined" ? "rejected" : u.kycStatus === "In Review" ? "in_review" : null;

    const all: Array<PendingTask | null> = [
      {
        id: "dni_number",
        labelKey: "dashboard.completeProfile.dniLabel",
        label: "Número de DNI",
        descKey: "dashboard.completeProfile.dniDesc",
        desc: "Necesario para verificar tu identidad.",
        done: !!u.dni && !u.needsDni,
        priority: "high",
        section: "basic",
        to: VERIFY_ANCHOR,
        inModal: true,
        dismissible: false,
      },
      {
        id: "identity",
        labelKey: "dashboard.completeProfile.identityLabel",
        label: "Verificación de identidad",
        descKey: "dashboard.completeProfile.identityDesc",
        desc: "Subí las fotos de tu DNI (frente y dorso) para poder trabajar y publicar.",
        done: !!u.dniVerified,
        priority: "high",
        status: identityStatus,
        section: "basic",
        to: VERIFY_ANCHOR,
        inModal: true,
        dismissible: false,
      },
      {
        id: "phone",
        labelKey: "dashboard.completeProfile.phoneLabel",
        label: "Teléfono",
        descKey: "dashboard.completeProfile.phoneDesc",
        desc: "Para poder contactarte sobre tus trabajos.",
        done: !!u.phone,
        priority: "high",
        section: "basic",
        to: "/settings?tab=basic",
        inModal: true,
        dismissible: false,
      },
      // Loading a number and confirming it are different things: the Dashboard
      // modal only ever checked the former, the credibility ladder only the
      // latter. Chained so the confirmation only appears once there is a number,
      // and gated on the backend actually being able to send the WhatsApp code —
      // a blocking, non-dismissible dot for an impossible task is worse than no
      // dot at all. Flips on by itself once the channel is configured.
      u.phone && u.capabilities?.phoneVerification
        ? {
            id: "phone_verified",
            labelKey: "tasks.phoneVerifiedLabel",
            label: "Confirmación de teléfono",
            descKey: "tasks.phoneVerifiedDesc",
            desc: "Te enviamos un código por WhatsApp para confirmar que el número es tuyo.",
            done: !!u.phoneVerified,
            priority: "high",
            section: "basic",
            to: VERIFY_ANCHOR,
            inModal: false,
            dismissible: false,
          }
        : null,
      {
        // The other half of credibility level 2 (getCredibilityInfo pairs
        // isVerified with phoneVerified), and the only one that had no task:
        // a signed-in user who lost the original mail had nowhere to resend it.
        id: "email_verified",
        labelKey: "tasks.emailVerifiedLabel",
        label: "Confirmación de correo",
        descKey: "tasks.emailVerifiedDesc",
        desc: "Confirmá tu correo desde el enlace que te enviamos, o pedí uno nuevo.",
        done: !!u.isVerified,
        priority: "high",
        section: "basic",
        to: VERIFY_ANCHOR,
        inModal: false,
        dismissible: false,
      },
      {
        id: "selfie",
        labelKey: "tasks.selfieLabel",
        label: "Selfie de verificación",
        descKey: "tasks.selfieDesc",
        desc: "Confirmá que sos vos con una selfie. Suma credibilidad a tu perfil.",
        done: !!u.selfieUrl,
        priority: "high",
        section: "basic",
        to: VERIFY_ANCHOR,
        // Deliberately out of the modal: it was never a blocker and turning it
        // into one would pop a modal at every existing user without a selfie.
        inModal: false,
        dismissible: false,
      },
      {
        id: "cbu",
        labelKey: "dashboard.completeProfile.bankingLabel",
        label: "Datos bancarios (CBU)",
        descKey: "dashboard.completeProfile.bankingDesc",
        desc: "Para recibir tus pagos cuando trabajes.",
        done: !!u.bankingInfo?.cbu,
        // Money you have earned but cannot withdraw is urgent; otherwise it can wait.
        priority: hasBalance ? "high" : "medium",
        section: "banking",
        to: "/settings?tab=banking",
        inModal: true,
        dismissible: !hasBalance,
      },
      // ── Declared credentials ──────────────────────────────────────────────
      // DECLARATIVE PHASE. There is no authoritative source to check a matrícula
      // against yet, so admin approval is a records check, not verification. The
      // task therefore completes when the user has *supplied* the data — holding
      // a red, non-dismissible dot hostage to an arbitrary admin judgement would
      // leave professionals blocked with nothing they can do about it.
      // A rejection reopens it, because that means the document was unreadable
      // or did not match what was declared.
      //
      // WHEN THE GOVERNMENT REGISTRY INTEGRATION LANDS: flip these two `done`
      // expressions back to `!!u.licenseVerified` / `!!u.insuranceVerified` and
      // restore the "la validamos" wording. Those are the only two lines that
      // need to change — the priorities, dots and admin screens already work off
      // the real status field.
      isProfessional
        ? {
            id: "license",
            labelKey: "tasks.licenseLabel",
            label: "Datos de matrícula",
            descKey: "tasks.licenseDesc",
            desc: "Declaraste una profesión con matrícula: cargá el número y el documento para dejarlos registrados.",
            done: hasLicenseData && licenseStatus !== "rejected",
            // High only for users who claim to hold one — a plain user never sees it.
            priority: "high",
            status: licenseStatus,
            section: "profession",
            to: "/settings?tab=profession",
            inModal: false,
            dismissible: false,
          }
        : null,
      isProfessional
        ? {
            id: "insurance",
            labelKey: "tasks.insuranceLabel",
            label: "Seguro",
            descKey: "tasks.insuranceDesc",
            desc: "Cargá tu póliza vigente para dejarla registrada en tu perfil.",
            done: !!u.insuranceDocumentUrl && insuranceStatus !== "rejected",
            priority: "medium",
            status: insuranceStatus,
            section: "profession",
            to: "/settings?tab=profession",
            inModal: false,
            dismissible: true,
          }
        : null,
    ];

    const tasks = all.filter(Boolean) as PendingTask[];
    const pending = tasks
      .filter((t) => !t.done)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    return {
      tasks,
      pending,
      modalTasks: pending.filter((t) => t.inModal),
      hasPending: pending.length > 0,
      countFor: (section: SettingsSection) => pending.filter((t) => t.section === section).length,
      highestPriority: pending.length ? pending[0].priority : null,
    };
  }, [user]);
}

export default usePendingTasks;
