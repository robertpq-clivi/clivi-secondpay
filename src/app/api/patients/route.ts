import { NextResponse } from 'next/server'
import { getOverdueInvoices, getCustomerDetails, getInvoiceCountsForCustomers } from '@/lib/chargebee'
import { getDebtContacts } from '@/lib/hubspot'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Step 1: invoices only (fast — no N+1)
    const invoices = await getOverdueInvoices()
    const customerIds = invoices.map((i) => i.customerId)

    // Step 2: customer details + HubSpot + accurate invoice counts in parallel
    const [customerMap, contactMap, countMap] = await Promise.all([
      getCustomerDetails(customerIds),
      getDebtContacts(customerIds),
      getInvoiceCountsForCustomers(customerIds),
    ])

    const enriched = invoices.map((inv) => {
      const customer = customerMap.get(inv.customerId)
      const contact = contactMap.get(inv.customerId) ?? null
      const stats = countMap.get(inv.customerId)
      const createdAt = inv.lastFailureAt ?? null
      const oldestInvoiceAt = stats?.oldestAt ?? createdAt
      const name = customer
        ? `${customer.firstName} ${customer.lastName}`.trim() || inv.customerId
        : inv.customerId

      return {
        customerId: inv.customerId,
        name,
        phone: customer?.phone ?? '',
        chargebeeUrl: inv.chargebeeUrl,
        invoiceStatus: inv.invoiceStatus,
        dunningStatus: inv.dunningStatus,
        nextRetryAt: inv.nextRetryAt,
        createdAt,
        amountDue: inv.amountDue,
        currencyCode: inv.currencyCode,
        planName: inv.planName,
        invoiceCount: stats?.count ?? inv.invoiceCount,
        oldestInvoiceAt,
        hubspotContact: contact
          ? { contactId: contact.contactId, contactUrl: contact.contactUrl, lifecycleLabel: contact.lifecycleLabel }
          : null,
      }
    })

    enriched.sort((a, b) => {
      if (!a.hubspotContact && b.hubspotContact) return -1
      if (a.hubspotContact && !b.hubspotContact) return 1
      return (a.nextRetryAt ?? Infinity) - (b.nextRetryAt ?? Infinity)
    })

    return NextResponse.json({ patients: enriched, total: enriched.length })
  } catch (err) {
    console.error('[/api/patients]', err)
    return NextResponse.json({ error: 'Error al obtener pacientes' }, { status: 500 })
  }
}
