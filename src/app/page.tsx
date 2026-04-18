'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface HubSpotContact {
  contactId: string
  contactUrl: string
  lifecycleLabel: string
}

interface Patient {
  customerId: string
  name: string
  phone: string
  chargebeeUrl: string
  invoiceCount: number
  oldestInvoiceAt: number | null
  invoiceStatus: 'payment_due' | 'not_paid'
  dunningStatus: string | null
  nextRetryAt: number | null
  createdAt: number | null
  amountDue: number
  currencyCode: string
  planName: string
  hubspotContact: HubSpotContact | null
}

const FAILURE_LABELS: Record<string, string> = {
  insufficient_funds: 'Fondos insuficientes',
  card_expired: 'Tarjeta vencida',
  do_not_honor: 'No autorizado',
  transaction_not_permitted: 'Transacción no permitida',
  call_issuer: 'Llamar al banco',
  card_declined: 'Tarjeta declinada',
}

function formatDate(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount / 100)
}

function daysSince(ts: number | null) {
  if (!ts) return null
  return Math.floor((Date.now() - ts * 1000) / (1000 * 60 * 60 * 24))
}

function DebtDaysBadge({ ts }: { ts: number | null }) {
  const days = daysSince(ts)
  if (days === null) return <span className="text-muted-foreground">—</span>
  if (days >= 60) return <Badge variant="destructive">{days}d</Badge>
  if (days >= 30) return <Badge variant="outline" className="border-orange-400 text-orange-600">{days}d</Badge>
  return <span className="text-sm text-muted-foreground">{days}d</span>
}

type SortKey = 'name' | 'invoiceStatus' | 'createdAt' | 'amountDue' | 'hubspotContact'
type SortDir = 'asc' | 'desc'

export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [peFilter, setPeFilter] = useState<'all' | 'with' | 'without'>('all')
  const [renewalFilter, setRenewalFilter] = useState<'all' | '7' | '14' | '30'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  useEffect(() => {
    fetch('/api/patients')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setPatients(d.patients)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const list = patients.filter((p) => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.phone.includes(q)) return false
      }
      if (peFilter === 'with' && !p.hubspotContact) return false
      if (peFilter === 'without' && p.hubspotContact) return false
      if (renewalFilter !== 'all') {
        const days = daysSince(p.createdAt)
        if (days === null || days < parseInt(renewalFilter)) return false
      }
      return true
    })

    list.sort((a, b) => {
      let av: any, bv: any
      if (sortKey === 'name') { av = a.name; bv = b.name }
      else if (sortKey === 'invoiceStatus') { av = a.invoiceStatus; bv = b.invoiceStatus }
      else if (sortKey === 'createdAt') { av = a.createdAt ?? 0; bv = b.createdAt ?? 0 }
      else if (sortKey === 'amountDue') { av = a.amountDue; bv = b.amountDue }
      else if (sortKey === 'hubspotContact') { av = a.hubspotContact?.lifecycleLabel ?? ''; bv = b.hubspotContact?.lifecycleLabel ?? '' }

      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [patients, search, peFilter, renewalFilter, sortKey, sortDir])

  const withDeal = patients.filter((p) => p.hubspotContact).length
  const multiInvoiceTotal = patients.filter((p) => p.invoiceCount > 1).length

  const multiInvoice = useMemo(() =>
    [...filtered].filter((p) => p.invoiceCount > 1)
      .sort((a, b) => b.invoiceCount - a.invoiceCount),
    [filtered]
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SummaryCard label="Total con error" value={patients.length} />
            <SummaryCard label="Con múltiples facturas" value={multiInvoiceTotal} highlight />
            <SummaryCard label="Con contacto HubSpot" value={withDeal} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={peFilter} onValueChange={(v) => setPeFilter(v as any)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="HubSpot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="without">Sin contacto HubSpot</SelectItem>
              <SelectItem value="with">Con contacto HubSpot</SelectItem>
            </SelectContent>
          </Select>
          <Select value={renewalFilter} onValueChange={(v) => setRenewalFilter(v as any)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Renovación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier tiempo</SelectItem>
              <SelectItem value="7">En deuda ≥7 días</SelectItem>
              <SelectItem value="14">En deuda ≥14 días</SelectItem>
              <SelectItem value="30">En deuda ≥30 días</SelectItem>
            </SelectContent>
          </Select>
          {(search || peFilter !== 'all' || renewalFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setPeFilter('all'); setRenewalFilter('all') }}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {loading && <div className="text-center py-20 text-muted-foreground">Cargando pacientes...</div>}
        {error && <div className="text-center py-20 text-destructive">{error}</div>}

        {!loading && !error && (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todos ({filtered.length})</TabsTrigger>
              <TabsTrigger value="multi">Múltiples facturas ({multiInvoice.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <PatientTable rows={filtered} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} showInvoiceCount={false} />
            </TabsContent>

            <TabsContent value="multi" className="mt-4">
              <PatientTable rows={multiInvoice} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} showInvoiceCount useOldestDate />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

function PatientTable({ rows, sortKey, sortDir, onSort, showInvoiceCount, useOldestDate }: {
  rows: Patient[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  showInvoiceCount: boolean
  useOldestDate?: boolean
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="Paciente" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <TableHead>Teléfono</TableHead>
            <SortHead label="Estado" col="invoiceStatus" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Creada el" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Días en deuda" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="Monto" col="amountDue" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHead label="HubSpot" col="hubspotContact" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            {showInvoiceCount && <TableHead className="text-right"># Facturas</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showInvoiceCount ? 8 : 7} className="text-center py-12 text-muted-foreground">
                No hay pacientes
              </TableCell>
            </TableRow>
          )}
          {rows.map((p) => (
            <TableRow key={p.customerId}>
              <TableCell className="font-medium">
                <a href={p.chargebeeUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {p.name}
                </a>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.phone || '—'}</TableCell>
              <TableCell>
                <Badge variant={p.invoiceStatus === 'not_paid' ? 'destructive' : 'outline'}>
                  {p.invoiceStatus === 'not_paid' ? 'No pagado' : 'Pago pendiente'}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{formatDate(useOldestDate ? (p.oldestInvoiceAt ?? p.createdAt) : p.createdAt)}</TableCell>
              <TableCell><DebtDaysBadge ts={p.createdAt} /></TableCell>
              <TableCell className="text-sm font-medium">{formatMoney(p.amountDue, p.currencyCode)}</TableCell>
              <TableCell className="text-sm">
                {p.hubspotContact ? (
                  <a href={p.hubspotContact.contactUrl} target="_blank" rel="noreferrer" className="hover:underline text-blue-600">
                    {p.hubspotContact.lifecycleLabel}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {showInvoiceCount && (
                <TableCell className="text-right font-semibold">{p.invoiceCount}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortHead({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void
}) {
  const active = sortKey === col
  return (
    <TableHead onClick={() => onSort(col)} className="cursor-pointer select-none whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-xs text-muted-foreground">
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </TableHead>
  )
}

function SummaryCard({
  label, value, highlight, urgent,
}: { label: string; value: number; highlight?: boolean; urgent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${urgent && value > 0 ? 'border-red-300 bg-red-50' : highlight && value > 0 ? 'border-orange-300 bg-orange-50' : 'bg-card'}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
