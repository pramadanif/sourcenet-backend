-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "zklogin_address" TEXT NOT NULL,
    "google_email" TEXT,
    "username" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "website_url" TEXT,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(20,9) NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2),
    "reputation_score" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_pods" (
    "id" UUID NOT NULL,
    "datapod_id" TEXT NOT NULL,
    "seller_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_sui" DECIMAL(20,9) NOT NULL,
    "data_hash" TEXT NOT NULL,
    "total_sales" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "blob_id" TEXT NOT NULL,
    "kiosk_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "data_pods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "purchase_request_id" TEXT NOT NULL,
    "datapod_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_address" TEXT NOT NULL,
    "seller_address" TEXT NOT NULL,
    "buyer_public_key" TEXT NOT NULL,
    "price_sui" DECIMAL(20,9) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "encrypted_blob_id" TEXT,
    "decryption_key" TEXT,
    "tx_digest" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "datapod_id" UUID NOT NULL,
    "purchase_request_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_address" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_stagings" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "datapod_id" UUID,
    "file_path" TEXT NOT NULL,
    "data_hash" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_stagings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_transactions" (
    "id" UUID NOT NULL,
    "purchase_request_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_address" TEXT NOT NULL,
    "buyer_address" TEXT NOT NULL,
    "amount_sui" DECIMAL(20,9) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'holding',
    "tx_digest" TEXT,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_audits" (
    "id" UUID NOT NULL,
    "tx_type" TEXT NOT NULL,
    "tx_digest" TEXT,
    "user_address" TEXT NOT NULL,
    "user_id" UUID,
    "datapod_id" UUID,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_checkpoints" (
    "id" TEXT NOT NULL DEFAULT 'indexer-checkpoint',
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_zklogin_address_key" ON "users"("zklogin_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_email_key" ON "users"("google_email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_zklogin_address_idx" ON "users"("zklogin_address");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_pods_datapod_id_key" ON "data_pods"("datapod_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_pods_data_hash_key" ON "data_pods"("data_hash");

-- CreateIndex
CREATE UNIQUE INDEX "data_pods_blob_id_key" ON "data_pods"("blob_id");

-- CreateIndex
CREATE INDEX "data_pods_category_status_published_at_idx" ON "data_pods"("category", "status", "published_at");

-- CreateIndex
CREATE INDEX "data_pods_seller_id_idx" ON "data_pods"("seller_id");

-- CreateIndex
CREATE INDEX "data_pods_price_sui_idx" ON "data_pods"("price_sui");

-- CreateIndex
CREATE INDEX "data_pods_status_idx" ON "data_pods"("status");

-- CreateIndex
CREATE INDEX "data_pods_published_at_idx" ON "data_pods"("published_at");

-- CreateIndex
CREATE INDEX "data_pods_title_idx" ON "data_pods"("title");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_purchase_request_id_key" ON "purchase_requests"("purchase_request_id");

-- CreateIndex
CREATE INDEX "purchase_requests_buyer_address_status_idx" ON "purchase_requests"("buyer_address", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_seller_address_idx" ON "purchase_requests"("seller_address");

-- CreateIndex
CREATE INDEX "purchase_requests_datapod_id_idx" ON "purchase_requests"("datapod_id");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_created_at_idx" ON "purchase_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_purchase_request_id_key" ON "reviews"("purchase_request_id");

-- CreateIndex
CREATE INDEX "reviews_datapod_id_idx" ON "reviews"("datapod_id");

-- CreateIndex
CREATE INDEX "reviews_buyer_address_idx" ON "reviews"("buyer_address");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_datapod_id_buyer_id_key" ON "reviews"("datapod_id", "buyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_stagings_datapod_id_key" ON "upload_stagings"("datapod_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_stagings_data_hash_key" ON "upload_stagings"("data_hash");

-- CreateIndex
CREATE INDEX "upload_stagings_seller_id_idx" ON "upload_stagings"("seller_id");

-- CreateIndex
CREATE INDEX "upload_stagings_expires_at_idx" ON "upload_stagings"("expires_at");

-- CreateIndex
CREATE INDEX "upload_stagings_status_idx" ON "upload_stagings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transactions_purchase_request_id_key" ON "escrow_transactions"("purchase_request_id");

-- CreateIndex
CREATE INDEX "escrow_transactions_seller_address_idx" ON "escrow_transactions"("seller_address");

-- CreateIndex
CREATE INDEX "escrow_transactions_buyer_address_idx" ON "escrow_transactions"("buyer_address");

-- CreateIndex
CREATE INDEX "escrow_transactions_status_idx" ON "escrow_transactions"("status");

-- CreateIndex
CREATE INDEX "escrow_transactions_created_at_idx" ON "escrow_transactions"("created_at");

-- CreateIndex
CREATE INDEX "transaction_audits_user_address_idx" ON "transaction_audits"("user_address");

-- CreateIndex
CREATE INDEX "transaction_audits_user_id_idx" ON "transaction_audits"("user_id");

-- CreateIndex
CREATE INDEX "transaction_audits_tx_type_idx" ON "transaction_audits"("tx_type");

-- CreateIndex
CREATE INDEX "transaction_audits_created_at_idx" ON "transaction_audits"("created_at");

-- AddForeignKey
ALTER TABLE "data_pods" ADD CONSTRAINT "data_pods_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_datapod_id_fkey" FOREIGN KEY ("datapod_id") REFERENCES "data_pods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_datapod_id_fkey" FOREIGN KEY ("datapod_id") REFERENCES "data_pods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_stagings" ADD CONSTRAINT "upload_stagings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_stagings" ADD CONSTRAINT "upload_stagings_datapod_id_fkey" FOREIGN KEY ("datapod_id") REFERENCES "data_pods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audits" ADD CONSTRAINT "transaction_audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audits" ADD CONSTRAINT "transaction_audits_datapod_id_fkey" FOREIGN KEY ("datapod_id") REFERENCES "data_pods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
