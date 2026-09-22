-- Goods charged by the piece (phones) or by the bale, as the old system did.
ALTER TYPE "RateBasis" ADD VALUE 'PER_PIECE';
ALTER TYPE "RateBasis" ADD VALUE 'PER_BALE';
