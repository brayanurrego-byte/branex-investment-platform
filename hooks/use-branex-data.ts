"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  Holding,
  Transaction,
  Portfolio,
  PortfolioMetrics,
  HoldingWithMetrics,
  PortfolioSnapshot,
} from '@/lib/branex-types'

export const SECTOR_COLORS: Record<string, string> = {
  'Tecnología': '#00A3FF',
  'Salud': '#00FF88',
  'Finanzas': '#7B61FF',
  'Consumo': '#FFB800',
  'Consumo Discrecional': '#FFB800',
  'Consumo Básico': '#FF8C00',
  'Energía': '#FF3366',
  'Industrial': '#00D4FF',
  'Industriales': '#00D4FF',
  'Materiales': '#FF8C00',
  'Inmobiliario': '#9D4EDD',
  'Telecomunicaciones': '#06D6A0',
  'Comunicaciones': '#06D6A0',
  'Servicios Públicos': '#EF476F',
  'Otros': '#8892b0',
}

export function useBranexData() {
  const { user } = useAuth()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [profile, setProfile] = useState({ name: '', company: '', currency: 'USD', portfolioStartDate: '', initialCapital: 0, benchmark: 'SP500' })

  useEffect(() => {
    if (!user) { setPortfolios([]); setIsLoaded(true); return }
    loadPortfolios()
    loadProfile()
  }, [user])

  useEffect(() => {
    if (!activePortfolioId || !user) return
    loadPortfolioData(activePortfolioId)
    localStorage.setItem('branex_active_portfolio', activePortfolioId)
  }, [activePortfolioId, user])

  useEffect(() => {
    if (!user) return
    const saved = localStorage.getItem('branex_active_portfolio')
    if (saved) setActivePortfolioId(saved)
  }, [user])

  const loadProfile = async () => {
    if (!user) return
    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(prev => ({ ...prev, name: data.name || '', company: data.company || '' }))
  }

  const loadPortfolios = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('portfolios').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (!error && data) {
      setPortfolios(data.map(p => ({
        id: p.id, name: p.name, createdAt: p.created_at,
        holdings: [], transactions: [], snapshots: [],
        profile: { name: '', company: '', currency: p.currency || 'USD',
          portfolioStartDate: p.start_date || new Date().toISOString().split('T')[0],
          initialCapital: p.initial_capital || 0, benchmark: p.benchmark || 'SP500' }
      })))
    }
    setIsLoaded(true)
  }

  const loadPortfolioData = async (portfolioId: string) => {
    if (!user) return
    const [holdingsRes, txRes, snapshotsRes] = await Promise.all([
      supabase.from('holdings').select('*').eq('portfolio_id', portfolioId).eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').eq('portfolio_id', portfolioId).eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('snapshots').select('*').eq('portfolio_id', portfolioId).eq('user_id', user.id).order('date', { ascending: true })
    ])
    if (holdingsRes.data) setHoldings(holdingsRes.data.map(h => ({
      id: h.id, name: h.name, symbol: h.symbol, sector: h.sector,
      sectorColor: h.sector_color || SECTOR_COLORS[h.sector] || SECTOR_COLORS['Otros'],
      quantity: Number(h.quantity), avgCost: Number(h.avg_cost),
      currentPrice: Number(h.current_price), entryDate: h.entry_date, notes: h.notes,
    })))
    if (txRes.data) setTransactions(txRes.data.map(t => ({
      id: t.id, date: t.date, type: t.type as Transaction['type'],
      assetName: t.asset_name, symbol: t.symbol,
      shares: Number(t.shares), pricePerShare: Number(t.price_per_share),
      total: Number(t.total), notes: t.notes,
    })))
    if (snapshotsRes.data) setSnapshots(snapshotsRes.data.map(s => ({
      date: s.date, value: Number(s.value), invested: Number(s.invested),
    })))
  }

  const activePortfolio = useMemo(() => portfolios.find(p => p.id === activePortfolioId) || null, [portfolios, activePortfolioId])

  const holdingsWithMetrics: HoldingWithMetrics[] = useMemo(() => {
    if (!holdings || holdings.length === 0) return []
    const totalValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0)
    return holdings.map(h => {
      const marketValue = h.currentPrice * h.quantity
      const totalInvested = h.avgCost * h.quantity
      const totalPnL = marketValue - totalInvested
      const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
      const weight = totalValue > 0 ? (marketValue / totalValue) * 100 : 0
      return { ...h, marketValue, totalPnL, pnlPercent, weight }
    })
  }, [holdings])

  const metrics: PortfolioMetrics = useMemo(() => {
    if (!holdings || holdings.length === 0) return { totalValue: 0, totalInvested: 0, totalPnL: 0, totalReturnPercent: 0, activePositions: 0, sharpeRatio: 0, sectorAllocation: [] }
    const totalValue = holdingsWithMetrics.reduce((sum, h) => sum + h.marketValue, 0)
    const totalInvested = holdingsWithMetrics.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
    const totalPnL = totalValue - totalInvested
    const totalReturnPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0
    const sectorMap: Record<string, number> = {}
    holdingsWithMetrics.forEach(h => { sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.marketValue })
    const sectorAllocation = Object.entries(sectorMap).map(([name, value]) => ({
      name, value: Math.round((value / totalValue) * 100), color: SECTOR_COLORS[name] || SECTOR_COLORS['Otros'],
    }))
    const sharpeRatio = Number(Math.max(0, ((totalReturnPercent / 2) - 5) / 15).toFixed(2))
    return { totalValue, totalInvested, totalPnL, totalReturnPercent, activePositions: holdings.length, sharpeRatio, sectorAllocation }
  }, [holdings, holdingsWithMetrics])

  const createPortfolio = useCallback(async (name: string) => {
    if (!user) return null
    const { data, error } = await supabase.from('portfolios').insert({ user_id: user.id, name }).select().single()
    if (error || !data) return null
    const newPortfolio: Portfolio = {
      id: data.id, name: data.name, createdAt: data.created_at,
      holdings: [], transactions: [], snapshots: [],
      profile: { name: '', company: '', currency: 'USD', portfolioStartDate: new Date().toISOString().split('T')[0], initialCapital: 0, benchmark: 'SP500' }
    }
    setPortfolios(prev => [newPortfolio, ...prev])
    return newPortfolio
  }, [user])

  const selectPortfolio = useCallback((id: string) => {
    setHoldings([]); setTransactions([]); setSnapshots([])
    setActivePortfolioId(id)
  }, [])

  const renamePortfolio = useCallback(async (id: string, name: string) => {
    if (!user) return
    await supabase.from('portfolios').update({ name }).eq('id', id).eq('user_id', user.id)
    setPortfolios(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }, [user])

  const deletePortfolio = useCallback(async (id: string) => {
    if (!user) return
    await supabase.from('portfolios').delete().eq('id', id).eq('user_id', user.id)
    setPortfolios(prev => prev.filter(p => p.id !== id))
    if (activePortfolioId === id) { setActivePortfolioId(null); localStorage.removeItem('branex_active_portfolio') }
  }, [user, activePortfolioId])

  const exitPortfolio = useCallback(() => {
    setActivePortfolioId(null); setHoldings([]); setTransactions([]); setSnapshots([])
    localStorage.removeItem('branex_active_portfolio')
  }, [])

  const addHolding = useCallback(async (holding: Omit<Holding, 'id' | 'sectorColor'>) => {
    if (!user || !activePortfolioId) return
    const sectorColor = SECTOR_COLORS[holding.sector] || SECTOR_COLORS['Otros']
    const { data, error } = await supabase.from('holdings').insert({
      portfolio_id: activePortfolioId, user_id: user.id,
      name: holding.name, symbol: holding.symbol.toUpperCase(), sector: holding.sector,
      sector_color: sectorColor, quantity: holding.quantity, avg_cost: holding.avgCost,
      current_price: holding.currentPrice, entry_date: holding.entryDate, notes: holding.notes,
    }).select().single()
    if (!error && data) setHoldings(prev => [...prev, {
      id: data.id, name: data.name, symbol: data.symbol, sector: data.sector,
      sectorColor: data.sector_color, quantity: Number(data.quantity),
      avgCost: Number(data.avg_cost), currentPrice: Number(data.current_price),
      entryDate: data.entry_date, notes: data.notes,
    }])
  }, [user, activePortfolioId])

  const updateHolding = useCallback(async (id: string, updates: Partial<Omit<Holding, 'id'>>) => {
    if (!user) return
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.name) dbUpdates.name = updates.name
    if (updates.symbol) dbUpdates.symbol = updates.symbol.toUpperCase()
    if (updates.sector) { dbUpdates.sector = updates.sector; dbUpdates.sector_color = SECTOR_COLORS[updates.sector] || SECTOR_COLORS['Otros'] }
    if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity
    if (updates.avgCost !== undefined) dbUpdates.avg_cost = updates.avgCost
    if (updates.currentPrice !== undefined) dbUpdates.current_price = updates.currentPrice
    if (updates.entryDate) dbUpdates.entry_date = updates.entryDate
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes
    await supabase.from('holdings').update(dbUpdates).eq('id', id).eq('user_id', user.id)
    setHoldings(prev => prev.map(h => h.id === id ? {
      ...h, ...updates, sectorColor: updates.sector ? SECTOR_COLORS[updates.sector] || SECTOR_COLORS['Otros'] : h.sectorColor
    } : h))
  }, [user])

  const deleteHolding = useCallback(async (id: string) => {
    if (!user) return
    await supabase.from('holdings').delete().eq('id', id).eq('user_id', user.id)
    setHoldings(prev => prev.filter(h => h.id !== id))
  }, [user])

  const updateHoldingPrice = useCallback(async (id: string, newPrice: number) => {
    if (!user) return
    await supabase.from('holdings').update({ current_price: newPrice, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    setHoldings(prev => prev.map(h => h.id === id ? { ...h, currentPrice: newPrice } : h))
  }, [user])

  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id'>) => {
    if (!user || !activePortfolioId) return
    const { data, error } = await supabase.from('transactions').insert({
      portfolio_id: activePortfolioId, user_id: user.id,
      date: transaction.date, type: transaction.type,
      asset_name: transaction.assetName, symbol: transaction.symbol.toUpperCase(),
      shares: transaction.shares, price_per_share: transaction.pricePerShare,
      total: transaction.total, notes: transaction.notes,
    }).select().single()
    if (!error && data) setTransactions(prev => [{
      id: data.id, date: data.date, type: data.type as Transaction['type'],
      assetName: data.asset_name, symbol: data.symbol,
      shares: Number(data.shares), pricePerShare: Number(data.price_per_share),
      total: Number(data.total), notes: data.notes,
    }, ...prev])
  }, [user, activePortfolioId])

  const deleteTransaction = useCallback(async (id: string) => {
    if (!user) return
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id)
    setTransactions(prev => prev.filter(t => t.id !== id))
  }, [user])

  const saveWeeklySnapshot = useCallback(async () => {
    if (!user || !activePortfolioId || holdings.length === 0) return false
    const totalValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0)
    const totalInvested = holdings.reduce((sum, h) => sum + h.avgCost * h.quantity, 0)
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('snapshots').upsert({
      portfolio_id: activePortfolioId, user_id: user.id,
      date: today, value: totalValue, invested: totalInvested,
    }, { onConflict: 'portfolio_id,date' }).select().single()
    if (!error && data) {
      setSnapshots(prev => {
        const filtered = prev.filter(s => s.date !== today)
        return [...filtered, { date: data.date, value: Number(data.value), invested: Number(data.invested) }]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      })
    }
    return !error
  }, [user, activePortfolioId, holdings])

  const updateProfile = useCallback(async (updates: Partial<typeof profile>) => {
    if (!user) return
    setProfile(prev => ({ ...prev, ...updates }))
    const { name, company } = { ...profile, ...updates }
    await supabase.from('user_profiles').upsert({ id: user.id, name, company })
  }, [user, profile])

  const updatePortfolioMeta = useCallback(async (updates: { name?: string }) => {
    if (!user || !activePortfolioId) return
    if (updates.name) {
      await supabase.from('portfolios').update({ name: updates.name }).eq('id', activePortfolioId).eq('user_id', user.id)
      setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, name: updates.name! } : p))
    }
  }, [user, activePortfolioId])

  const exportToCSV = useCallback(() => {
    const headers = ['Fecha', 'Tipo', 'Activo', 'Símbolo', 'Acciones', 'Precio', 'Total', 'Notas']
    const rows = transactions.map(t => [t.date, t.type, t.assetName, t.symbol, t.shares, t.pricePerShare, t.total, t.notes || ''])
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }, [transactions])

  return {
    user, profile, portfolios, activePortfolio, activePortfolioId,
    createPortfolio, selectPortfolio, renamePortfolio, deletePortfolio, exitPortfolio,
    holdings, holdingsWithMetrics, transactions, snapshots, metrics, isLoaded,
    updateProfile, updatePortfolioMeta,
    addHolding, updateHolding, deleteHolding, updateHoldingPrice,
    addTransaction, deleteTransaction, saveWeeklySnapshot, exportToCSV, SECTOR_COLORS,
  }
}
