import { handleDebtAction } from "@/lib/parkingDebtActionRoute";
import { validateWaiveDebtInput } from "@/lib/parkingDebtsCore.mjs";
import { waiveDebt } from "@/lib/parkingDebtsRepository";

// Condona una deuda con motivo obligatorio. Solo administrador (D9).
export async function POST(request, { params }) {
  return handleDebtAction(request, params, {
    validate: validateWaiveDebtInput,
    apply: (db, { debtId, actor, channel, reason }) => waiveDebt(db, { debtId, actor, channel, reason }),
  });
}
