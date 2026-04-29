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

const MAX_PAGES = 60 // safety cap: 60 × 100 = 6000 invoices per status

// Chargebee returns next_offset as a JSON array — must be stringified before URL-encoding.
// Returns { results, hitLimit } so callers know if there may be more data.
async function fetchAll<T>(path: string, params: Record<string, string> = {}): Promise<{ results: T[]; hitLimit: boolean }> {
  const results: T[] = []
  let offset: string | undefined
  let pages = 0

  do {
    const allParams = { limit: '100', ...params, ...(offset ? { offset } : {}) }
    const res = await fetch(`${BASE_URL}${path}?${buildQuery(allParams)}`, { headers })
    if (!res.ok) throw new Error(`Chargebee error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    results.push(...(data.list ?? []))
    const raw = data.next_offset
    offset = raw ? (Array.isArray(raw) ? JSON.stringify(raw) : String(raw)) : undefined
    pages++
  } while (offset && pages < MAX_PAGES)

  return { results, hitLimit: pages >= MAX_PAGES && !!offset }
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
  oldestInvoiceAt: number | null
  chargebeeUrl: string
  invoiceCount: number
}

export interface CustomerDetails {
  customerId: string
  firstName: string
  lastName: string
  phone: string
}

const MAX_CUSTOMERS = 500

// Fetches ALL overdue invoices (no cap), groups by customer with accurate counts.
// Caps displayed customers at MAX_CUSTOMERS sorted by invoiceCount desc, then most recent date.
export async function getOverdueInvoices(): Promise<{ rows: InvoiceRow[]; hitLimit: boolean }> {
  const [pd, np] = await Promise.all([
    fetchAll<{ invoice: any }>('/invoices', { 'status[is]': 'payment_due', 'sort_by[desc]': 'date' }),
    fetchAll<{ invoice: any }>('/invoices', { 'status[is]': 'not_paid', 'sort_by[desc]': 'date' }),
  ])
  const hitLimit = pd.hitLimit || np.hitLimit
  const paymentDue = pd.results
  const notPaid = np.results

  interface CustomerEntry {
    invoice: any       // representative: most recent / not_paid preferred
    count: number
    totalAmountDue: number
    oldestDate: number | null
  }

  const byCustomer = new Map<string, CustomerEntry>()

  for (const { invoice: inv } of [...paymentDue, ...notPaid]) {
    if (!inv.subscription_id) continue
    const existing = byCustomer.get(inv.customer_id)
    if (!existing) {
      byCustomer.set(inv.customer_id, {
        invoice: inv,
        count: 1,
        totalAmountDue: inv.amount_due ?? 0,
        oldestDate: inv.date ?? null,
      })
    } else {
      const better = inv.status === 'not_paid' || inv.date > existing.invoice.date
      byCustomer.set(inv.customer_id, {
        invoice: better ? inv : existing.invoice,
        count: existing.count + 1,
        totalAmountDue: existing.totalAmountDue + (inv.amount_due ?? 0),
        oldestDate: existing.oldestDate !== null
          ? Math.min(existing.oldestDate, inv.date ?? Infinity)
          : (inv.date ?? null),
      })
    }
  }

  // Sort by most invoices first, then by most recent activity
  const sorted = Array.from(byCustomer.entries()).sort(([, a], [, b]) => {
    if (b.count !== a.count) return b.count - a.count
    return (b.invoice.date ?? 0) - (a.invoice.date ?? 0)
  })

  const rows = sorted.slice(0, MAX_CUSTOMERS).map(([customerId, { invoice: inv, count, totalAmountDue, oldestDate }]) => ({
    customerId,
    subscriptionId: inv.subscription_id,
    invoiceStatus: inv.status as 'payment_due' | 'not_paid',
    dunningStatus: inv.dunning_status ?? null,
    nextRetryAt: inv.next_retry_at ?? null,
    amountDue: totalAmountDue,
    currencyCode: inv.currency_code ?? 'MXN',
    planName: inv.line_items?.[0]?.description ?? inv.line_items?.[0]?.entity_id ?? '',
    lastFailureAt: inv.date ?? null,
    oldestInvoiceAt: oldestDate,
    chargebeeUrl: `https://${CHARGEBEE_SITE}.chargebee.com/d/customers/${customerId}`,
    invoiceCount: count,
  }))

  return { rows, hitLimit }
}

// Fetch customer details in batches of 20 — runs in parallel with HubSpot
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
