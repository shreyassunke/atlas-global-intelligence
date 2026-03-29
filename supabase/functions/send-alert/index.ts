import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') ?? ''
const FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@atlas-intel.app'

interface IncomingEvent {
  id: string
  title: string
  tier: string
  domain: string
  region?: string
  severity?: number
  summary?: string
}

interface AlertRule {
  id: string
  user_id: string
  tier: string | null
  domain: string | null
  region: string | null
  channel: 'email' | 'sms'
  destination: string
  enabled: boolean
}

function matches(rule: AlertRule, event: IncomingEvent): boolean {
  if (!rule.enabled) return false
  if (rule.tier && rule.tier !== event.tier) return false
  if (rule.domain && rule.domain !== event.domain) return false
  if (rule.region && rule.region !== 'global' && event.region && !event.region.toLowerCase().includes(rule.region.toLowerCase())) {
    return false
  }
  return true
}

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email')
    return
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    console.error(`Resend error ${resp.status}: ${text}`)
  }
}

async function sendSms(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('Twilio credentials not set, skipping SMS')
    return
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    console.error(`Twilio error ${resp.status}: ${text}`)
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let event: IncomingEvent
  try {
    event = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!event.id || !event.title || !event.tier) {
    return new Response('Missing required fields: id, title, tier', { status: 400 })
  }

  const { data: rules, error } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('enabled', true)

  if (error) {
    console.error('Failed to fetch alert rules:', error)
    return new Response('Internal error', { status: 500 })
  }

  const matchingRules = (rules as AlertRule[]).filter((r) => matches(r, event))

  const subject = `[TATVA] ${event.tier.toUpperCase()}: ${event.title}`
  const body = [
    `TATVA Alert — ${event.tier.toUpperCase()}`,
    `Title: ${event.title}`,
    event.domain ? `Domain: ${event.domain}` : '',
    event.region ? `Region: ${event.region}` : '',
    event.summary ? `\n${event.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const results = await Promise.allSettled(
    matchingRules.map((rule) =>
      rule.channel === 'email'
        ? sendEmail(rule.destination, subject, body)
        : sendSms(rule.destination, body),
    ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return new Response(
    JSON.stringify({ matched: matchingRules.length, sent, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
