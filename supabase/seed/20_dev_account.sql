-- The account `pnpm run dev` signs in as: a watchlist of well-known names, a
-- year of broker history, and a calendar and news around today. The history is
-- a dummy book of about $50k in USD, worked out once from real daily closes, so
-- its fills, holdings and account value agree with the charts. It moves by
-- whole weeks to end in the past week; weekdays stay weekdays.
--
-- One block: the CLI sends a seed file as one batch.

do $seed$
declare
  me constant uuid := '00000000-0000-4000-8000-000000000001';
  -- Days to move the history by; it was computed up to 2026-10-16.
  shift constant int := 7 * greatest(0, (current_date - 1 - date '2026-10-16') / 7);
begin

-- Account ----------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', me, 'authenticated', 'authenticated',
  'dev@vantage.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
  me::text, me,
  jsonb_build_object('sub', me::text, 'email', 'dev@vantage.test', 'email_verified', true),
  'email', now(), now()
);

insert into public.watchlist_themes (owner, id, label, position) values
  (me, 'ai', 'AI', 0),
  (me, 'mag7', 'Mag 7', 1),
  (me, 'memory', 'Memory', 2),
  (me, 'photonics', 'Photonics', 3),
  (me, 'crypto', 'Crypto', 4);
insert into public.watchlist (owner, ticker, name, quote_symbol, currency, themes, position)
select me, w.ticker, w.name, w.symbol, w.currency, w.themes, row_number() over () - 1
from (values
  ('NVDA', 'Nvidia', 'NVDA', 'USD', '{ai,mag7}'::text[]),
  ('SKHY', 'SK hynix', '000660.KS', 'KRW', '{ai,memory}'),
  ('AMD', 'AMD', 'AMD', 'USD', '{ai}'),
  ('AVGO', 'Broadcom', 'AVGO', 'USD', '{ai}'),
  ('TSM', 'TSMC', 'TSM', 'USD', '{ai}'),
  ('ASML', 'ASML', 'ASML.AS', 'EUR', '{ai}'),
  ('AAPL', 'Apple', 'AAPL', 'USD', '{mag7}'),
  ('MSFT', 'Microsoft', 'MSFT', 'USD', '{mag7}'),
  ('GOOG', 'Alphabet', 'GOOG', 'USD', '{mag7}'),
  ('AMZN', 'Amazon', 'AMZN', 'USD', '{mag7}'),
  ('META', 'Meta Platforms', 'META', 'USD', '{mag7}'),
  ('TSLA', 'Tesla', 'TSLA', 'USD', '{mag7}'),
  ('MU', 'Micron Technology', 'MU', 'USD', '{memory}'),
  ('SNDK', 'SanDisk', 'SNDK', 'USD', '{memory}'),
  ('LITE', 'Lumentum', 'LITE', 'USD', '{photonics}'),
  ('COHR', 'Coherent', 'COHR', 'USD', '{photonics}'),
  ('AAOI', 'Applied Optoelectronics', 'AAOI', 'USD', '{photonics}'),
  ('BTC', 'Bitcoin', 'BTC-USD', 'USD', '{crypto}'),
  ('ETH', 'Ethereum', 'ETH-USD', 'USD', '{crypto}')
) as w(ticker, name, symbol, currency, themes);

-- Broker history --------------------------------------------------------------------

insert into public.trade_fills (
  owner, id, traded_at, account_id, conid, order_id, symbol, description, asset_category,
  currency, side, quantity, price, multiplier, proceeds, commission, net_cash,
  fx_rate_to_base, broker_pnl, open_close
)
select me, f.id, (f.day::date + shift) + f.at::time, 'U1234567', f.conid, f.id, f.symbol, f.description,
  'STK', f.currency, case when f.quantity > 0 then 'buy' else 'sell' end, f.quantity, f.price,
  1, round(-f.quantity * f.price, 2), f.commission, round(-f.quantity * f.price, 2) + f.commission,
  f.fx, f.pnl, f.open_close
from (values
  ('seed-001', '2025-10-24', '10:13:00', '117902840', 'ASML', 'ASML HOLDING NV', 'EUR', 4, 894.4, -1, 1.161805, 0, 'O'),
  ('seed-002', '2025-10-31', '10:26:00', '76792991', 'TSLA', 'TESLA INC', 'USD', 8, 456.56, -1, 1, 0, 'O'),
  ('seed-003', '2025-11-07', '10:39:00', '9939', 'MU', 'MICRON TECHNOLOGY INC', 'USD', 8, 237.92, -1, 1, 0, 'O'),
  ('seed-004', '2025-11-21', '10:52:00', '4815747', 'NVDA', 'NVIDIA CORP', 'USD', 30, 178.88, -1, 1, 0, 'O'),
  ('seed-005', '2025-12-08', '11:05:00', '4391', 'AMD', 'ADVANCED MICRO DEVICES', 'USD', 15, 221.11, -1, 1, 0, 'O'),
  ('seed-006', '2025-12-30', '11:18:00', '208813720', 'GOOG', 'ALPHABET INC-CL C', 'USD', 16, 314.55, -1, 1, 0, 'O'),
  ('seed-007', '2026-01-14', '11:31:00', '120226155', 'AAOI', 'APPLIED OPTOELECTRONICS INC', 'USD', 60, 34.47, -1, 1, 0, 'O'),
  ('seed-008', '2026-01-22', '11:44:00', '209279269', 'LITE', 'LUMENTUM HOLDINGS INC', 'USD', 10, 354.49, -1, 1, 0, 'O'),
  ('seed-009', '2026-01-29', '11:57:00', '272093', 'MSFT', 'MICROSOFT CORP', 'USD', 6, 433.5, -1, 1, 0, 'O'),
  ('seed-010', '2026-03-27', '12:10:00', '272093', 'MSFT', 'MICROSOFT CORP', 'USD', -6, 356.77, -1, 1, -462.38, 'C'),
  ('seed-011', '2026-04-13', '12:23:00', '76792991', 'TSLA', 'TESLA INC', 'USD', -8, 352.42, -1, 1, -835.12, 'C'),
  ('seed-012', '2026-04-20', '12:36:00', '9939', 'MU', 'MICRON TECHNOLOGY INC', 'USD', 4, 448.42, -1, 1, 0, 'O'),
  ('seed-013', '2026-04-27', '12:49:00', '107113386', 'META', 'META PLATFORMS INC-CLASS A', 'USD', 6, 678.62, -1, 1, 0, 'O'),
  ('seed-014', '2026-05-11', '13:02:00', '76792991', 'TSLA', 'TESLA INC', 'USD', -6, 445, -1, 1, 0, 'O'),
  ('seed-015', '2026-06-09', '13:15:00', '590213434', 'COHR', 'COHERENT CORP', 'USD', 20, 355.94, -1, 1, 0, 'O'),
  ('seed-016', '2026-06-24', '13:28:00', '120226155', 'AAOI', 'APPLIED OPTOELECTRONICS INC', 'USD', -60, 146.97, -1, 1, 6748, 'C'),
  ('seed-017', '2026-07-09', '13:41:00', '76792991', 'TSLA', 'TESLA INC', 'USD', 6, 406.55, -1, 1, 228.7, 'C'),
  ('seed-018', '2026-07-23', '13:54:00', '117902840', 'ASML', 'ASML HOLDING NV', 'EUR', 2, 1579.2, -1, 1.137682, 0, 'O'),
  ('seed-019', '2026-08-06', '14:07:00', '209279269', 'LITE', 'LUMENTUM HOLDINGS INC', 'USD', -4, 838.06, -1, 1, 1932.88, 'C'),
  ('seed-020', '2026-09-03', '14:20:00', '107113386', 'META', 'META PLATFORMS INC-CLASS A', 'USD', -6, 610.68, -1, 1, -409.64, 'C'),
  ('seed-021', '2026-09-18', '14:33:00', '313130367', 'AVGO', 'BROADCOM INC', 'USD', 10, 357.61, -1, 1, 0, 'O')
) as f(id, day, at, conid, symbol, description, currency, quantity, price, commission, fx, pnl, open_close);

-- The latest statement; the page shows its holdings at live prices.
insert into public.portfolio_snapshots (owner, as_of, account_id, base_currency, nav, cash, fetched_at)
values (me, date '2026-10-16' + shift, 'U1234567', 'USD', 47525.2, -5595.31,
  (date '2026-10-16' + shift) + interval '1 day 6 hours');
insert into public.snapshot_positions (
  owner, as_of, account_id, symbol, description, asset_category, currency, quantity,
  mark_price, position_value, cost_basis, unrealized_pnl, fx_rate_to_base
)
select me, date '2026-10-16' + shift, 'U1234567', p.symbol, p.description, 'STK', p.currency,
  p.quantity, p.mark, round(p.quantity * p.mark, 2), p.cost, round(p.quantity * p.mark - p.cost, 2), p.fx
from (values
  ('AMD', 'ADVANCED MICRO DEVICES', 'USD', 15, 528.75, 3317.65, 1),
  ('ASML', 'ASML HOLDING NV', 'EUR', 6, 1477.2, 6738, 1.121315),
  ('AVGO', 'BROADCOM INC', 'USD', 10, 328.75, 3577.1, 1),
  ('COHR', 'COHERENT CORP', 'USD', 20, 232.9, 7119.8, 1),
  ('GOOG', 'ALPHABET INC-CL C', 'USD', 16, 336.91, 5033.8, 1),
  ('LITE', 'LUMENTUM HOLDINGS INC', 'USD', 6, 824.13, 2127.54, 1),
  ('MU', 'MICRON TECHNOLOGY INC', 'USD', 12, 878.84, 3699.04, 1),
  ('NVDA', 'NVIDIA CORP', 'USD', 30, 214.13, 5367.4, 1)
) as p(symbol, description, currency, quantity, mark, cost, fx);

-- Account value at each statement: day, NAV, cash.
insert into public.nav_history (owner, as_of, account_id, base_currency, nav, cash)
select me, n.day::date + shift, 'U1234567', 'USD', n.nav, n.cash
from (values
  ('2025-10-17', 20000, 20000), ('2025-10-20', 20000, 20000), ('2025-10-21', 20000, 20000), ('2025-10-22', 20000, 20000),
  ('2025-10-23', 20000, 20000), ('2025-10-24', 19998.84, 15842.37), ('2025-10-27', 20062.58, 15837.48), ('2025-10-28', 20059.42, 15830.3),
  ('2025-10-29', 20115.41, 15828.12), ('2025-10-30', 20198.88, 15847.62), ('2025-10-31', 20107.55, 12205.2), ('2025-11-03', 20240.35, 12221.09),
  ('2025-11-04', 20008.19, 12224.28), ('2025-11-05', 20097.98, 12236.3), ('2025-11-06', 19916.79, 12232.29), ('2025-11-07', 19671.5, 10309.16),
  ('2025-11-10', 19993.69, 10311.07), ('2025-11-11', 19852.17, 10306.29), ('2025-11-12', 19832.95, 10295.46), ('2025-11-13', 19492.71, 10293.78),
  ('2025-11-14', 19555.99, 10279.55), ('2025-11-17', 19564.33, 10285.49), ('2025-11-18', 19345.48, 10294.36), ('2025-11-19', 19444.15, 10297.72),
  ('2025-11-20', 19192.57, 10312.21), ('2025-11-21', 18949.01, 4947), ('2025-11-24', 19519.92, 4956.65), ('2025-11-25', 19402.51, 4952.19),
  ('2025-11-26', 19805.05, 4936.17), ('2025-11-28', 19758.56, 4923.64), ('2025-12-01', 19985.89, 4923.06), ('2025-12-02', 20074.78, 4920.84),
  ('2025-12-03', 20229.43, 4913.6), ('2025-12-04', 20317.97, 4899.66), ('2025-12-05', 20350.04, 4908.27), ('2025-12-08', 20451.43, 1591.54),
  ('2025-12-09', 20482.48, 1591.1), ('2025-12-10', 20551.94, 1595.8), ('2025-12-11', 20365.73, 1569.7), ('2025-12-12', 19914.14, 1556.04),
  ('2025-12-15', 20032.66, 1556.68), ('2025-12-16', 20070.97, 1550.6), ('2025-12-17', 19302.15, 1552.43), ('2025-12-18', 19843.41, 1555),
  ('2025-12-19', 20397.82, 1560.96), ('2025-12-22', 20620.94, 1567.25), ('2025-12-23', 20791.79, 1546.55), ('2025-12-24', 20838.17, 1535.97),
  ('2025-12-26', 20798.21, 1539.6), ('2025-12-29', 20727.16, 1544.12), ('2025-12-30', 20700.73, -3489.73), ('2025-12-31', 20558.25, -3480.58),
  ('2026-01-02', 21244.67, -3481.71), ('2026-01-05', 21613.1, -3465.32), ('2026-01-06', 21579.19, -3469), ('2026-01-07', 21608.19, -3459.45),
  ('2026-01-08', 21216.21, -3455.34), ('2026-01-09', 21775.48, -3448.57), ('2026-01-12', 21960.72, -3436.35), ('2026-01-13', 22248.14, -3451.83),
  ('2026-01-14', 22014.61, -5512.29), ('2026-01-15', 22623.33, -5513.64), ('2026-01-16', 22893.91, -5500.29), ('2026-01-20', 22401.44, -5511.07),
  ('2026-01-21', 23242.39, -5542.82), ('2026-01-22', 23677.76, -9069.08), ('2026-01-23', 23546.38, -9098.3), ('2026-01-26', 23165.66, -9135.46),
  ('2026-01-27', 24117.58, -9141.91), ('2026-01-28', 24964.03, -9192.42), ('2026-01-29', 24515.81, -11780.15), ('2026-01-30', 24622.76, -11775.85),
  ('2026-02-02', 25152.66, -11734.14), ('2026-02-03', 24711.71, -11716.08), ('2026-02-04', 23048.49, -11722.31), ('2026-02-05', 22989.74, -11717.12),
  ('2026-02-06', 24805.19, -11708.62), ('2026-02-09', 25639.18, -11725.76), ('2026-02-10', 25272.67, -11753.77), ('2026-02-11', 25662.18, -11748.61),
  ('2026-02-12', 25041.37, -11743.76), ('2026-02-13', 24736.39, -11741.03), ('2026-02-17', 24893.42, -11734.39), ('2026-02-18', 25275.18, -11735.09),
  ('2026-02-19', 25869.18, -11712.54), ('2026-02-20', 26822.49, -11705.49), ('2026-02-23', 26725.27, -11728.97), ('2026-02-24', 27425.64, -11714.33),
  ('2026-02-25', 28294.89, -11707.68), ('2026-02-26', 26613.58, -11721.96), ('2026-02-27', 28345.63, -11717.62), ('2026-03-02', 30249.21, -11702.03),
  ('2026-03-03', 28144.05, -11679.78), ('2026-03-04', 28976.53, -11649.35), ('2026-03-05', 28630.22, -11657.71), ('2026-03-06', 26580.98, -11647.85),
  ('2026-03-09', 28892.55, -11617.5), ('2026-03-10', 30230.33, -11651.13), ('2026-03-11', 30888.87, -11649.01), ('2026-03-12', 28483.6, -11624.64),
  ('2026-03-13', 27896.7, -11616.93), ('2026-03-16', 28198.2, -11585.96), ('2026-03-17', 28194.89, -11609.02), ('2026-03-18', 28931.52, -11623.31),
  ('2026-03-19', 29857.2, -11596.47), ('2026-03-20', 27503.38, -11636.93), ('2026-03-23', 28512.84, -11630.71), ('2026-03-24', 30213.9, -11647.51),
  ('2026-03-25', 30283.47, -11650.22), ('2026-03-26', 27195.34, -11631.19), ('2026-03-27', 26915.32, -9482.12), ('2026-03-30', 24984.04, -9455.25),
  ('2026-03-31', 26338.36, -9496.12), ('2026-04-01', 27968.44, -9501.97), ('2026-04-02', 29489.09, -9484.5), ('2026-04-06', 29284.33, -9484.31),
  ('2026-04-07', 30208.85, -9536.34), ('2026-04-08', 33026.25, -9526.59), ('2026-04-09', 33441.7, -9538), ('2026-04-10', 34952.5, -9538),
  ('2026-04-13', 34987.94, -6747.41), ('2026-04-14', 35349.98, -6758.35), ('2026-04-15', 34680.63, -6761.84), ('2026-04-16', 36467.81, -6752.38),
  ('2026-04-17', 36913.82, -6752.38), ('2026-04-20', 42013.76, -3547.65), ('2026-04-21', 40625, -3533.29), ('2026-04-22', 41914.01, -3519.61),
  ('2026-04-23', 40694.3, -3511.68), ('2026-04-24', 43778, -3511.68), ('2026-04-27', 42891.89, -7598.57), ('2026-04-28', 40927.9, -7596.55),
  ('2026-04-29', 42869.72, -7584.7), ('2026-04-30', 44312.15, -7600.59), ('2026-05-01', 46296.52, -7600.59), ('2026-05-04', 45838.12, -7587.29),
  ('2026-05-05', 47627.84, -7595.82), ('2026-05-06', 49234.56, -7607.15), ('2026-05-07', 47134.87, -7601.47), ('2026-05-08', 48820.54, -7601.47),
  ('2026-05-11', 52947.57, -4949.78), ('2026-05-12', 51933.66, -4933.85), ('2026-05-13', 55495.42, -4926.92), ('2026-05-14', 54236.84, -4907.6),
  ('2026-05-15', 51578.15, -4907.6), ('2026-05-18', 48895, -4905.12), ('2026-05-19', 48655.01, -4887.93), ('2026-05-20', 49387.36, -4894.45),
  ('2026-05-21', 51360.8, -4892.95), ('2026-05-22', 51675.26, -4892.95), ('2026-05-26', 53320.53, -4898.57), ('2026-05-27', 53596.16, -4891.8),
  ('2026-05-28', 52944.89, -4904.29), ('2026-05-29', 52535.55, -4904.29), ('2026-06-01', 55657.63, -4898.08), ('2026-06-02', 58390.56, -4893.29),
  ('2026-06-03', 56854.06, -4888.75), ('2026-06-04', 57215.43, -4889.91), ('2026-06-05', 51739.67, -4889.91), ('2026-06-08', 54719.88, -4859.78),
  ('2026-06-09', 51620.25, -11982.05), ('2026-06-10', 51398.87, -11982.15), ('2026-06-11', 53979.13, -11996.58), ('2026-06-12', 54910.72, -11996.58),
  ('2026-06-15', 59468.35, -12003.11), ('2026-06-16', 55230.82, -12008.75), ('2026-06-17', 55135.26, -11972.03), ('2026-06-18', 56658.52, -11954.57),
  ('2026-06-22', 58951.59, -11943.32), ('2026-06-23', 52969.19, -11926.29), ('2026-06-24', 53193.84, -3100.03), ('2026-06-25', 55811.22, -3102.71),
  ('2026-06-26', 53416.55, -3102.71), ('2026-06-29', 54788.88, -3124.3), ('2026-06-30', 56284.82, -3121.18), ('2026-07-01', 53027.17, -3108.54),
  ('2026-07-02', 50189.46, -3124.54), ('2026-07-06', 51233.62, -3131.36), ('2026-07-07', 49045.02, -3117.78), ('2026-07-08', 49537.49, -3124.3),
  ('2026-07-09', 51836.62, -5568.67), ('2026-07-10', 52261.53, -5568.67), ('2026-07-13', 50211.44, -5551.11), ('2026-07-14', 51964.56, -5565.54),
  ('2026-07-15', 50209.23, -5581.86), ('2026-07-16', 47968.76, -5572.7), ('2026-07-17', 47465.76, -5572.7), ('2026-07-20', 48280.67, -5563.2),
  ('2026-07-21', 51867.14, -5558.08), ('2026-07-22', 51630.02, -5560.92), ('2026-07-23', 51208.46, -9142.81), ('2026-07-24', 48566.5, -9142.81),
  ('2026-07-27', 46071.87, -9137.85), ('2026-07-28', 43180, -9149.36), ('2026-07-29', 40530.69, -9203.73), ('2026-07-30', 44829.29, -9241.66),
  ('2026-07-31', 45159.53, -9241.66), ('2026-08-03', 47056.2, -9230.76), ('2026-08-04', 50293.41, -9247.66), ('2026-08-05', 49547.34, -9264.45),
  ('2026-08-06', 49884.15, -5891.23), ('2026-08-07', 51105.89, -5891.23), ('2026-08-10', 49130.45, -5905.84), ('2026-08-11', 49499.04, -5904.05),
  ('2026-08-12', 51506.5, -5894.81), ('2026-08-13', 51542.64, -5898.39), ('2026-08-14', 52274.11, -5898.39), ('2026-08-17', 53532.58, -5930.35),
  ('2026-08-18', 50021.94, -5928.09), ('2026-08-19', 48794.77, -5991.67), ('2026-08-20', 49557.61, -6001.14), ('2026-08-21', 49459.77, -6001.14),
  ('2026-08-24', 47831.29, -5988), ('2026-08-25', 49286.73, -5992.31), ('2026-08-26', 49662.25, -5978.93), ('2026-08-27', 50104.41, -5979.93),
  ('2026-08-28', 49084.36, -5979.93), ('2026-08-31', 49200.78, -5953.84), ('2026-09-01', 48104.25, -5938.95), ('2026-09-02', 48673, -5932.07),
  ('2026-09-03', 48624.62, -2297.95), ('2026-09-04', 50503.2, -2297.95), ('2026-09-08', 51928.91, -2297.31), ('2026-09-09', 52269.44, -2301.68),
  ('2026-09-10', 50581.22, -2285.58), ('2026-09-11', 51043.47, -2285.58), ('2026-09-14', 48061.89, -2244.2), ('2026-09-15', 48287.34, -2236.84),
  ('2026-09-16', 49385.21, -2191.18), ('2026-09-17', 50835.16, -2195.35), ('2026-09-18', 52458.49, -5772.45), ('2026-09-21', 54405.04, -5764.74),
  ('2026-09-22', 55062.81, -5753.51), ('2026-09-23', 54033.18, -5709), ('2026-09-24', 54011.78, -5704.2), ('2026-09-25', 54438.11, -5704.2),
  ('2026-09-28', 53515.87, -5702.8), ('2026-09-29', 54558.09, -5681.34), ('2026-09-30', 54536.83, -5672.16), ('2026-10-01', 55943.76, -5620.05),
  ('2026-10-02', 57213.72, -5620.05), ('2026-10-05', 57308.64, -5597.94), ('2026-10-06', 57731.01, -5622.52), ('2026-10-07', 57783.13, -5587.36),
  ('2026-10-08', 55487.59, -5595.23), ('2026-10-09', 55581.63, -5595.23), ('2026-10-12', 53427.48, -5559.64), ('2026-10-13', 52828.89, -5589.47),
  ('2026-10-14', 50458, -5583.13), ('2026-10-15', 49572, -5595.31), ('2026-10-16', 47525.2, -5595.31)
) as n(day, nav, cash);

-- Calendar and news, around today ---------------------------------------------------------

insert into public.events (
  owner, ticker, category, kind, title, description, starts_on, ends_on, estimated, external_id
)
select me, e.ticker, e.category, e.kind, e.title, e.description, current_date + e.starts,
  current_date + e.ends, e.estimated, 'seed-event-' || row_number() over ()
from (values
  ('META', 'milestone', 'conference', 'Connect', 'Glasses and AI assistant roadmap.', -30, -29, false),
  ('TSLA', 'results', 'earnings', 'Q3 earnings', 'Deliveries already out; margins and robotaxi timing in focus.', -12, null, false),
  ('TSM', 'results', 'earnings', 'Q3 earnings', 'Advanced-node mix and capex guidance.', -8, null, false),
  ('GOOG', 'results', 'earnings', 'Q3 earnings', null, -4, null, false),
  ('MSFT', 'results', 'earnings', 'FY27 Q1 earnings', 'Azure growth and capex guidance.', -2, null, false),
  ('AAPL', 'corporate', 'dividend', 'Quarterly dividend (ex-date)', '$0.27 per share.', 3, null, false),
  ('ASML', 'milestone', 'investor day', 'Investor day', 'New 2030 targets expected.', 6, null, false),
  ('AMD', 'results', 'earnings', 'Q3 earnings', 'Data-center GPU ramp.', 9, null, false),
  ('META', 'results', 'earnings', 'Q3 earnings', null, 11, null, true),
  ('NVDA', 'milestone', 'conference', 'GTC Washington', 'Keynote on the first day.', 12, 14, false),
  ('BTC', 'external', 'macro', 'FOMC rate decision', null, 16, 17, false),
  ('AVGO', 'corporate', 'dividend', 'Quarterly dividend (ex-date)', null, 17, null, true),
  ('MU', 'external', 'regulation', 'Export-rule decision on memory to China', 'Commerce Department ruling expected.', 20, null, true),
  ('AMZN', 'milestone', 'conference', 're:Invent', null, 24, 28, false),
  ('NVDA', 'results', 'earnings', 'Q3 FY27 earnings', null, 38, null, true)
) as e(ticker, category, kind, title, description, starts, ends, estimated);

insert into public.news (owner, ticker, published_at, title, description, url, sentiment, expected, external_id)
select me, n.ticker, now() - make_interval(hours => n.hours), n.title, n.description,
  'https://example.com/news/' || row_number() over (), n.sentiment, n.expected,
  'seed-news-' || row_number() over ()
from (values
  ('NVDA', 3, 'Nvidia ships first rack-scale systems to new cloud partners', 'Deliveries start with three neoclouds.', 'positive', true),
  ('MU', 7, 'Micron lifts HBM output target for next year', 'Capacity additions pulled forward on hyperscaler demand.', 'positive', false),
  ('SKHY', 20, 'SK hynix sold out of HBM through next year', null, 'positive', true),
  ('ASML', 26, 'ASML orders beat on high-NA demand', 'Bookings well above consensus.', 'positive', false),
  ('TSLA', 30, 'Tesla delays wider robotaxi rollout', null, 'negative', true),
  ('GOOG', 50, 'Alphabet cloud backlog tops estimates', 'Margins expand for a fourth straight quarter.', 'positive', false),
  ('AMD', 75, 'AMD signs multi-year GPU supply deal', null, 'positive', false),
  ('LITE', 96, 'Lumentum sees transceiver lead times stretching', 'Laser supply remains the bottleneck into next year.', 'mixed', null),
  ('META', 120, 'Meta raises capex guidance again', null, 'mixed', true),
  ('AVGO', 150, 'Broadcom adds a fourth custom-accelerator customer', null, 'positive', false),
  ('MSFT', 190, 'Microsoft expands data-center leases in Europe', null, 'neutral', null),
  ('COHR', 230, 'Coherent trims industrial-laser outlook', 'Datacom strength offsets the miss.', 'negative', true)
) as n(ticker, hours, title, description, sentiment, expected);

end;
$seed$;
