import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Mobile port of client/hooks/usePendingTasks.ts — same registry, same rules.
 * Keep the two in sync: the priorities and the `done` predicates are the
 * contract, the only intentional differences are `to` (Expo Router paths) and
 * the fact that mobile has no Dashboard modal, so `inModal` is unused here.
 */

export type TaskId =
  | 'dni_number'
  | 'identity'
  | 'phone'
  | 'phone_verified'
  | 'email_verified'
  | 'selfie'
  | 'cbu'
  | 'license'
  | 'insurance';

export type TaskPriority = 'high' | 'medium' | 'low';
export type SettingsSection = 'basic' | 'banking' | 'profession';

export interface PendingTask {
  id: TaskId;
  label: string;
  desc: string;
  done: boolean;
  priority: TaskPriority;
  status?: 'in_review' | 'rejected' | null;
  section: SettingsSection;
  to: string;
}

export interface PendingTasksResult {
  tasks: PendingTask[];
  pending: PendingTask[];
  hasPending: boolean;
  countFor: (section: SettingsSection) => number;
  highestPriority: TaskPriority | null;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const VERIFY_ROUTE = '/settings?section=verificacion';

export function usePendingTasks(): PendingTasksResult {
  const { user } = useAuth();

  return useMemo(() => {
    const u = user;

    if (!u) {
      return {
        tasks: [],
        pending: [],
        hasPending: false,
        countFor: () => 0,
        highestPriority: null,
      };
    }

    const isProfessional = !!(u.profession || u.licenseNumber || u.licenseDocumentUrl);
    const hasBalance = Number(u.balance) > 0;

    const statusOf = (
      value: 'pending' | 'approved' | 'rejected' | undefined,
      hasDoc: boolean,
    ): PendingTask['status'] =>
      value === 'rejected' ? 'rejected' : value === 'pending' && hasDoc ? 'in_review' : null;

    const all: Array<PendingTask | null> = [
      {
        id: 'dni_number',
        label: 'Número de DNI',
        desc: 'Necesario para verificar tu identidad.',
        done: !!u.dni && !u.needsDni,
        priority: 'high',
        section: 'basic',
        to: VERIFY_ROUTE,
      },
      {
        id: 'identity',
        label: 'Verificación de identidad',
        desc: 'Subí las fotos de tu DNI (frente y dorso) para poder trabajar y publicar.',
        done: !!u.dniVerified,
        priority: 'high',
        status:
          u.kycStatus === 'Declined' ? 'rejected' : u.kycStatus === 'In Review' ? 'in_review' : null,
        section: 'basic',
        to: VERIFY_ROUTE,
      },
      {
        id: 'phone',
        label: 'Teléfono',
        desc: 'Para poder contactarte sobre tus trabajos.',
        done: !!u.phone,
        priority: 'high',
        section: 'basic',
        to: '/settings',
      },
      // Gated on the backend being able to send the WhatsApp code — see the web
      // hook for why an impossible blocking task is worse than no task.
      u.phone && u.capabilities?.phoneVerification
        ? {
            id: 'phone_verified',
            label: 'Confirmación de teléfono',
            desc: 'Te enviamos un código por WhatsApp para confirmar que el número es tuyo.',
            done: !!u.phoneVerified,
            priority: 'high',
            section: 'basic',
            to: VERIFY_ROUTE,
          }
        : null,
      {
        // Other half of credibility level 2 — see the web hook.
        id: 'email_verified',
        label: 'Confirmación de correo',
        desc: 'Confirmá tu correo desde el enlace que te enviamos, o pedí uno nuevo.',
        done: !!u.isVerified,
        priority: 'high',
        section: 'basic',
        to: VERIFY_ROUTE,
      },
      {
        id: 'selfie',
        label: 'Selfie de verificación',
        desc: 'Confirmá que sos vos con una selfie. Suma credibilidad a tu perfil.',
        done: !!u.selfieUrl,
        priority: 'high',
        section: 'basic',
        to: VERIFY_ROUTE,
      },
      {
        id: 'cbu',
        label: 'Datos bancarios (CBU)',
        desc: 'Para recibir tus pagos cuando trabajes.',
        done: !!u.bankingInfo?.cbu,
        priority: hasBalance ? 'high' : 'medium',
        section: 'banking',
        to: '/settings',
      },
      isProfessional
        ? {
            // DECLARATIVE PHASE — see the web hook for the full rationale: with
            // no authoritative registry to check against, the task completes on
            // the data being supplied, not on an admin's judgement.
            id: 'license',
            label: 'Datos de matrícula',
            desc: 'Declaraste una profesión con matrícula: cargá el número y el documento para dejarlos registrados.',
            done: !!u.licenseNumber && !!u.licenseDocumentUrl && u.licenseVerificationStatus !== 'rejected',
            priority: 'high',
            status: statusOf(u.licenseVerificationStatus, !!u.licenseDocumentUrl),
            section: 'profession',
            to: '/settings',
          }
        : null,
      isProfessional
        ? {
            id: 'insurance',
            label: 'Seguro',
            desc: 'Cargá tu póliza vigente para dejarla registrada en tu perfil.',
            done: !!u.insuranceDocumentUrl && u.insuranceVerificationStatus !== 'rejected',
            priority: 'medium',
            status: statusOf(u.insuranceVerificationStatus, !!u.insuranceDocumentUrl),
            section: 'profession',
            to: '/settings',
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
      hasPending: pending.length > 0,
      countFor: (section: SettingsSection) => pending.filter((t) => t.section === section).length,
      highestPriority: pending.length ? pending[0].priority : null,
    };
  }, [user]);
}

export default usePendingTasks;
