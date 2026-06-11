-- #7: Payout failure visibility. On-chain payout errors only went to
-- console.error in serverless logs — effectively invisible. Persist the
-- last failure per league so the admin panel can surface it and the
-- "Payout winner" button becomes an informed retry.

alter table leagues add column if not exists payout_error text;
