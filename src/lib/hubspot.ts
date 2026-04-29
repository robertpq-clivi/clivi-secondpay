const HS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!
const BASE_URL = 'https://api.hubapi.com'

const ACTIVE_LIFECYCLE_STAGES = ['customer', 'evangelist', '79426723', '79657525']

const headers = {
  Authorization: `Bearer ${HS_TOKEN}`,
  'Content-Type': 'application/json',
}

export interface HubSpotContact {
  contactId: string
  contactUrl: string
  lifecycleLabel: string
}

let lifecycleLabelCache: Record<string, string> | null = null
async function getLifecycleLabel(value: string): Promise<string> {
  if (!lifecycleLabelCache) {
    const res = await fetch(`${BASE_URL}/crm/v3/properties/contacts/lifecyclestage`, { headers })
    if (res.ok) {
      const data = await res.json()
      lifecycleLabelCache = Object.fromEntries(
        (data.options ?? []).map((o: any) => [o.value, o.label])
      )
    } else {
      lifecycleLabelCache = {}
    }
  }
  return lifecycleLabelCache[value] ?? value
}

// Given a list of chargebee customer IDs, returns a map cbId -> HubSpotContact
export async function getDebtContacts(chargebeeIds: string[]): Promise<Map<string, HubSpotContact>> {
  if (!chargebeeIds.length) return new Map()

  await getLifecycleLabel('__warmup__') // pre-warm label cache

  const batches: string[][] = []
  for (let i = 0; i < chargebeeIds.length; i += 100) batches.push(chargebeeIds.slice(i, i + 100))

  const results = await Promise.all(batches.map(async (batch) => {
    const res = await fetch(`${BASE_URL}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: 'chargebee_customer_id', operator: 'IN', values: batch },
            { propertyName: 'lifecyclestage', operator: 'IN', values: ACTIVE_LIFECYCLE_STAGES },
          ],
        }],
        properties: ['chargebee_customer_id', 'lifecyclestage'],
        limit: 100,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  }))

  const map = new Map<string, HubSpotContact>()
  for (const contacts of results) {
    for (const contact of contacts) {
      const cbId = contact.properties?.chargebee_customer_id
      if (!cbId) continue
      const stageValue = contact.properties?.lifecyclestage ?? ''
      map.set(cbId, {
        contactId: contact.id,
        contactUrl: `https://app.hubspot.com/contacts/8799389/record/0-1/${contact.id}`,
        lifecycleLabel: lifecycleLabelCache?.[stageValue] ?? stageValue,
      })
    }
  }

  return map
}
