-- Each line may be charged by its own measure. Null follows the rate book.
ALTER TABLE "CargoPackage" ADD COLUMN "chargeUnit" "RateBasis";
