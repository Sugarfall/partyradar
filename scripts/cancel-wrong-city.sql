-- Cancel AI-synced events that are clearly in the wrong city
-- (Amsterdam, Tokyo, Vilnius events appearing in Glasgow feed)
-- Executed: 2026-04-26

UPDATE "Event"
SET "isCancelled" = true
WHERE id IN (
  -- Amsterdam
  'cmoerrl7g003nw8uzjezboguz',  -- Interfering Grounds Kings Night
  'cmoerrmb90041w8uzr8bb8sj9',  -- Brazilian Kings & Queens Night
  -- Tokyo
  'cmoeqb0vx00a3lrkqjt9i524i',  -- Hi-Fi Un!corn Live Concert
  'cmoeexr6700559ys30w0mdwvl',  -- Booze & Glory
  -- Vilnius
  'cmoe8zqxr00mku2vnwkra25w6',  -- Zanias and Korine
  'cmoetprz4002s11bxs01lrdt1'   -- Próchno
);
