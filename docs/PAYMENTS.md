# Going from practice mode to real money

Sparrow ships pledges in **practice mode only**: `pledges.mode` and `partner_pledges` are constrained so no money can move (D25). These steps are what is missing before real charging. None of them are code-only.

1. **Legal and regulatory review.** Charitable pledges, penalties charged to a person, and charges tied to personal behaviour have different rules by country and state. Get advice first. Also confirm how donations to each charity will be receipted.
2. **Choose a payment provider** that supports India (the schema uses INR) and saved payment methods, and set up a merchant account. Keep card data entirely with the provider.
3. **Edge Function for charging.** Add a function that reads `pledges` with `status = 'owed'` and creates the charge with the provider, with idempotency keys so a day is never charged twice. Store provider ids on the row, not card data. Secrets go in Edge Function secrets, never the repo.
4. **Relax the constraint** with a new migration, and only for people who have explicitly added a payment method and re-confirmed the limit. Keep the limit ramp, Gentle Mode and lighter-day rules.
5. **Refunds and disputes.** A person can contest a charge, especially if proofs or timezones were wrong. Define the policy and build the refund path before the first real charge.
6. **Charity payouts.** Verify each charity, record the disbursement, and publish how much was given.
7. **Support.** Add a visible way to stop all pledges and request refunds, and test with a small beta group first.

Until then, seed `charities` (insert rows with `name` and `blurb`), and watch `select public.pledge_metrics(30)` for how people use practice pledges.
