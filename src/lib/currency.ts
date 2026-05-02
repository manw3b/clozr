const FMT_ARS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const FMT_USD = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function convertToARS(amount: number, currency: string, rate: number): number {
  if (currency === "ARS") return amount;
  return amount * rate;
}

export function convertToUSD(amount: number, currency: string, rate: number): number {
  if (currency === "USD") return amount;
  if (rate === 0) return 0;
  return amount / rate;
}

export function formatMoney(amount: number, currency: string): string {
  if (currency === "USD") return `U$S ${FMT_USD.format(amount)}`;
  return `$ ${FMT_ARS.format(amount)}`;
}

export function formatMoneyConverted(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): string {
  const converted =
    toCurrency === "ARS"
      ? convertToARS(amount, fromCurrency, rate)
      : convertToUSD(amount, fromCurrency, rate);
  return formatMoney(converted, toCurrency);
}
