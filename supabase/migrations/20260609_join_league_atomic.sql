-- MED-2: Wrap deposit insert, member insert, and pool increment in one transaction.
-- Any failure rolls back all three — no partial state.
--
-- MED-1: Validate p_amount > 0 and <= league entry_fee_usdc before incrementing pool.

create or replace function join_league(
  p_league_id  uuid,
  p_profile_id text,
  p_tx_hash    text,
  p_amount     numeric
) returns void language plpgsql security definer as $$
declare
  v_entry_fee numeric;
begin
  -- Validate amount against the actual league fee
  select entry_fee_usdc into v_entry_fee
  from leagues where id = p_league_id for share;

  if v_entry_fee is null then
    raise exception 'League % not found', p_league_id;
  end if;

  if p_amount <= 0 or p_amount <> v_entry_fee then
    raise exception 'Amount % does not match league entry fee %', p_amount, v_entry_fee;
  end if;

  -- Record the deposit (tx_hash unique constraint prevents duplicates)
  insert into deposits (league_id, profile_id, amount_usdc, tx_hash, confirmed)
  values (p_league_id, p_profile_id, p_amount, p_tx_hash, true);

  -- Add member (PK unique constraint prevents duplicate joins)
  insert into league_members (league_id, profile_id, paid)
  values (p_league_id, p_profile_id, true)
  on conflict (league_id, profile_id) do update set paid = true;

  -- Atomically increment pool
  update leagues set pool_usdc = pool_usdc + p_amount where id = p_league_id;
end;
$$;
