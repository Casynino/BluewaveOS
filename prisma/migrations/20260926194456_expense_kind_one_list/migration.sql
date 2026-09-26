-- A KIND OF COST BELONGS TO ONE LIST.
--
-- A sailing's kinds, an executive's and the office's are kept apart by the
-- server on every write. A kind flagged as both would be offered on the
-- sailing list and then refused under every kind of spending — so the state
-- is made impossible rather than handled. Nothing live has both flags: the
-- executive flag arrived one migration ago, false on every existing kind.
ALTER TABLE "ExpenseType"
  ADD CONSTRAINT "ExpenseType_one_list" CHECK (NOT ("forContainer" AND "forExecutive"));
