import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe } from '../lib/stripe'

const router = Router()

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'

/** Build fresh return/refresh URLs for a Stripe Account Link. */
function accountLinkUrls() {
  return {
    return_url: `${FRONTEND_URL}/payouts?onboarded=1`,
    refresh_url: `${FRONTEND_URL}/payouts?refresh=1`,
  }
}

/** Mirror a Stripe account's verification flags onto the local User row. */
async function syncConnectFlags(userId: string, account: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeConnectChargesEnabled: account.charges_enabled,
      stripeConnectPayoutsEnabled: account.payouts_enabled,
      stripeConnectDetailsSubmitted: account.details_submitted,
    },
  })
}

/** POST /api/connect/onboard — start or resume Connect Express onboarding.
 *  Returns a short-lived AccountLink URL the client should redirect to.
 */
router.post('/onboard', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
    const user = req.user!.dbUser
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, stripeConnectAccountId: true, currency: true },
    })
    if (!full) throw new AppError('User not found', 404)

    let accountId = full.stripeConnectAccountId

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: full.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { partyradarUserId: full.id },
        // country/currency default to the Stripe account's country. The
        // onboarding flow lets the host pick their country + bank details.
      })
      accountId = account.id
      await prisma.user.update({
        where: { id: full.id },
        data: { stripeConnectAccountId: accountId },
      })
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      ...accountLinkUrls(),
    })

    res.json({ data: { url: link.url, accountId } })
  } catch (err) { next(err) }
})

/** GET /api/connect/status — report current Connect state for the UI.
 *  Always re-fetches from Stripe (and refreshes our cache) so the host sees
 *  the truth after finishing onboarding in the Stripe tab.
 */
router.get('/status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!.dbUser
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, stripeConnectAccountId: true },
    })
    if (!full?.stripeConnectAccountId) {
      res.json({ data: { connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false } })
      return
    }

    const stripe = ensureStripe()
    const account = await stripe.accounts.retrieve(full.stripeConnectAccountId)
    await syncConnectFlags(full.id, account)

    res.json({
      data: {
        connected: true,
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsDisabledReason: account.requirements?.disabled_reason ?? null,
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/connect/dashboard — deep link into the host's Express dashboard.
 *  Only valid once onboarding completed; Stripe rejects login links on
 *  accounts that haven't submitted details.
 */
router.post('/dashboard', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
    const user = req.user!.dbUser
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeConnectAccountId: true, stripeConnectDetailsSubmitted: true },
    })
    if (!full?.stripeConnectAccountId) throw new AppError('No Connect account', 400)
    if (!full.stripeConnectDetailsSubmitted) {
      throw new AppError('Finish onboarding before opening the payouts dashboard', 400, 'CONNECT_NOT_READY')
    }

    const login = await stripe.accounts.createLoginLink(full.stripeConnectAccountId)
    res.json({ data: { url: login.url } })
  } catch (err) { next(err) }
})

export default router
