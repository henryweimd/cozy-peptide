import {
  inferTargetClass,
  selectDefaultModality,
  type TargetClass,
} from "./prompt-steering";
import { selectDefaultHost } from "./chassis-compat";
import { DEFAULT_HOST, type HostId } from "./hosts";
import { DEFAULT_MODALITY, type Modality } from "./modality";
import type { DesignChoiceContext } from "./neurosymbolic-payload";

export interface ResolvedDesignChoices {
  targetClass: TargetClass;
  modality: Modality;
  host: HostId;
  choices: DesignChoiceContext;
  params: {
    modality: Modality;
    modality_requested: Modality | "auto";
    modality_reason?: string;
    host: HostId;
    host_requested: HostId | "auto";
    host_reason?: string;
  };
}

/**
 * Resolves one generation's scaffold and chassis: explicit values win,
 * omitted values auto-resolve from the inferred target class (best
 * scaffold for the objective, best chassis for the scaffold), with
 * reasons recorded for the response and the ledger. Shared by every
 * generation route so Auto means the same thing everywhere.
 */
export function resolveDesignChoices(
  target: string,
  mechanism: string | undefined,
  modality: Modality | undefined,
  host: HostId | undefined
): ResolvedDesignChoices {
  const targetClass = inferTargetClass(target, mechanism);
  const resolvedModality = modality ?? DEFAULT_MODALITY;
  const modalityAuto =
    modality === undefined ? selectDefaultModality(targetClass) : null;
  const finalModality = modalityAuto?.modality ?? resolvedModality;
  const hostAuto =
    host === undefined
      ? selectDefaultHost(targetClass, finalModality)
      : null;
  const finalHost = host ?? hostAuto?.host ?? DEFAULT_HOST;
  return {
    targetClass,
    modality: finalModality,
    host: finalHost,
    choices: {
      modalityRequested: modality ?? "auto",
      ...(modalityAuto !== null ? { modalityReason: modalityAuto.reason } : {}),
      host: finalHost,
      hostRequested: host ?? "auto",
      ...(hostAuto !== null ? { hostReason: hostAuto.reason } : {}),
    },
    params: {
      modality: finalModality,
      modality_requested: modality ?? "auto",
      ...(modalityAuto !== null ? { modality_reason: modalityAuto.reason } : {}),
      host: finalHost,
      host_requested: host ?? "auto",
      ...(hostAuto !== null ? { host_reason: hostAuto.reason } : {}),
    },
  };
}
