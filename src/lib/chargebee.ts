const CHARGEBEE_SITE = process.env.CHARGEBEE_SITE!
const CHARGEBEE_API_KEY = process.env.CHARGEBEE_API_KEY!
const BASE_URL = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2`

const headers = {
  Authorization: `Basic ${Buffer.from(CHARGEBEE_API_KEY + ':').toString('base64')}`,
}

function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
}

async function fetchAll<T>(
  path: string,
  params: Record<string, string> = {},
  maxItems = 500
): Promise<T[]> {
  const results: T[] = []
  let offset: string | undefined

  do {
    const allParams = { limit: '100', ...params, ...(offset ? { offset } : {}) }
    const res = await fetch(`${BASE_URL}${path}?${buildQuery(allParams)}`, { headers })
    if (!res.ok) throw new Error(`Chargebee error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    results.push(...(data.list ?? []))
    offset = results.length < maxItems ? data.next_offset : undefined
  } while (offset)

  return results.slice(0, maxItems)
}

export interface InvoiceRow {
  customerId: string
  subscriptionId: string
  invoiceStatus: 'payment_due' | 'not_paid'
  dunningStatus: string | null
  nextRetryAt: number | null
  amountDue: number
  currencyCode: string
  planName: string
  lastFailureAt: number | null
  chargebeeUrl: string
  invoiceCount: number
}

export interface CustomerDetails {
  customerId: string
  firstName: string
  lastName: string
  phone: string
}

// Step 1: fetch invoices only — fast, no N+1
export async function getOverdueInvoices(): Promise<InvoiceRow[]> {
  const [paymentDue, notPaid] = await Promise.all([
    fetchAll<{ invoice: any }>('/invoices', { 'status[is]': 'payment_due', 'sort_by[desc]': 'date' }, 200),
    fetchAll<{ invoice: any }>('/invoices', { 'status[is]': 'not_paid', 'sort_by[desc]': 'date' }, 200),
  ])

  const byCustomer = new Map<string, { invoice: any; count: number }>()
  for (const { invoice: inv } of [...paymentDue, ...notPaid]) {
    if (!inv.subscription_id) continue
    const existing = byCustomer.get(inv.customer_id)
    if (!existing) {
      byCustomer.set(inv.customer_id, { invoice: inv, count: 1 })
    } else {
      const better = inv.status === 'not_paid' || inv.date > existing.invoice.date
      byCustomer.set(inv.customer_id, {
        invoice: better ? inv : existing.invoice,
        count: existing.count + 1,
      })
    }
  }

  return Array.from(byCustomer.entries()).map(([customerId, { invoice: inv, count }]) => ({
    customerId,
    subscriptionId: inv.subscription_id,
    invoiceStatus: inv.status as 'payment_due' | 'not_paid',
    dunningStatus: inv.dunning_status ?? null,
    nextRetryAt: inv.next_retry_at ?? null,
    amountDue: inv.amount_due ?? 0,
    currencyCode: inv.currency_code ?? 'MXN',
    planName: inv.line_items?.[0]?.description ?? inv.line_items?.[0]?.entity_id ?? '',
    lastFailureAt: inv.date ?? null,
    chargebeeUrl: `https://${CHARGEBEE_SITE}.chargebee.com/d/customers/${customerId}`,
    invoiceCount: count,
  }))
}

export interface InvoiceStats {
  count: number
  oldestAt: number | null
}

// Step 2b: accurate invoice count + oldest invoice date per customer
// Needed because the initial fetch is capped and misses older invoices for prolific debtors
export async function getInvoiceCountsForCustomers(customerIds: string[]): Promise<Map<string, InvoiceStats>> {
  const map = new Map<string, InvoiceStats>()
  const BATCH = 20
  for (let i = 0; i < customerIds.length; i += BATCH) {
    const batch = customerIds.slice(i, i + BATCH)
    await Promise.all(batch.map(async (id) => {
      const [pdRes, npRes] = await Promise.all([
        fetch(`${BASE_URL}/invoices?${buildQuery({ 'customer_id[is]': id, 'status[is]': 'payment_due', limit: '100' })}`, { headers }),
        fetch(`${BASE_URL}/invoices?${buildQuery({ 'customer_id[is]': id, 'status[is]': 'not_paid', limit: '100' })}`, { headers }),
      ])
      const [pd, np] = await Promise.all([pdRes.json(), npRes.json()])
      const all: any[] = [...(pd.list ?? []), ...(np.list ?? [])]
      const dates = all.map((item) => item.invoice?.date).filter(Boolean) as number[]
      map.set(id, {
        count: all.length,
        oldestAt: dates.length ? Math.min(...dates) : null,
      })
    }))
  }
  return map
}

// Step 2a: fetch customer details for a list of IDs — run in parallel with HubSpot
export async function getCustomerDetails(customerIds: string[]): Promise<Map<string, CustomerDetails>> {
  const map = new Map<string, CustomerDetails>()

  const BATCH = 20
  for (let i = 0; i < customerIds.length; i += BATCH) {
    const batch = customerIds.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(async (id) => {
      const res = await fetch(`${BASE_URL}/customers/${id}`, { headers })
      if (!res.ok) return null
      const { customer: c } = await res.json()
      return { customerId: id, firstName: c.first_name ?? '', lastName: c.last_name ?? '', phone: c.phone ?? '' }
    }))
    for (const r of results) {
      if (r) map.set(r.customerId, r)
    }
  }

  return map
}
