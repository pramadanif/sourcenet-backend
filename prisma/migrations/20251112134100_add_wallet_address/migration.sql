-- AlterTable
ALTER TABLE "users" 
ADD COLUMN "wallet_address" TEXT,
ALTER COLUMN "zklogin_address" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");
