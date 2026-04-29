import { NextResponse } from 'next/server'
import { getOverdueInvoices, getCustomerDetails } from '@/lib/chargebee'
import { getDebtContacts } from '@/lib/hubspot'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Step 1: fetch ALL overdue invoices — accurate counts, no cap
    const { rows: invoices, hitLimit } = await getOverdueInvoices()
    const customerIds = invoices.map((i) => i.customerId)

    // Step 2: customer details + HubSpot in parallel
    const [customerMap, contactMap] = await Promise.all([
      getCustomerDetails(customerIds),
      getDebtContacts(customerIds),
    ])

    const enriched = invoices.map((inv) => {
      const customer = customerMap.get(inv.customerId)
      const contact = contactMap.get(inv.customerId) ?? null
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
        createdAt: inv.lastFailureAt ?? null,
        oldestInvoiceAt: inv.oldestInvoiceAt,
        amountDue: inv.amountDue,
        currencyCode: inv.currencyCode,
        planName: inv.planName,
        invoiceCount: inv.invoiceCount,
        hubspotContact: contact
          ? { contactId: contact.contactId, contactUrl: contact.contactUrl, lifecycleLabel: contact.lifecycleLabel }
          : null,
      }
    })

    enriched.sort((a, b) => {
      if (!a.hubspotContact && b.hubspotContact) return -1
      if (a.hubspotContact && !b.hubspotContact) return 1
      return (b.invoiceCount - a.invoiceCount) || ((b.createdAt ?? 0) - (a.createdAt ?? 0))
    })

    if (hitLimit) console.warn('[/api/patients] Hit invoice fetch limit — some customers may be missing. Increase MAX_PAGES in chargebee.ts.')

    return NextResponse.json({ patients: enriched, total: enriched.length, hitLimit })
  } catch (err) {
    console.error('[/api/patients]', err)
    return NextResponse.json({ error: 'Error al obtener pacientes' }, { status: 500 })
  }
}
