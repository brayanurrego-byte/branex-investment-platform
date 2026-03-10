"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { 
  Holding, 
  Transaction, 
  UserProfile, 
  Portfolio,
  BranexStorage,
  PortfolioMetrics, 
  HoldingWithMetrics,
  PortfolioSnapshot
} from '@/lib/branex-types'

const STORAGE_KEY = 'branex_storage'

const SECTOR_COLORS: Record<string, string> = {
  'Tecnología': '#00A3FF',
  'Salud': '#00FF88',
  'Finanzas': '#7B61FF',
  'Consumo': '#FFB800',
  'Energía': '#FF3366',
  'Industrial': '#00D4FF',
  'Materiales': '#FF8C00',
  'Inmobiliario': '#9D4EDD',
  'Telecomunicaciones': '#06D6A0',
  'Servicios Públicos': '#EF476F',
  'Otros': '#8892b0',
}

// Empty default profile
const DEFAULT_PROFILE: UserProfile = {
  name: 'Usuario',
  company: '',
  currency: 'USD',
  portfolioStartDate: new Date().toISOString().split('T')[0],
  initialCapital: 0,
  benchmark: 'SP500',
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function useBranexData() {
  const [storage, setStorage] = useState<BranexStorage | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load data from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Check if it's the new multi-portfolio format
        if ('portfolios' in parsed) {
          setStorage(parsed)
        } else {
          // Migrate from old format
          const oldData = parsed
          const migratedPortfolio: Portfolio = {
            id: generateId(),
            name: 'Portafolio Principal',
            createdAt: new Date().toISOString(),
            holdings: oldData.holdings || [],
            transactions: oldData.transactions || [],
            snapshots: oldData.snapshots || [],
            profile: oldData.profile || DEFAULT_PROFILE,
          }
          const newStorage: BranexStorage = {
            activePortfolioId: migratedPortfolio.id,
            portfolios: [migratedPortfolio],
          }
          setStorage(newStorage)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newStorage))
        }
      } catch {
        // If parsing fails, initialize with empty storage
        const emptyStorage: BranexStorage = {
          activePortfolioId: null,
          portfolios: [],
        }
        setStorage(emptyStorage)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStorage))
      }
    } else {
      // First load - initialize with empty storage (NO PORTFOLIOS)
      const emptyStorage: BranexStorage = {
        activePortfolioId: null,
        portfolios: [],
      }
      setStorage(emptyStorage)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyStorage))
    }
    setIsLoaded(true)
  }, [])

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (storage && isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
    }
  }, [storage, isLoaded])

  // Get active portfolio
  const activePortfolio = useMemo(() => {
    if (!storage || !storage.activePortfolioId) return null
    return storage.portfolios.find(p => p.id === storage.activePortfolioId) || null
  }, [storage])

  // Holdings with calculated metrics
  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(() => {
    if (!activePortfolio?.holdings || activePortfolio.holdings.length === 0) return []
    
    const totalPortfolioValue = activePortfolio.holdings.reduce(
      (sum, h) => sum + h.currentPrice * h.quantity,
      0
    )
    
    return activePortfolio.holdings.map(h => {
      const marketValue = h.currentPrice * h.quantity
      const totalInvested = h.avgCost * h.quantity
      const totalPnL = marketValue - totalInvested
      const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
      const weight = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0
      
      return {
        ...h,
        marketValue,
        totalPnL,
        pnlPercent,
        weight,
      }
    })
  }, [activePortfolio?.holdings])

  // Calculate portfolio metrics
  const metrics: PortfolioMetrics = useMemo(() => {
    if (!activePortfolio?.holdings || activePortfolio.holdings.length === 0) {
      return {
        totalValue: 0,
        totalInvested: 0,
        totalPnL: 0,
        totalReturnPercent: 0,
        activePositions: 0,
        sharpeRatio: 0,
        sectorAllocation: [],
      }
    }

    const totalValue = holdingsWithMetrics.reduce((sum, h) => sum + h.marketValue, 0)
    const totalInvested = holdingsWithMetrics.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
    const totalPnL = totalValue - totalInvested
    const totalReturnPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
    const activePositions = activePortfolio.holdings.length

    // Calculate sector allocation
    const sectorMap: Record<string, number> = {}
    holdingsWithMetrics.forEach(h => {
      sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.marketValue
    })
    
    const sectorAllocation = Object.entries(sectorMap).map(([name, value]) => ({
      name,
      value: Math.round((value / totalValue) * 100),
      color: SECTOR_COLORS[name] || SECTOR_COLORS['Otros'],
    }))

    // Simplified Sharpe ratio calculation
    const avgReturn = totalReturnPercent / 2 // Annualized
    const riskFreeRate = 5 // 5% risk-free rate
    const volatility = 15 // Assumed 15% volatility
    const sharpeRatio = Number(((avgReturn - riskFreeRate) / volatility).toFixed(2))

    return {
      totalValue,
      totalInvested,
      totalPnL,
      totalReturnPercent,
      activePositions,
      sharpeRatio: Math.max(0, sharpeRatio),
      sectorAllocation,
    }
  }, [activePortfolio?.holdings, holdingsWithMetrics])

  // Helper to update active portfolio
  const updateActivePortfolio = useCallback((updater: (p: Portfolio) => Portfolio) => {
    setStorage(prev => {
      if (!prev || !prev.activePortfolioId) return prev
      return {
        ...prev,
        portfolios: prev.portfolios.map(p => 
          p.id === prev.activePortfolioId ? updater(p) : p
        ),
      }
    })
  }, [])

  // Create a new portfolio
  const createPortfolio = useCallback((name: string) => {
    const newPortfolio: Portfolio = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      holdings: [],
      transactions: [],
      snapshots: [],
      profile: { ...DEFAULT_PROFILE },
    }
    setStorage(prev => {
      if (!prev) return { activePortfolioId: newPortfolio.id, portfolios: [newPortfolio] }
      return {
        activePortfolioId: newPortfolio.id,
        portfolios: [...prev.portfolios, newPortfolio],
      }
    })
    return newPortfolio.id
  }, [])

  // Select a portfolio
  const selectPortfolio = useCallback((id: string) => {
    setStorage(prev => {
      if (!prev) return prev
      return { ...prev, activePortfolioId: id }
    })
  }, [])

  // Exit portfolio (go back to selection screen)
  const exitPortfolio = useCallback(() => {
    setStorage(prev => {
      if (!prev) return prev
      return { ...prev, activePortfolioId: null }
    })
  }, [])

  // Delete a portfolio
  const deletePortfolio = useCallback((id: string) => {
    setStorage(prev => {
      if (!prev) return prev
      const newPortfolios = prev.portfolios.filter(p => p.id !== id)
      return {
        activePortfolioId: prev.activePortfolioId === id ? null : prev.activePortfolioId,
        portfolios: newPortfolios,
      }
    })
  }, [])

  // Update portfolio metadata (name, etc)
  const updatePortfolioMeta = useCallback((updates: Partial<Pick<Portfolio, 'name'>>) => {
    updateActivePortfolio(p => ({ ...p, ...updates }))
  }, [updateActivePortfolio])

  // Add a new holding
  const addHolding = useCallback((holding: Omit<Holding, 'id' | 'sectorColor'>) => {
    updateActivePortfolio(p => {
      const newHolding: Holding = {
        ...holding,
        id: generateId(),
        sectorColor: SECTOR_COLORS[holding.sector] || SECTOR_COLORS['Otros'],
      }
      return {
        ...p,
        holdings: [...p.holdings, newHolding],
      }
    })
  }, [updateActivePortfolio])

  // Update an existing holding
  const updateHolding = useCallback((id: string, updates: Partial<Omit<Holding, 'id'>>) => {
    updateActivePortfolio(p => ({
      ...p,
      holdings: p.holdings.map(h => {
        if (h.id === id) {
          const updated = { ...h, ...updates }
          if (updates.sector) {
            updated.sectorColor = SECTOR_COLORS[updates.sector] || SECTOR_COLORS['Otros']
          }
          return updated
        }
        return h
      }),
    }))
  }, [updateActivePortfolio])

  // Update just the current price of a holding
  const updateHoldingPrice = useCallback((id: string, newPrice: number) => {
    updateActivePortfolio(p => ({
      ...p,
      holdings: p.holdings.map(h => 
        h.id === id ? { ...h, currentPrice: newPrice } : h
      ),
    }))
  }, [updateActivePortfolio])

  // Delete a holding
  const deleteHolding = useCallback((id: string) => {
    updateActivePortfolio(p => ({
      ...p,
      holdings: p.holdings.filter(h => h.id !== id),
    }))
  }, [updateActivePortfolio])

  // Add a new transaction
  const addTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    updateActivePortfolio(p => {
      const newTransaction: Transaction = {
        ...transaction,
        id: generateId(),
      }

      let updatedHoldings = [...p.holdings]

      // If it's a BUY, update or create holding
      if (transaction.type === 'COMPRA') {
        const existingIndex = updatedHoldings.findIndex(
          h => h.symbol === transaction.symbol
        )
        if (existingIndex >= 0) {
          const existing = updatedHoldings[existingIndex]
          const totalShares = existing.quantity + transaction.shares
          const totalCost = existing.avgCost * existing.quantity + transaction.total
          updatedHoldings[existingIndex] = {
            ...existing,
            quantity: totalShares,
            avgCost: totalCost / totalShares,
          }
        } else {
          // Create new holding
          updatedHoldings.push({
            id: generateId(),
            name: transaction.assetName,
            symbol: transaction.symbol,
            sector: 'Otros',
            sectorColor: SECTOR_COLORS['Otros'],
            quantity: transaction.shares,
            avgCost: transaction.pricePerShare,
            currentPrice: transaction.pricePerShare,
            entryDate: transaction.date,
          })
        }
      }

      // If it's a SELL, reduce holding quantity
      if (transaction.type === 'VENTA') {
        const existingIndex = updatedHoldings.findIndex(
          h => h.symbol === transaction.symbol
        )
        if (existingIndex >= 0) {
          const existing = updatedHoldings[existingIndex]
          const newQuantity = existing.quantity - transaction.shares
          if (newQuantity <= 0) {
            updatedHoldings = updatedHoldings.filter((_, i) => i !== existingIndex)
          } else {
            updatedHoldings[existingIndex] = {
              ...existing,
              quantity: newQuantity,
            }
          }
        }
      }

      // Update snapshots
      const newSnapshots = [...p.snapshots]
      const totalValue = updatedHoldings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0)
      const totalInvested = updatedHoldings.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
      const today = new Date().toISOString().split('T')[0]
      
      const existingSnapshotIndex = newSnapshots.findIndex(s => s.date === today)
      if (existingSnapshotIndex >= 0) {
        newSnapshots[existingSnapshotIndex] = { date: today, value: totalValue, invested: totalInvested }
      } else {
        newSnapshots.push({ date: today, value: totalValue, invested: totalInvested })
      }

      return {
        ...p,
        holdings: updatedHoldings,
        transactions: [newTransaction, ...p.transactions].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        snapshots: newSnapshots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      }
    })
  }, [updateActivePortfolio])

  // Update an existing transaction
  const updateTransaction = useCallback((id: string, updates: Partial<Omit<Transaction, 'id'>>) => {
    updateActivePortfolio(p => ({
      ...p,
      transactions: p.transactions.map(t => 
        t.id === id ? { ...t, ...updates } : t
      ),
    }))
  }, [updateActivePortfolio])

  // Delete a transaction
  const deleteTransaction = useCallback((id: string) => {
    updateActivePortfolio(p => ({
      ...p,
      transactions: p.transactions.filter(t => t.id !== id),
    }))
  }, [updateActivePortfolio])

  // Update profile
  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    updateActivePortfolio(p => ({
      ...p,
      profile: { ...p.profile, ...updates },
    }))
  }, [updateActivePortfolio])

  // Export data to CSV
  const exportToCSV = useCallback(() => {
    if (!activePortfolio) return ''
    
    const headers = ['Fecha', 'Tipo', 'Activo', 'Símbolo', 'Acciones', 'Precio', 'Total', 'Notas']
    const rows = activePortfolio.transactions.map(t => [
      t.date,
      t.type,
      t.assetName,
      t.symbol,
      t.shares.toString(),
      t.pricePerShare.toString(),
      t.total.toString(),
      t.notes || '',
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    return csvContent
  }, [activePortfolio])

  // Import data from CSV
  const importFromCSV = useCallback((csvContent: string) => {
    const lines = csvContent.split('\n').filter(line => line.trim())
    if (lines.length < 2) return
    
    const transactions: Transaction[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',')
      if (cols.length >= 7) {
        transactions.push({
          id: generateId(),
          date: cols[0],
          type: cols[1] as Transaction['type'],
          assetName: cols[2],
          symbol: cols[3],
          shares: parseFloat(cols[4]) || 0,
          pricePerShare: parseFloat(cols[5]) || 0,
          total: parseFloat(cols[6]) || 0,
          notes: cols[7] || '',
        })
      }
    }
    
    updateActivePortfolio(p => ({
      ...p,
      transactions: [...transactions, ...p.transactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }))
  }, [updateActivePortfolio])

  // Save a weekly snapshot of the current portfolio state
  const saveWeeklySnapshot = useCallback(() => {
    let savedDate = ''
    updateActivePortfolio(p => {
      if (p.holdings.length === 0) return p
      
      const totalValue = p.holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0)
      const totalInvested = p.holdings.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
      const today = new Date().toISOString().split('T')[0]
      
      savedDate = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      
      const newSnapshot: PortfolioSnapshot = {
        date: today,
        value: totalValue,
        invested: totalInvested,
      }
      
      const existingIndex = p.snapshots.findIndex(s => s.date === today)
      let newSnapshots: PortfolioSnapshot[]
      
      if (existingIndex >= 0) {
        newSnapshots = [...p.snapshots]
        newSnapshots[existingIndex] = newSnapshot
      } else {
        newSnapshots = [...p.snapshots, newSnapshot]
      }
      
      newSnapshots = newSnapshots
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-52)
      
      return {
        ...p,
        snapshots: newSnapshots,
      }
    })
    
    return savedDate || new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  }, [updateActivePortfolio])

  // Reset all data for current portfolio
  const resetData = useCallback(() => {
    updateActivePortfolio(p => ({
      ...p,
      holdings: [],
      transactions: [],
      snapshots: [],
      profile: { ...DEFAULT_PROFILE },
    }))
  }, [updateActivePortfolio])

  return {
    // Storage state
    portfolios: storage?.portfolios || [],
    activePortfolioId: storage?.activePortfolioId || null,
    activePortfolio,
    hasActivePortfolio: !!activePortfolio,
    
    // Data from active portfolio
    holdings: activePortfolio?.holdings || [],
    holdingsWithMetrics,
    transactions: activePortfolio?.transactions || [],
    profile: activePortfolio?.profile || DEFAULT_PROFILE,
    snapshots: activePortfolio?.snapshots || [],
    metrics,
    isLoaded,
    
    // Portfolio management actions
    createPortfolio,
    selectPortfolio,
    exitPortfolio,
    deletePortfolio,
    updatePortfolioMeta,
    
    // Portfolio data actions
    addHolding,
    updateHolding,
    updateHoldingPrice,
    deleteHolding,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateProfile,
    exportToCSV,
    importFromCSV,
    resetData,
    saveWeeklySnapshot,
  }
}
