-- Whether the customer put the printed pickup note on the counter.
--
-- Not the same fact as "this consignment had a live pickup note" — that one the
-- release check computes, and nothing here softens it. This is the paper in
-- somebody's hand, which they lose, never print, or have not been handed yet.
-- The counter may still serve them when the check says yes, and the handover
-- has to carry the difference on its own row.
--
-- Nullable rather than defaulted true: every release written before today came
-- off a screen that never asked, and answering for them now would be inventing
-- an answer.
ALTER TABLE "Release" ADD COLUMN "notePresented" BOOLEAN;
ALTER TABLE "Release" ADD COLUMN "noteAbsenceReason" TEXT;
