import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  type DisplayCurrency,
  DEFAULT_EUR_RATE,
  formatMoney,
  currencySymbol,
  toBase,
  fromBase,
} from './currency';

interface CurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  eurRate: number;
  setEurRate: (r: number) => void;
  symbol: string;
  /** Formate un montant exprimé en Ariary selon la devise d'affichage. */
  format: (baseAmount: number) => string;
  /** Convertit une saisie (devise affichée) vers la base Ariary. */
  toBase: (displayAmount: number) => number;
  /** Convertit un montant Ariary vers la devise affichée. */
  fromBase: (baseAmount: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const LS_CURRENCY = 'stockflow_display_currency';
const LS_RATE = 'stockflow_eur_rate';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(
    () => (localStorage.getItem(LS_CURRENCY) as DisplayCurrency) || 'MGA',
  );
  const [eurRate, setEurRateState] = useState<number>(() => {
    const saved = Number(localStorage.getItem(LS_RATE));
    return saved > 0 ? saved : DEFAULT_EUR_RATE;
  });

  useEffect(() => {
    localStorage.setItem(LS_CURRENCY, displayCurrency);
  }, [displayCurrency]);
  useEffect(() => {
    localStorage.setItem(LS_RATE, String(eurRate));
  }, [eurRate]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      displayCurrency,
      setDisplayCurrency: setDisplayCurrencyState,
      eurRate,
      setEurRate: setEurRateState,
      symbol: currencySymbol(displayCurrency),
      format: (base: number) => formatMoney(base, displayCurrency, eurRate),
      toBase: (d: number) => toBase(d, displayCurrency, eurRate),
      fromBase: (b: number) => fromBase(b, displayCurrency, eurRate),
    }),
    [displayCurrency, eurRate],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useMoney(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useMoney doit être utilisé à l\'intérieur de <CurrencyProvider>');
  return ctx;
}
