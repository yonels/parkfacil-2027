export function rateDisplay(rate, formatMoney) {
  if (rate?.billingMode === "EFFECTIVE_MINUTE") {
    return `${formatMoney(rate.minuteAmount)} por minuto`;
  }
  const blocks = [...(rate?.blocks || [])].sort((a, b) => a.sequence - b.sequence);
  const firstBlock = blocks[0];
  const followingBlock = blocks.find((block) => block.sequence > 1);
  if (firstBlock && followingBlock) {
    return `Primer tramo ${formatMoney(firstBlock.amount)} · Tramos siguientes ${formatMoney(followingBlock.amount)}`;
  }
  if (firstBlock) return `Primer tramo ${formatMoney(firstBlock.amount)}`;
  return "Tarifa por tramos";
}

export function ticketHeaderData(parking, stay, isEntry) {
  const company = parking?.company || {};
  return {
    businessName: company.business_name || parking?.company_name || "Empresa",
    address: [company.address, company.district, company.city].filter(Boolean).join(", ")
      || [parking?.address, parking?.city].filter(Boolean).join(", "),
    rut: [company.rut_number, company.rut_dv].filter(Boolean).join("-") || "No informado",
    phone: company.phone || "No informado",
    issuedAt: isEntry ? stay?.entry_at : (stay?.exit_at || stay?.entry_at),
  };
}
