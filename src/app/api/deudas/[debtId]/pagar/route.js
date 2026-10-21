import { handleDebtAction } from "@/lib/parkingDebtActionRoute";
import { validatePayDebtInput } from "@/lib/parkingDebtsCore.mjs";
import { payDebt } from "@/lib/parkingDebtsRepository";

// Marca una deuda como pagada (medio y referencia opcional). Solo administrador.
export async function POST(request, { params }) {
  return handleDebtAction(request, params, {
    validate: validatePayDebtInput,
    apply: (db, { debtId, actor, channel, method, reference }) => payDebt(db, { debtId, actor, channel, method, reference }),
  });
}
