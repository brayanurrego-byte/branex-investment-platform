"use client"

import { createContext, useContext, type ReactNode } from 'react'
import { useBranexData } from '@/hooks/use-branex-data'

type BranexContextType = ReturnType<typeof useBranexData>

const defaultContext: BranexContextType = {
  user: null, profile: { name: '', company: '', currency: 'USD', portfolioStartDate: '', initialCapital: 0, benchmark: 'SP500' },
  portfolios: [], activePortfolio: null, activePortfolioId: null,
  holdings: [], holdingsWithMetrics: [], transactions: [], snapshots: [],
  metrics: { totalValue: 0, totalInvested: 0, totalPnL: 0, totalReturnPercent: 0, activePositions: 0, sharpeRatio: 0, sectorAllocation: [] },
  isLoaded: false, SECTOR_COLORS: {},
  createPortfolio: async () => null,
  selectPortfolio: () => {},
  renamePortfolio: async () => {},
  deletePortfolio: async () => {},
  exitPortfolio: () => {},
  updateProfile: async () => {},
  updatePortfolioMeta: async () => {},
  addHolding: async () => {},
  updateHolding: async () => {},
  deleteHolding: async () => {},
  updateHoldingPrice: async () => {},
  addTransaction: async () => {},
  deleteTransaction: async () => {},
  saveWeeklySnapshot: async () => false,
  exportToCSV: () => '',
}

const BranexContext = createContext<BranexContextType>(defaultContext)

export function BranexProvider({ children }: { children: ReactNode }) {
  const branexData = useBranexData()
  return (
    <BranexContext.Provider value={branexData}>
      {children}
    </BranexContext.Provider>
  )
}

export function useBranex() {
  return useContext(BranexContext)
}
